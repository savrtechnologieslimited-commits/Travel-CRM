/**
 * Flow runner.
 *
 * The single entry point `dispatchInboundToFlows` is called by the
 * WhatsApp webhook on every inbound message *for an account that has
 * opted into the Flows beta*. It decides whether the message belongs
 * to an active conversation flow (advance it) or matches the entry
 * trigger of an active flow (start a new run) — and reports back to
 * the webhook so the webhook knows whether to also fire automations.
 *
 * Architecture in a sentence: the runner walks the customer through
 * a DB-stored node graph, suspending only at nodes that need
 * customer input. Each tap or text reply wakes it back up.
 *
 * What lives here vs elsewhere:
 *   - Pure decision logic (which button matched, where to advance to,
 *     when to fallback) — here.
 *   - DB shape (table reads/writes) — here.
 *   - Meta API calls — `meta-send.ts` (engineSendInteractive*).
 *   - Policy resolution (reprompt vs handoff vs end) — `fallback.ts`.
 *   - Type definitions — `types.ts`.
 *
 * Concurrency model:
 *   - Idempotency on `meta_message_id`: the runner refuses to advance
 *     an active run twice for the same Meta message — protects against
 *     Meta's retries.
 *   - Optimistic UPDATE with `current_node_key` precondition: two
 *     simultaneous taps for the same run collide at the DB layer; the
 *     second is a no-op.
 *   - Partial unique index `idx_one_active_run_per_contact`: two
 *     simultaneous starts for the same contact collide; the second
 *     INSERT raises 23505 and the runner catches & exits.
 */

import { supabaseAdmin } from "./admin-client";
import {
  engineSendInteractiveButtons,
  engineSendInteractiveList,
  engineSendMedia,
  engineSendText,
} from "./meta-send";
import { decideFallback, resolveFallbackPolicy } from "./fallback";
import {
  formatCollectInputPrompt,
  isValidCollectInput,
} from "./input-validation";
import { addContactTagAndDispatch } from "@/lib/contacts/tag-events";
import { removeContactTag } from "@/lib/contacts/tag-write";
import {
  getCrmBridgeClient,
  type TravelDestination,
  type TravelFlowCompletionResult,
} from "@/lib/crm-bridge";
import {
  getFlowVariable,
  interpolateFlowVariables,
} from "./flow-vars";
import {
  CRM_DESTINATION_PAGE_SIZE,
  CRM_DESTINATION_RESULT_KEY,
  CRM_DESTINATION_STATE_KEY,
  CRM_ENQUIRY_ENABLED_KEY,
  getCrmDestinationPage,
  parseCrmDestinationPickerState,
  type CrmDestinationOption,
  type CrmDestinationPickerState,
} from "./crm-destination-picker";
import {
  type CollectInputNodeConfig,
  type ConditionNodeConfig,
  type CrmDestinationNodeConfig,
  type DispatchInboundInput,
  type DispatchInboundResult,
  type FlowNodeRow,
  type FlowRow,
  type FlowRunRow,
  type ParsedInbound,
  type SendButtonsNodeConfig,
  type SendListNodeConfig,
  type SendMediaNodeConfig,
  type SendMessageNodeConfig,
  type SetTagNodeConfig,
  type StartNodeConfig,
  type TravelCrmCompleteEnquiryNodeConfig,
  type TravelCrmGetDestinationNodeConfig,
  type TravelCrmGetDestinationsNodeConfig,
  type TravelCrmEnquiryField,
  type KeywordTriggerConfig,
} from "./types";

// ============================================================
// Pure helpers — extracted so engine.test.ts can exercise them
// without a Supabase / Meta mock.
// ============================================================

/**
 * Given a node + the customer's reply_id, return the next_node_key
 * to advance to, or `null` if no option matches.
 */
export function matchReplyId(
  node: { node_type: string; config: Record<string, unknown> },
  reply_id: string,
): string | null {
  if (node.node_type === "send_buttons") {
    const cfg = node.config as unknown as SendButtonsNodeConfig;
    const hit = cfg.buttons?.find((b) => b.reply_id === reply_id);
    return hit?.next_node_key ?? null;
  }
  if (node.node_type === "send_list") {
    const cfg = node.config as unknown as SendListNodeConfig;
    for (const section of cfg.sections ?? []) {
      const hit = section.rows?.find((r) => r.reply_id === reply_id);
      if (hit) return hit.next_node_key;
    }
    return null;
  }
  return null;
}

/**
 * Case-insensitive contains/exact match against a list of keywords.
 * Used by the trigger evaluator. Stable enough that the v3 builder
 * UI can preview matches by passing canned strings.
 */
export function matchesKeywordTrigger(
  text: string,
  cfg: KeywordTriggerConfig,
): boolean {
  if (!text || !cfg.keywords?.length) return false;
  const matchType = cfg.match_type ?? "contains";
  const haystack = cfg.case_sensitive ? text : text.toLowerCase();
  for (const raw of cfg.keywords) {
    if (!raw) continue;
    const needle = cfg.case_sensitive ? raw : raw.toLowerCase();
    if (matchType === "exact" ? haystack === needle : haystack.includes(needle)) {
      return true;
    }
  }
  return false;
}

/**
 * The strings an inbound message offers to a flow's *entry* trigger.
 *
 * Typed text offers itself. A button / list tap offers two: the visible
 * title — what the customer would have typed had the button not been
 * there — and the stable reply_id, because the automation engine's
 * `interactive_reply` trigger routes on the id, so an author moving a
 * menu into a flow reaches for the same value.
 *
 * Matching the id does mean a keyword that happens to be a substring of
 * an id can fire (ids are author-controlled slugs, defaulting to
 * `btn_1`). That is the same substring semantic keyword triggers
 * already have for typed text, and the alternative — ignoring the id —
 * silently breaks the author who keyed on it.
 */
export function entryTriggerTexts(message: ParsedInbound): string[] {
  if (message.kind === "text") return [message.text];
  return [...new Set([message.reply_title, message.reply_id])].filter(
    (v): v is string => Boolean(v && v.trim()),
  );
}

/** Nodes that advance to a next_node_key without waiting for input. */
export function isAutoAdvancing(node_type: string): boolean {
  return (
    node_type === "start" ||
    node_type === "send_message" ||
    node_type === "send_media" ||
    node_type === "condition" ||
    node_type === "set_tag" ||
    node_type === "crm_get_destinations" ||
    node_type === "crm_get_destination" ||
    node_type === "crm_complete_enquiry"
  );
}

/** Nodes that send a prompt and suspend awaiting a customer reply. */
export function isSuspending(node_type: string): boolean {
  return (
    node_type === "send_buttons" ||
    node_type === "send_list" ||
    node_type === "crm_destination" ||
    node_type === "collect_input"
  );
}

/** Nodes that end the run. */
export function isTerminal(node_type: string): boolean {
  return node_type === "handoff" || node_type === "end";
}

/**
 * Evaluate a `condition` node's predicate against the current run
 * state. Exported pure for unit testing — the engine wraps it with a
 * DB lookup for `tag` / `contact_field` subjects.
 */
export function evaluateConditionPredicate(args: {
  operator: ConditionNodeConfig["operator"];
  /**
   * Resolved value of the subject. `undefined` means the subject is
   * absent (no var with that key / no such tag / contact field is
   * null). Pure function: caller does the DB lookup.
   */
  subjectValue: string | undefined;
  /** The configured comparison value, when applicable. */
  configValue: string | undefined;
}): boolean {
  switch (args.operator) {
    case "present":
      return args.subjectValue !== undefined && args.subjectValue !== "";
    case "absent":
      return args.subjectValue === undefined || args.subjectValue === "";
    case "equals":
      if (args.subjectValue === undefined) return false;
      return args.subjectValue === (args.configValue ?? "");
    case "contains":
      if (args.subjectValue === undefined) return false;
      return args.subjectValue.includes(args.configValue ?? "");
  }
}

// ============================================================
// DB I/O — wrapped in tiny helpers so the dispatch flow stays
// readable. Errors surface as thrown — the entry point catches.
// ============================================================

type AdminClient = ReturnType<typeof supabaseAdmin>;

async function loadActiveRunForContact(
  db: AdminClient,
  accountId: string,
  contactId: string,
): Promise<FlowRunRow | null> {
  // The partial unique index `idx_one_active_run_per_contact` was
  // rebuilt in migration 017 over `(account_id, contact_id)` — so
  // "two active runs for one contact in one account" is impossible
  // by design. But a future migration glitch or manual SQL could
  // create one, and .maybeSingle() throws on >1 row — which would
  // kill dispatch for that contact's webhook entirely. .limit(1) is
  // forgiving: pick the newest, let the cron sweep clean up the
  // stale one.
  const { data, error } = await db
    .from("flow_runs")
    .select("*")
    .eq("account_id", accountId)
    .eq("contact_id", contactId)
    .eq("status", "active")
    .order("started_at", { ascending: false })
    .limit(1);
  if (error) {
    console.error("[flows] loadActiveRunForContact error:", error.message);
    return null;
  }
  const rows = (data as FlowRunRow[] | null) ?? [];
  return rows[0] ?? null;
}

async function loadFlow(
  db: AdminClient,
  flowId: string,
): Promise<FlowRow | null> {
  const { data, error } = await db
    .from("flows")
    .select("*")
    .eq("id", flowId)
    .maybeSingle();
  if (error) {
    console.error("[flows] loadFlow error:", error.message);
    return null;
  }
  return (data as FlowRow | null) ?? null;
}

/**
 * Load every node of a flow in one round trip and key them by
 * `node_key`. The advance loop is then in-memory — a 5-node
 * auto-advancing chain costs one SELECT, not five.
 *
 * Returns an empty map on error so the caller can still dispatch
 * cleanly (every subsequent .get() returns undefined → the run
 * fails with node_not_found, same as the old per-node lookup).
 */
async function loadAllNodes(
  db: AdminClient,
  flowId: string,
): Promise<Map<string, FlowNodeRow>> {
  const { data, error } = await db
    .from("flow_nodes")
    .select("*")
    .eq("flow_id", flowId);
  if (error) {
    console.error("[flows] loadAllNodes error:", error.message);
    return new Map();
  }
  const map = new Map<string, FlowNodeRow>();
  for (const row of (data ?? []) as FlowNodeRow[]) {
    map.set(row.node_key, row);
  }
  return map;
}

async function logEvent(
  db: AdminClient,
  flowRunId: string,
  event_type:
    | "started"
    | "node_entered"
    | "message_sent"
    | "reply_received"
    | "fallback_fired"
    | "handoff"
    | "timeout"
    | "error"
    | "completed",
  node_key: string | null,
  payload: Record<string, unknown> = {},
): Promise<void> {
  const { error } = await db.from("flow_run_events").insert({
    flow_run_id: flowRunId,
    event_type,
    node_key,
    payload,
  });
  if (error) {
    // Logging failure is non-fatal — surface but don't throw.
    console.error("[flows] logEvent error:", error.message);
  }
}

/**
 * Idempotency check — has a `reply_received` event with this Meta
 * message_id already been recorded for any of the contact's flow
 * runs? If yes, the inbound is a duplicate (Meta retry) and we
 * exit without re-advancing.
 *
 * Implementation note: scoped to runs belonging to this user/contact
 * so the lookup is cheap (the index on flow_run_events(flow_run_id,
 * event_type) plus the small set of runs per contact).
 */
async function isDuplicateInbound(
  db: AdminClient,
  accountId: string,
  contactId: string,
  metaMessageId: string,
): Promise<boolean> {
  // Fetch ALL run ids for this contact in this account (active +
  // historical). Bounded by how many flows the customer has been
  // through — small.
  const { data: runs } = await db
    .from("flow_runs")
    .select("id")
    .eq("account_id", accountId)
    .eq("contact_id", contactId);
  if (!runs?.length) return false;
  const runIds = runs.map((r) => (r as { id: string }).id);

  const { count } = await db
    .from("flow_run_events")
    .select("id", { count: "exact", head: true })
    .in("flow_run_id", runIds)
    .eq("event_type", "reply_received")
    .filter("payload->>meta_message_id", "eq", metaMessageId);
  return (count ?? 0) > 0;
}

async function findEntryFlow(
  db: AdminClient,
  accountId: string,
  message: ParsedInbound,
  isFirstInbound: boolean,
): Promise<FlowRow | null> {
  // A tap used to be rejected outright here, on the reasoning that
  // interactive replies are responses to existing prompts. That holds
  // only while a prompt is outstanding — and this function runs solely
  // when the contact has NO active run, so there is nothing the tap
  // could be answering. What it actually blocked was issue #490: an
  // *automation* sends the buttons, the customer taps one, and the flow
  // whose keyword matches that button never starts. Retyping the label
  // by hand worked, which is the tell — same words, different envelope.
  const candidates = entryTriggerTexts(message);

  // Pull all active flows for this account. Active set is bounded
  // (the builder discourages double-trigger overlap; partial index
  // makes the lookup index-supported).
  const { data: flows, error } = await db
    .from("flows")
    .select("*")
    .eq("account_id", accountId)
    .eq("status", "active")
    .order("created_at", { ascending: true });
  if (error || !flows) return null;

  const typed = flows as FlowRow[];
  for (const flow of typed) {
    if (flow.trigger_type === "keyword") {
      const cfg = flow.trigger_config as KeywordTriggerConfig;
      if (candidates.some((text) => matchesKeywordTrigger(text, cfg))) {
        return flow;
      }
    } else if (flow.trigger_type === "first_inbound_message" && isFirstInbound) {
      // Also reachable by a tap now: a broadcast template with a
      // quick-reply button can genuinely be what prompts a contact's
      // first-ever inbound. The automations dispatcher has always
      // treated a tap that way (the webhook pushes
      // `first_inbound_message` regardless of envelope) — flows were
      // the inconsistent half.
      return flow;
    }
    // 'manual' triggers do not auto-start from inbound messages.
  }
  return null;
}

// ============================================================
// Node executors — each handles ONE node type. send_buttons and
// send_list also persist `last_prompt_message_id` so the inbox
// thread can quote the prompt the customer is replying to.
// ============================================================

async function sendButtonsAndSuspend(
  db: AdminClient,
  run: FlowRunRow,
  node: FlowNodeRow,
): Promise<{ outcome: "advanced"; node_key: string }> {
  const cfg = node.config as unknown as SendButtonsNodeConfig;
  // Every customer-visible string is interpolated against run.vars —
  // same treatment send_message / collect_input already get (#553).
  // `reply_id` is deliberately NOT interpolated: it is the routing key
  // matchReplyId compares the tapped button against, so it must reach
  // Meta byte-for-byte as authored. Interpolation can push a title past
  // Meta's 20-char cap; meta-api's validator throws a descriptive error
  // and the caller logs it — we never truncate silently.
  const { whatsapp_message_id } = await engineSendInteractiveButtons({
    accountId: run.account_id,
    userId: run.user_id,
    conversationId: run.conversation_id!,
    contactId: run.contact_id!,
    bodyText: interpolateVars(cfg.text, run.vars),
    headerText: interpolateOptionalVars(cfg.header_text, run.vars),
    footerText: interpolateOptionalVars(cfg.footer_text, run.vars),
    buttons: cfg.buttons.map((b) => ({
      id: b.reply_id,
      title: interpolateVars(b.title, run.vars),
    })),
  });
  await logEvent(db, run.id, "message_sent", node.node_key, {
    node_type: "send_buttons",
    whatsapp_message_id,
  });
  // Look up our internal message id so we can stash it on the run.
  // Cheap — indexed on `messages.message_id`.
  const { data: msg } = await db
    .from("messages")
    .select("id")
    .eq("message_id", whatsapp_message_id)
    .maybeSingle();
  await db
    .from("flow_runs")
    .update({
      last_prompt_message_id: (msg as { id: string } | null)?.id ?? null,
    })
    .eq("id", run.id);
  return { outcome: "advanced", node_key: node.node_key };
}

async function sendListAndSuspend(
  db: AdminClient,
  run: FlowRunRow,
  node: FlowNodeRow,
): Promise<{ outcome: "advanced"; node_key: string }> {
  const cfg = node.config as unknown as SendListNodeConfig;
  let sections: Array<{
    title?: string;
    rows: Array<{ id: string; title: string; description?: string }>;
  }> = (cfg.sections ?? []).map((section) => ({
    title: interpolateOptionalVars(section.title, run.vars),
    rows: section.rows.map((row) => ({
      id: row.reply_id,
      title: interpolateVars(row.title, run.vars),
      description: interpolateOptionalVars(row.description, run.vars),
    })),
  }));
  if (cfg.dynamic_source_var?.trim()) {
    const pages = readDynamicListPages(run.vars);
    const page = pages[node.node_key] ?? 0;
    const dynamicPage = buildDynamicListPage(cfg, run.vars, page);
    pages[node.node_key] = dynamicPage.page;
    run.vars = { ...run.vars, __flow_dynamic_list_pages: pages };
    sections = [{ title: undefined, rows: dynamicPage.rows }];
  }
  // See sendButtonsAndSuspend — interpolate every visible string,
  // never the row `reply_id`.
  const { whatsapp_message_id } = await engineSendInteractiveList({
    accountId: run.account_id,
    userId: run.user_id,
    conversationId: run.conversation_id!,
    contactId: run.contact_id!,
    bodyText: interpolateVars(cfg.text, run.vars),
    buttonLabel: interpolateVars(cfg.button_label, run.vars),
    headerText: interpolateOptionalVars(cfg.header_text, run.vars),
    footerText: interpolateOptionalVars(cfg.footer_text, run.vars),
    sections,
  });
  await logEvent(db, run.id, "message_sent", node.node_key, {
    node_type: "send_list",
    whatsapp_message_id,
  });
  const { data: msg } = await db
    .from("messages")
    .select("id")
    .eq("message_id", whatsapp_message_id)
    .maybeSingle();
  await db
    .from("flow_runs")
    .update({
      last_prompt_message_id: (msg as { id: string } | null)?.id ?? null,
    })
    .eq("id", run.id);
  return { outcome: "advanced", node_key: node.node_key };
}

const DYNAMIC_LIST_PAGE_SIZE = 8;
const DYNAMIC_LIST_PREVIOUS_ID = "__flow_dynamic_list_previous";
const DYNAMIC_LIST_NEXT_ID = "__flow_dynamic_list_next";

type DynamicListItem = {
  source: Record<string, unknown>;
  replyId: string;
};

function readDynamicListPages(
  vars: Record<string, unknown>,
): Record<string, number> {
  const value = vars.__flow_dynamic_list_pages;
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      ([key, page]) => key.length > 0 && Number.isInteger(page) && page >= 0,
    ),
  );
}

function getDynamicListItems(
  cfg: SendListNodeConfig,
  vars: Record<string, unknown>,
): DynamicListItem[] {
  const source = cfg.dynamic_source_var
    ? getFlowVariable(vars, cfg.dynamic_source_var)
    : undefined;
  if (!Array.isArray(source)) {
    throw new Error("Dynamic list source is missing or is not an array.");
  }
  const items = source.map((raw, index): DynamicListItem => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error(`Dynamic list item ${index + 1} is invalid.`);
    }
    const item = raw as Record<string, unknown>;
    const replyId = getFlowVariable(item, cfg.dynamic_reply_id_field ?? "");
    const title = getFlowVariable(item, cfg.dynamic_title_field ?? "");
    if (
      typeof replyId !== "string" ||
      !replyId.trim() ||
      replyId.length > 200 ||
      replyId === DYNAMIC_LIST_PREVIOUS_ID ||
      replyId === DYNAMIC_LIST_NEXT_ID ||
      typeof title !== "string" ||
      !title.trim()
    ) {
      throw new Error(`Dynamic list item ${index + 1} has invalid display data.`);
    }
    return { source: item, replyId };
  });
  if (new Set(items.map(({ replyId }) => replyId)).size !== items.length) {
    throw new Error("Dynamic list items contain duplicate reply IDs.");
  }
  if (items.length === 0) {
    throw new Error("Dynamic list source contains no options.");
  }
  return items;
}

function buildDynamicListPage(
  cfg: SendListNodeConfig,
  vars: Record<string, unknown>,
  requestedPage: number,
): { page: number; rows: Array<{ id: string; title: string; description?: string }> } {
  const items = getDynamicListItems(cfg, vars);
  const lastPage = Math.max(
    0,
    Math.ceil(items.length / DYNAMIC_LIST_PAGE_SIZE) - 1,
  );
  const page = Math.min(Math.max(0, Math.floor(requestedPage)), lastPage);
  const start = page * DYNAMIC_LIST_PAGE_SIZE;
  const rows = items
    .slice(start, start + DYNAMIC_LIST_PAGE_SIZE)
    .map(({ source, replyId }) => {
      const title = getFlowVariable(source, cfg.dynamic_title_field ?? "");
      const description = cfg.dynamic_description_field
        ? getFlowVariable(source, cfg.dynamic_description_field)
        : undefined;
      return {
        id: replyId,
        title: String(title).trim().slice(0, 24),
        ...(typeof description === "string" && description.trim()
          ? { description: description.trim().slice(0, 72) }
          : {}),
      };
    });
  if (page > 0) {
    rows.unshift({
      id: DYNAMIC_LIST_PREVIOUS_ID,
      title: "Previous",
      description: "Previous options",
    });
  }
  if (page < lastPage) {
    rows.push({
      id: DYNAMIC_LIST_NEXT_ID,
      title: "More options",
      description: "Next options",
    });
  }
  return { page, rows };
}

async function loadCrmDestinationOptions(
  scope: CrmDestinationNodeConfig["scope"] = "both",
): Promise<CrmDestinationOption[]> {
  const bridge = getCrmBridgeClient();
  const scopes =
    scope === "both" || !scope
      ? (["domestic", "international"] as const)
      : ([scope] as const);
  const results = await Promise.all(scopes.map((item) => bridge.getDestinations(item)));
  const options = results
    .flat()
    .filter((destination) => destination.name.trim().length > 0)
    .map(({ id, name, scope }) => ({ id, name, scope }));
  options.sort((left, right) => left.name.localeCompare(right.name));
  return options;
}

async function storeLastPromptMessage(
  db: AdminClient,
  runId: string,
  whatsappMessageId: string,
): Promise<void> {
  const { data: message, error: selectError } = await db
    .from("messages")
    .select("id")
    .eq("message_id", whatsappMessageId)
    .maybeSingle();
  if (selectError) throw selectError;
  const { error: updateError } = await db
    .from("flow_runs")
    .update({
      last_prompt_message_id: (message as { id: string } | null)?.id ?? null,
    })
    .eq("id", runId);
  if (updateError) throw updateError;
}

async function notifyCrmIntegrationFailure(
  db: AdminClient,
  run: FlowRunRow,
  message: string,
  reason: string,
): Promise<void> {
  try {
    await engineSendText({
      accountId: run.account_id,
      userId: run.user_id,
      conversationId: run.conversation_id!,
      contactId: run.contact_id!,
      text: message,
    });
  } catch (err) {
    await logEvent(db, run.id, "error", run.current_node_key, {
      reason: `${reason}_notice_failed`,
      detail: err instanceof Error ? err.message : String(err),
    });
  }
}

async function sendCrmDestinationPage(
  db: AdminClient,
  run: FlowRunRow,
  node: FlowNodeRow,
  state: CrmDestinationPickerState,
  promptOverride?: string,
): Promise<void> {
  const cfg = node.config as unknown as CrmDestinationNodeConfig;
  const { page, rows } = getCrmDestinationPage(state.options, state.page);
  if (rows.length === 0 || rows.length > 10 || rows.length > CRM_DESTINATION_PAGE_SIZE + 2) {
    throw new Error("Travel CRM returned no destinations for the selected page.");
  }
  const { whatsapp_message_id } = await engineSendInteractiveList({
    accountId: run.account_id,
    userId: run.user_id,
    conversationId: run.conversation_id!,
    contactId: run.contact_id!,
    bodyText: interpolateVars(promptOverride ?? cfg.prompt_text, run.vars),
    buttonLabel: interpolateVars(cfg.button_label, run.vars),
    sections: [
      {
        title: "Destinations",
        rows,
      },
    ],
  });
  await storeLastPromptMessage(db, run.id, whatsapp_message_id);
  state.page = page;
}

async function persistCrmDestinationPickerState(
  db: AdminClient,
  run: FlowRunRow,
  state: CrmDestinationPickerState,
  nodeKey?: string,
): Promise<boolean> {
  const vars = { ...run.vars, [CRM_DESTINATION_STATE_KEY]: state };
  if (nodeKey) {
    const advanced = await advanceCurrentNodeKey(
      db,
      run.id,
      run.current_node_key,
      nodeKey,
      vars,
    );
    if (advanced) run.current_node_key = nodeKey;
    if (advanced) run.vars = vars;
    return advanced;
  }
  const { error } = await db
    .from("flow_runs")
    .update({ vars, reprompt_count: 0 })
    .eq("id", run.id)
    .eq("status", "active");
  if (error) throw error;
  run.vars = vars;
  run.reprompt_count = 0;
  return true;
}

async function sendCrmDestinationPickerAndSuspend(
  db: AdminClient,
  run: FlowRunRow,
  node: FlowNodeRow,
): Promise<void> {
  const cfg = node.config as unknown as CrmDestinationNodeConfig;
  const options = await loadCrmDestinationOptions(cfg.scope);
  if (options.length === 0) {
    throw new Error("Travel CRM has no active destinations for this travel type.");
  }
  const state: CrmDestinationPickerState = { enabled: true, options, page: 0 };
  await sendCrmDestinationPage(db, run, node, state);
  const advanced = await persistCrmDestinationPickerState(
    db,
    run,
    state,
    node.node_key,
  );
  if (!advanced) {
    await logEvent(db, run.id, "error", node.node_key, {
      reason: "lost_race_during_crm_destination_suspend",
    });
  }
  await logEvent(db, run.id, "message_sent", node.node_key, {
    node_type: "crm_destination",
    destination_count: options.length,
    page: state.page,
  });
}

async function submitCrmFlowCompletion(
  db: AdminClient,
  run: FlowRunRow,
  isPartial = false,
  handoffRequested = false,
  inputMapping?: Partial<Record<TravelCrmEnquiryField, string>>,
  force = false,
): Promise<TravelFlowCompletionResult | null> {
  if (!force && run.vars[CRM_ENQUIRY_ENABLED_KEY] !== true) return null;
  if (!run.contact_id) {
    throw new Error("The Travel CRM enquiry has no WACRM contact.");
  }

  const [flowResult, contactResult] = await Promise.all([
    db.from("flows").select("name").eq("id", run.flow_id).maybeSingle(),
    db.from("contacts").select("id,name,email,phone").eq("id", run.contact_id).maybeSingle(),
  ]);
  if (flowResult.error) throw flowResult.error;
  if (contactResult.error) throw contactResult.error;
  if (!flowResult.data || !contactResult.data) {
    throw new Error("Could not load the flow and contact for the Travel CRM enquiry.");
  }
  const answers = Object.fromEntries(
    Object.entries(run.vars).filter(
      ([key]) =>
        key !== CRM_DESTINATION_STATE_KEY &&
        key !== CRM_DESTINATION_RESULT_KEY &&
        key !== CRM_ENQUIRY_ENABLED_KEY &&
        key !== "__flow_dynamic_list_pages",
    ),
  );
  for (const [field, path] of Object.entries(inputMapping ?? {})) {
    if (!path) continue;
    const value = getFlowVariable(run.vars, path);
    if (value !== undefined && value !== null) answers[field] = value;
  }
  if (!answers.whatsapp_number && contactResult.data.phone) {
    answers.whatsapp_number = contactResult.data.phone;
  }
  if (run.conversation_id) answers.conversation_id = run.conversation_id;
  const rawDestination =
    run.vars[CRM_DESTINATION_RESULT_KEY] ??
    (typeof answers.destination_id === "string"
      ? {
          id: answers.destination_id,
          name:
            typeof answers.destination_name === "string"
              ? answers.destination_name
              : answers.destination_id,
          scope:
            answers.travel_type === "international"
              ? "international"
              : "domestic",
          assignment_status: answers.assigned_employee_id
            ? "assigned"
            : "unassigned",
          assigned_employee_id:
            typeof answers.assigned_employee_id === "string"
              ? answers.assigned_employee_id
              : null,
        }
      : null);
  if (
    rawDestination !== undefined &&
    rawDestination !== null &&
    (!rawDestination || typeof rawDestination !== "object" || Array.isArray(rawDestination))
  ) {
    throw new Error("The selected Travel CRM destination data is invalid.");
  }
  let destination: TravelDestination | null = null;
  if (rawDestination) {
    const selected = rawDestination as Record<string, unknown>;
    if (
      typeof selected.id !== "string" ||
      typeof selected.name !== "string" ||
      (selected.scope !== "domestic" && selected.scope !== "international") ||
      selected.assignment_status !== "assigned" ||
      typeof selected.assigned_employee_id !== "string"
    ) {
      throw new Error("The selected Travel CRM destination data is invalid.");
    }
    destination = {
      id: selected.id,
      name: selected.name,
      scope: selected.scope,
      pdf: null,
      assignment_status: selected.assignment_status as TravelDestination["assignment_status"],
      assigned_employee_id: selected.assigned_employee_id,
    };
  }
  const contact = contactResult.data as {
    id: string;
    name: string | null;
    email: string | null;
    phone: string | null;
  };
  if (!contact.email?.trim() && !contact.phone?.trim()) {
    throw new Error("Travel CRM requires a customer phone number or email address.");
  }
  const rawTravelDate =
    typeof answers.travel_date === "string" ? answers.travel_date.trim() : "";
  const rawBudget = typeof answers.budget === "string" ? answers.budget.trim() : "";
  const normalizedDate = normalizeTravelDate(rawTravelDate);
  if (normalizedDate) answers.__wacrm_travel_date_iso = normalizedDate;
  const budgetMatch = rawBudget.match(/\d[\d,]*(?:\.\d{1,2})?/);
  if (budgetMatch) {
    const amount = budgetMatch[0].replaceAll(",", "");
    if (/^\d{1,12}(?:\.\d{1,2})?$/.test(amount)) {
      answers.__wacrm_budget_amount = amount;
      answers.__wacrm_budget_currency = inferBudgetCurrency(rawBudget);
    }
  }
  return getCrmBridgeClient().completeFlow({
    version: 1,
    flow_run_id: run.id,
    flow_id: run.flow_id,
    wacrm_contact_id: contact.id,
    wacrm_conversation_id: run.conversation_id,
    flow_name: flowResult.data.name,
    completed_at: new Date().toISOString(),
    is_partial: isPartial,
    handoff_requested: handoffRequested,
    contact: {
      name:
        typeof answers.customer_name === "string" &&
        answers.customer_name.trim()
          ? answers.customer_name.trim()
          : contact.name,
      email: contact.email,
      phone: contact.phone,
    },
    destination: destination
      ? {
          id: destination.id,
          name: destination.name,
          scope: destination.scope,
          assignment_status: destination.assignment_status,
          assigned_employee_id: destination.assigned_employee_id,
        }
      : null,
    answers,
  });
}

function normalizeTravelDate(value: string): string | null {
  let parts: [number, number, number] | null = null;
  const iso = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const dmy = value.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  const dayMonthName = value.match(
    /^(\d{1,2})(?:st|nd|rd|th)?[\s,-]+([a-z]+)[\s,-]+(\d{4})$/i,
  );
  const monthNameDay = value.match(
    /^([a-z]+)[\s,-]+(\d{1,2})(?:st|nd|rd|th)?[\s,-]+(\d{4})$/i,
  );
  if (iso) {
    parts = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  } else if (dmy) {
    parts = [Number(dmy[3]), Number(dmy[2]), Number(dmy[1])];
  } else if (dayMonthName || monthNameDay) {
    const match = dayMonthName ?? monthNameDay!;
    const monthText = dayMonthName ? match[2] : match[1];
    const month = monthNumber(monthText);
    if (!month) return null;
    parts = [
      Number(match[3]),
      month,
      Number(dayMonthName ? match[1] : match[2]),
    ];
  }
  if (!parts) return null;
  const [year, month, day] = parts;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function monthNumber(value: string): number | null {
  const months = [
    ["january", "jan"],
    ["february", "feb"],
    ["march", "mar"],
    ["april", "apr"],
    ["may"],
    ["june", "jun"],
    ["july", "jul"],
    ["august", "aug"],
    ["september", "sep", "sept"],
    ["october", "oct"],
    ["november", "nov"],
    ["december", "dec"],
  ];
  const index = months.findIndex((names) =>
    names.includes(value.toLowerCase()),
  );
  return index < 0 ? null : index + 1;
}

function inferBudgetCurrency(value: string): string {
  const currencyCode = value.match(/\b([A-Z]{3})\b/i)?.[1]?.toUpperCase();
  if (currencyCode) return currencyCode;
  if (value.includes("₹")) return "INR";
  if (value.includes("€")) return "EUR";
  if (value.includes("£")) return "GBP";
  if (value.includes("$")) return "USD";
  return "INR";
}

async function submitCrmFlowCompletionOrFail(
  db: AdminClient,
  run: FlowRunRow,
  isPartial = false,
  handoffRequested = false,
): Promise<boolean> {
  try {
    await submitCrmFlowCompletion(db, run, isPartial, handoffRequested);
    return true;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("[flows] Travel CRM completion submission failed:", detail);
    await logEvent(db, run.id, "error", run.current_node_key, {
      reason: "crm_completion_submit_failed",
      detail,
    });
    await notifyCrmIntegrationFailure(
      db,
      run,
      "We couldn't save your travel enquiry just now. Please contact our team so we can follow up.",
      "crm_completion_submit_failed",
    );
    await endRun(db, run.id, "failed", "crm_completion_submit_failed");
    return false;
  }
}

async function submitCrmFlowSnapshotBestEffort(
  db: AdminClient,
  run: FlowRunRow,
): Promise<void> {
  try {
    await submitCrmFlowCompletion(db, run, true);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("[flows] Travel CRM partial enquiry sync failed:", detail);
    await logEvent(db, run.id, "error", run.current_node_key, {
      reason: "crm_partial_submit_failed",
      detail,
    });
  }
}

async function executeHandoff(
  db: AdminClient,
  run: FlowRunRow,
  node: FlowNodeRow,
): Promise<boolean> {
  const cfg = node.config as {
    assign_to?: string;
    assign_to_var?: string;
    note?: string;
  };
  if (!(await submitCrmFlowCompletionOrFail(db, run, true, true))) return false;
  const configuredAssignee = cfg.assign_to_var
    ? getFlowVariable(run.vars, cfg.assign_to_var)
    : undefined;
  const assignee =
    resolveFlowHandoffAssignee(run) ??
    (typeof configuredAssignee === "string" ? configuredAssignee : undefined) ??
    cfg.assign_to;
  const convUpdate: Record<string, unknown> = {
    status: "pending",
    updated_at: new Date().toISOString(),
  };
  if (assignee) convUpdate.assigned_agent_id = assignee;
  if (run.conversation_id) {
    await db
      .from("conversations")
      .update(convUpdate)
      .eq("id", run.conversation_id);
  }
  await logEvent(db, run.id, "handoff", node.node_key, {
    note: cfg.note ?? null,
    assigned_to: assignee ?? null,
  });
  await endRun(db, run.id, "handed_off", "handoff_node");
  return true;
}

function resolveFlowHandoffAssignee(run: FlowRunRow): string | undefined {
  const selectedAssignee = run.vars.selected_assigned_employee_id;
  if (typeof selectedAssignee === "string" && selectedAssignee.trim()) {
    return selectedAssignee;
  }
  const destination = run.vars[CRM_DESTINATION_RESULT_KEY];
  const destinationAssignee =
    destination && typeof destination === "object" && !Array.isArray(destination)
      ? (destination as Record<string, unknown>).assigned_employee_id
      : getFlowVariable(run.vars, "destination.assigned_employee_id");
  return typeof destinationAssignee === "string" &&
    destinationAssignee.trim()
    ? destinationAssignee
    : undefined;
}

/**
 * Resolve a condition node's subject value from DB / run state, then
 * call the pure `evaluateConditionPredicate`. Splits out so the
 * predicate itself stays unit-testable without a Supabase mock.
 *
 * Subject sources:
 *   - `var` → `flow_runs.vars[subject_key]` (captured by collect_input
 *     or http_fetch in v2).
 *   - `tag` → present iff `contact_tags(contact_id, tag_id)` exists.
 *     `subject_key` IS the tag UUID; the SELECT returns 1 row or 0.
 *   - `contact_field` → one of name/email/phone/company on `contacts`.
 */
async function evaluateConditionNode(
  db: AdminClient,
  run: FlowRunRow,
  cfg: ConditionNodeConfig,
): Promise<boolean> {
  let subjectValue: string | undefined;
  if (cfg.subject === "var") {
    const v = run.vars[cfg.subject_key];
    subjectValue = typeof v === "string" ? v : v === undefined ? undefined : String(v);
  } else if (cfg.subject === "tag") {
    const { count } = await db
      .from("contact_tags")
      .select("contact_id", { count: "exact", head: true })
      .eq("contact_id", run.contact_id!)
      .eq("tag_id", cfg.subject_key);
    // For tags, "present" really is the only meaningful test — the
    // `present`/`absent` operators are the natural fit. equals/contains
    // against a tag UUID would still work mechanically (compare its
    // existence to the value).
    subjectValue = (count ?? 0) > 0 ? cfg.subject_key : undefined;
  } else {
    const ALLOWED = ["name", "email", "phone", "company"] as const;
    type AllowedField = (typeof ALLOWED)[number];
    if (!ALLOWED.includes(cfg.subject_key as AllowedField)) {
      throw new Error(`unsupported contact_field: ${cfg.subject_key}`);
    }
    const { data } = await db
      .from("contacts")
      .select(cfg.subject_key)
      .eq("id", run.contact_id!)
      .maybeSingle();
    const raw = (data as Record<string, unknown> | null)?.[cfg.subject_key];
    subjectValue = typeof raw === "string" && raw.length > 0 ? raw : undefined;
  }
  return evaluateConditionPredicate({
    operator: cfg.operator,
    subjectValue,
    configValue: cfg.value,
  });
}

/**
 * Tiny `{{vars.foo}}` interpolation. Used by send_message + collect_input
 * prompt text so a captured `name` can show up in the next prompt
 * ("Thanks {{vars.name}}, what's your email?"). Missing vars render as
 * empty string — the same behavior as the automations engine.
 */
function interpolateVars(template: string, vars: Record<string, unknown>): string {
  return template ? interpolateFlowVariables(template, vars) : "";
}

/**
 * `interpolateVars` for optional config fields (header_text, footer_text,
 * list section titles, row descriptions). An absent field stays absent
 * — `interpolateVars(undefined)` would return "" and meta-api treats
 * header/footer/description by truthiness, so "" is harmless there, but
 * keeping `undefined` means the payload we log and send matches what
 * the author configured rather than sprouting empty strings.
 */
function interpolateOptionalVars(
  template: string | undefined,
  vars: Record<string, unknown>,
): string | undefined {
  return template === undefined || template === null
    ? undefined
    : interpolateVars(template, vars);
}

async function endRun(
  db: AdminClient,
  runId: string,
  status: "completed" | "handed_off" | "timed_out" | "failed",
  reason: string,
): Promise<void> {
  await db
    .from("flow_runs")
    .update({
      status,
      ended_at: new Date().toISOString(),
      end_reason: reason,
    })
    .eq("id", runId);
}

// ============================================================
// The synchronous advance loop. Walks through auto-advance nodes
// until it hits one that suspends (send_buttons/send_list/crm_destination) or
// terminates (handoff/end). Each suspending node persists the
// new current_node_key before returning.
// ============================================================

async function advanceFromNodeKey(
  db: AdminClient,
  run: FlowRunRow,
  startNodeKey: string,
  nodes: Map<string, FlowNodeRow>,
): Promise<{ outcome: "advanced" | "completed" | "handed_off" }> {
  let currentKey: string | null = startNodeKey;
  // Defensive cap — if a flow has a cycle (which the validator
  // SHOULD catch but doesn't yet in v1), we bail rather than loop.
  for (let safety = 0; safety < 64; safety += 1) {
    if (!currentKey) {
      await logEvent(db, run.id, "error", null, {
        reason: "next_node_key was null mid-advance",
      });
      await endRun(db, run.id, "failed", "missing_next_node");
      return { outcome: "completed" };
    }
    const node: FlowNodeRow | null = nodes.get(currentKey) ?? null;
    if (!node) {
      await logEvent(db, run.id, "error", currentKey, {
        reason: "node_not_found",
      });
      await endRun(db, run.id, "failed", "node_not_found");
      return { outcome: "completed" };
    }
    await logEvent(db, run.id, "node_entered", node.node_key, {
      node_type: node.node_type,
    });

    if (node.node_type === "start") {
      currentKey = (node.config as unknown as StartNodeConfig).next_node_key;
      continue;
    }
    if (node.node_type === "send_message") {
      const cfg = node.config as unknown as SendMessageNodeConfig;
      try {
        const { whatsapp_message_id } = await engineSendText({
          accountId: run.account_id,
    userId: run.user_id,
          conversationId: run.conversation_id!,
          contactId: run.contact_id!,
          text: interpolateVars(cfg.text, run.vars),
        });
        await logEvent(db, run.id, "message_sent", node.node_key, {
          node_type: "send_message",
          whatsapp_message_id,
        });
      } catch (err) {
        await logEvent(db, run.id, "error", node.node_key, {
          reason: "send_text_failed",
          detail: err instanceof Error ? err.message : String(err),
        });
        await endRun(db, run.id, "failed", "send_text_failed");
        return { outcome: "completed" };
      }
      currentKey = cfg.next_node_key;
      continue;
    }
    if (node.node_type === "send_media") {
      const cfg = node.config as unknown as SendMediaNodeConfig;
      const mediaUrl = interpolateVars(cfg.media_url, run.vars).trim();
      if (!mediaUrl && cfg.skip_if_empty === true) {
        await logEvent(db, run.id, "node_entered", node.node_key, {
          node_type: "send_media",
          skipped: true,
          reason: "media_url_unavailable",
        });
        currentKey = cfg.next_node_key;
        continue;
      }
      try {
        const { whatsapp_message_id } = await engineSendMedia({
          accountId: run.account_id,
    userId: run.user_id,
          conversationId: run.conversation_id!,
          contactId: run.contact_id!,
          kind: cfg.media_type,
          link: mediaUrl,
          caption: cfg.caption
            ? interpolateVars(cfg.caption, run.vars)
            : undefined,
          filename: cfg.filename,
        });
        await logEvent(db, run.id, "message_sent", node.node_key, {
          node_type: "send_media",
          media_type: cfg.media_type,
          whatsapp_message_id,
        });
      } catch (err) {
        await logEvent(db, run.id, "error", node.node_key, {
          reason: "send_media_failed",
          detail: err instanceof Error ? err.message : String(err),
        });
        await endRun(db, run.id, "failed", "send_media_failed");
        return { outcome: "completed" };
      }
      currentKey = cfg.next_node_key;
      continue;
    }
    if (node.node_type === "collect_input") {
      // Send the prompt and suspend. Customer's next TEXT reply will
      // wake us up via handleReplyForActiveRun's collect_input branch.
      const cfg = node.config as unknown as CollectInputNodeConfig;
      try {
        const { whatsapp_message_id } = await engineSendText({
          accountId: run.account_id,
    userId: run.user_id,
          conversationId: run.conversation_id!,
          contactId: run.contact_id!,
          text: formatCollectInputPrompt(
            interpolateVars(cfg.prompt_text, run.vars),
            cfg,
          ),
        });
        await logEvent(db, run.id, "message_sent", node.node_key, {
          node_type: "collect_input",
          whatsapp_message_id,
        });
        const { data: msg } = await db
          .from("messages")
          .select("id")
          .eq("message_id", whatsapp_message_id)
          .maybeSingle();
        await db
          .from("flow_runs")
          .update({
            last_prompt_message_id: (msg as { id: string } | null)?.id ?? null,
          })
          .eq("id", run.id);
      } catch (err) {
        await logEvent(db, run.id, "error", node.node_key, {
          reason: "collect_input_prompt_failed",
          detail: err instanceof Error ? err.message : String(err),
        });
        await endRun(db, run.id, "failed", "collect_input_prompt_failed");
        return { outcome: "completed" };
      }
      const advanced = await advanceCurrentNodeKey(
        db,
        run.id,
        run.current_node_key,
        node.node_key,
      );
      if (!advanced) {
        await logEvent(db, run.id, "error", node.node_key, {
          reason: "lost_race_during_advance",
        });
      }
      return { outcome: "advanced" };
    }
    if (node.node_type === "condition") {
      const cfg = node.config as unknown as ConditionNodeConfig;
      let branch: "true" | "false";
      try {
        branch = (await evaluateConditionNode(db, run, cfg))
          ? "true"
          : "false";
      } catch (err) {
        await logEvent(db, run.id, "error", node.node_key, {
          reason: "condition_evaluation_failed",
          detail: err instanceof Error ? err.message : String(err),
        });
        await endRun(db, run.id, "failed", "condition_evaluation_failed");
        return { outcome: "completed" };
      }
      currentKey =
        branch === "true" ? cfg.true_next : cfg.false_next;
      await logEvent(db, run.id, "node_entered", node.node_key, {
        condition_result: branch,
        advancing_to: currentKey,
      });
      continue;
    }
    if (node.node_type === "set_tag") {
      const cfg = node.config as unknown as SetTagNodeConfig;
      try {
        if (cfg.mode === "add") {
          await addContactTagAndDispatch({
            db,
            accountId: run.account_id,
            contactId: run.contact_id!,
            tagId: cfg.tag_id,
            context: {
              conversation_id: run.conversation_id ?? undefined,
              vars: run.vars,
            },
          });
        } else {
          await removeContactTag(db, {
            accountId: run.account_id,
            contactId: run.contact_id!,
            tagId: cfg.tag_id,
          });
        }
      } catch (err) {
        // Non-fatal — log + advance. A tag-write failure shouldn't
        // strand the customer mid-flow.
        await logEvent(db, run.id, "error", node.node_key, {
          reason: "set_tag_failed",
          detail: err instanceof Error ? err.message : String(err),
        });
      }
      currentKey = cfg.next_node_key;
      continue;
    }
    if (
      node.node_type === "crm_get_destinations" ||
      node.node_type === "crm_get_destination" ||
      node.node_type === "crm_complete_enquiry"
    ) {
      const cfg = node.config as unknown as
        | TravelCrmGetDestinationsNodeConfig
        | TravelCrmGetDestinationNodeConfig
        | TravelCrmCompleteEnquiryNodeConfig;
      try {
        let vars = { ...run.vars };
        if (node.node_type === "crm_get_destinations") {
          const destinations = await getCrmBridgeClient().getDestinations(
            (cfg as TravelCrmGetDestinationsNodeConfig).travel_type,
          );
          if (destinations.length === 0) {
            throw new Error("No active assigned destinations were returned.");
          }
          vars = setFlowResult(
            vars,
            (cfg as TravelCrmGetDestinationsNodeConfig).result_var,
            destinations.map((destination) => ({
              destination_id: destination.id,
              destination_name: destination.name,
              travel_type: destination.scope,
              assigned_employee_id: destination.assigned_employee_id,
            })),
          );
          currentKey = cfg.next_node_key;
          await logEvent(db, run.id, "node_entered", node.node_key, {
            node_type: node.node_type,
            destination_count: destinations.length,
          });
        } else if (node.node_type === "crm_get_destination") {
          const detailsConfig = cfg as TravelCrmGetDestinationNodeConfig;
          const id = getFlowVariable(run.vars, detailsConfig.destination_id_var);
          if (typeof id !== "string" || !id.trim()) {
            throw new Error("The configured destination ID variable is empty.");
          }
          const destination = await getCrmBridgeClient().getDestination(id);
          vars = setFlowResult(vars, detailsConfig.result_var, destination);
          currentKey = detailsConfig.next_node_key;
          await logEvent(db, run.id, "node_entered", node.node_key, {
            node_type: node.node_type,
            destination_id: destination.destination_id,
            pdf_available: destination.pdf_available,
          });
        } else {
          const completionConfig = cfg as TravelCrmCompleteEnquiryNodeConfig;
          const completion = await submitCrmFlowCompletion(
            db,
            run,
            false,
            false,
            completionConfig.input_mapping,
            true,
          );
          if (!completion) {
            throw new Error("Travel CRM did not confirm the enquiry.");
          }
          vars = {
            ...vars,
            customer_id: completion.customer_id,
            lead_id: completion.lead_id,
            enquiry_id: completion.enquiry_id,
            enquiry_number: completion.enquiry_number,
          };
          currentKey = completionConfig.next_node_key;
          await logEvent(db, run.id, "node_entered", node.node_key, {
            node_type: node.node_type,
            enquiry_id: completion.enquiry_id,
            enquiry_number: completion.enquiry_number,
          });
        }
        vars.crm_success = true;
        vars.crm_error = null;
        await persistFlowVars(db, run, vars);
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        const reason =
          node.node_type === "crm_get_destinations"
            ? "crm_get_destinations_failed"
            : node.node_type === "crm_get_destination"
              ? "crm_get_destination_failed"
              : "crm_complete_enquiry_failed";
        console.error(`[flows] ${reason}:`, detail);
        await logEvent(db, run.id, "error", node.node_key, {
          reason,
          detail,
        });
        const publicError =
          node.node_type === "crm_get_destinations"
            ? "Destination lookup failed."
            : node.node_type === "crm_get_destination"
              ? "Destination details are unavailable."
              : "The travel enquiry could not be saved.";
        await persistFlowVars(db, run, {
          ...run.vars,
          crm_success: false,
          crm_error: publicError,
        });
        currentKey = cfg.error_next_node_key;
      }
      continue;
    }
    if (node.node_type === "send_buttons") {
      // Same failure contract as send_message / send_media /
      // collect_input above: log + fail the run. Previously an
      // exception here (Meta error, or meta-api's length validation —
      // now reachable via interpolation, see sendButtonsAndSuspend)
      // escaped to dispatchInboundToFlows' catch, which only
      // console.error'd and left the run active + stuck on the prior
      // node with nothing in flow_run_events.
      try {
        await sendButtonsAndSuspend(db, run, node);
      } catch (err) {
        await logEvent(db, run.id, "error", node.node_key, {
          reason: "send_buttons_failed",
          detail: err instanceof Error ? err.message : String(err),
        });
        await endRun(db, run.id, "failed", "send_buttons_failed");
        return { outcome: "completed" };
      }
      // Persist the new current_node_key via optimistic UPDATE.
      const advanced = await advanceCurrentNodeKey(
        db,
        run.id,
        run.current_node_key,
        node.node_key,
      );
      if (!advanced) {
        await logEvent(db, run.id, "error", node.node_key, {
          reason: "lost_race_during_advance",
        });
      }
      return { outcome: "advanced" };
    }
    if (node.node_type === "send_list") {
      try {
        await sendListAndSuspend(db, run, node);
      } catch (err) {
        const cfg = node.config as unknown as SendListNodeConfig;
        const detail = err instanceof Error ? err.message : String(err);
        await logEvent(db, run.id, "error", node.node_key, {
          reason: cfg.dynamic_source_var
            ? "dynamic_send_list_failed"
            : "send_list_failed",
          detail,
        });
        if (cfg.dynamic_source_var && cfg.dynamic_error_next_node_key) {
          await persistFlowVars(db, run, {
            ...run.vars,
            crm_success: false,
            crm_error: "The available options could not be loaded.",
          });
          currentKey = cfg.dynamic_error_next_node_key;
          continue;
        }
        await endRun(db, run.id, "failed", "send_list_failed");
        return { outcome: "completed" };
      }
      const advanced = await advanceCurrentNodeKey(
        db,
        run.id,
        run.current_node_key,
        node.node_key,
        (node.config as unknown as SendListNodeConfig).dynamic_source_var
          ? run.vars
          : undefined,
      );
      if (!advanced) {
        await logEvent(db, run.id, "error", node.node_key, {
          reason: "lost_race_during_advance",
        });
      }
      return { outcome: "advanced" };
    }
    if (node.node_type === "crm_destination") {
      try {
        await sendCrmDestinationPickerAndSuspend(db, run, node);
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        console.error("[flows] Travel CRM destination picker failed:", detail);
        await logEvent(db, run.id, "error", node.node_key, {
          reason: "crm_destination_picker_failed",
          detail,
        });
        await notifyCrmIntegrationFailure(
          db,
          run,
          "We couldn't load travel destinations right now. Please contact our team.",
          "crm_destination_picker_failed",
        );
        await endRun(db, run.id, "failed", "crm_destination_picker_failed");
        return { outcome: "completed" };
      }
      return { outcome: "advanced" };
    }
    if (node.node_type === "handoff") {
      const handedOff = await executeHandoff(db, run, node);
      return { outcome: handedOff ? "handed_off" : "completed" };
    }
    if (node.node_type === "end") {
      if (!(await submitCrmFlowCompletionOrFail(db, run))) {
        return { outcome: "completed" };
      }
      await logEvent(db, run.id, "completed", node.node_key);
      await endRun(db, run.id, "completed", "end_node");
      return { outcome: "completed" };
    }
    // Unknown node type — shouldn't happen given the CHECK constraint.
    await logEvent(db, run.id, "error", node.node_key, {
      reason: `unknown_node_type:${node.node_type}`,
    });
    await endRun(db, run.id, "failed", "unknown_node_type");
    return { outcome: "completed" };
  }
  // Safety break — log + fail.
  await logEvent(db, run.id, "error", currentKey, {
    reason: "advance_loop_safety_break",
  });
  await endRun(db, run.id, "failed", "advance_loop_overflow");
  return { outcome: "completed" };
}

/**
 * Optimistic UPDATE — only advance current_node_key when it matches
 * the value we read at the top of dispatch. If another webhook beat
 * us, the row's pointer has already moved and our UPDATE returns
 * zero rows; we treat that as a no-op and let the other run continue.
 */
async function advanceCurrentNodeKey(
  db: AdminClient,
  runId: string,
  expectedOldKey: string | null,
  newKey: string,
  vars?: Record<string, unknown>,
): Promise<boolean> {
  // PostgREST: when expectedOldKey is null we can't `.eq` (would match
  // any row); use `.is('current_node_key', null)` instead.
  let q = db
    .from("flow_runs")
    .update({
      current_node_key: newKey,
      last_advanced_at: new Date().toISOString(),
      ...(vars ? { vars, reprompt_count: 0 } : {}),
    })
    .eq("id", runId)
    .eq("status", "active");
  if (expectedOldKey === null) {
    q = q.is("current_node_key", null);
  } else {
    q = q.eq("current_node_key", expectedOldKey);
  }
  const { data, error } = await q.select("id");
  if (error) {
    console.error("[flows] advanceCurrentNodeKey error:", error.message);
    return false;
  }
  return Array.isArray(data) && data.length > 0;
}

async function persistFlowVars(
  db: AdminClient,
  run: FlowRunRow,
  vars: Record<string, unknown>,
): Promise<void> {
  const { error } = await db
    .from("flow_runs")
    .update({ vars })
    .eq("id", run.id)
    .eq("status", "active");
  if (error) throw error;
  run.vars = vars;
}

function setFlowResult(
  vars: Record<string, unknown>,
  key: string,
  value: unknown,
): Record<string, unknown> {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) {
    throw new Error("Travel CRM result variable name is invalid.");
  }
  return { ...vars, [key]: value };
}

// ============================================================
// Public entry point — the webhook calls this on every inbound.
// ============================================================

export async function dispatchInboundToFlows(
  input: DispatchInboundInput & { isFirstInboundMessage: boolean },
): Promise<DispatchInboundResult> {
  const db = supabaseAdmin();
  try {
    const activeRun = await loadActiveRunForContact(
      db,
      input.accountId,
      input.contactId,
    );

    // Idempotency — only matters if there's already a run for this
    // contact. For new runs, the partial unique index catches duplicate
    // starts at INSERT time.
    if (activeRun) {
      const dupe = await isDuplicateInbound(
        db,
        input.accountId,
        input.contactId,
        input.message.meta_message_id,
      );
      if (dupe) {
        return {
          consumed: true,
          flow_run_id: activeRun.id,
          outcome: "duplicate_inbound_ignored",
        };
      }
      // One SELECT for the whole flow's nodes — advance loop is now
      // in-memory. See loadAllNodes.
      const nodes = await loadAllNodes(db, activeRun.flow_id);
      return handleReplyForActiveRun(db, activeRun, input.message, nodes);
    }

    // No active run → look for a flow whose entry trigger matches.
    const flow = await findEntryFlow(
      db,
      input.accountId,
      input.message,
      input.isFirstInboundMessage,
    );
    if (!flow || !flow.entry_node_id) {
      return { consumed: false, outcome: "no_match" };
    }
    const nodes = await loadAllNodes(db, flow.id);
    return startNewRun(db, flow, input, nodes);
  } catch (err) {
    console.error(
      "[flows] dispatchInboundToFlows threw:",
      err instanceof Error ? err.message : err,
    );
    return { consumed: false, outcome: "no_match" };
  }
}

async function handleReplyForActiveRun(
  db: AdminClient,
  run: FlowRunRow,
  message: ParsedInbound,
  nodes: Map<string, FlowNodeRow>,
): Promise<DispatchInboundResult> {
  // Note: we intentionally do NOT persist the raw customer text. A
  // `collect_input` prompt that asks "what's your card number?" would
  // otherwise leave the PAN sitting in flow_run_events.payload forever,
  // visible to anyone with access to the runs viewer or the events
  // table. Length is enough for "did they actually reply?" debugging;
  // for the captured value itself, the `node_entered` event already
  // records `captured_key` + `captured_length` after the var is stored.
  await logEvent(db, run.id, "reply_received", run.current_node_key, {
    meta_message_id: message.meta_message_id,
    reply_kind: message.kind,
    reply_id: message.kind === "interactive_reply" ? message.reply_id : null,
    text_length: message.kind === "text" ? message.text.length : null,
  });

  if (!run.current_node_key) {
    // Defensive — a run with status='active' but no current node is
    // malformed. Fail the run rather than spin.
    await endRun(db, run.id, "failed", "active_run_missing_current_node");
    return {
      consumed: true,
      flow_run_id: run.id,
      outcome: "no_match",
    };
  }

  const currentNode = nodes.get(run.current_node_key) ?? null;
  if (!currentNode) {
    await endRun(db, run.id, "failed", "current_node_not_found");
    return { consumed: true, flow_run_id: run.id, outcome: "no_match" };
  }

  if (
    message.kind === "text" &&
    run.vars[CRM_ENQUIRY_ENABLED_KEY] === true &&
    /^(agent|human|speak to agent|talk to agent|speak to a human|talk to a human)$/i.test(
      message.text.trim().replace(/[.!?]+$/g, ""),
    )
  ) {
    if (!(await submitCrmFlowCompletionOrFail(db, run, true, true))) {
      return { consumed: true, flow_run_id: run.id, outcome: "completed" };
    }
    if (run.conversation_id) {
      const { error } = await db
        .from("conversations")
        .update({
          status: "pending",
          ...(resolveFlowHandoffAssignee(run)
            ? { assigned_agent_id: resolveFlowHandoffAssignee(run) }
            : {}),
          updated_at: new Date().toISOString(),
        })
        .eq("id", run.conversation_id);
      if (error) throw error;
    }
    await logEvent(db, run.id, "handoff", currentNode.node_key, {
      reason: "customer_requested_agent",
    });
    await endRun(db, run.id, "handed_off", "customer_requested_agent");
    return { consumed: true, flow_run_id: run.id, outcome: "handed_off" };
  }

  // Two ways a reply can advance:
  //   1. Interactive button/list tap on a send_buttons/send_list node.
  //   2. Text reply on a collect_input node — capture into vars.
  //
  // Everything else falls through to the fallback policy below.
  let matched: string | null = null;
  if (
    message.kind === "interactive_reply" &&
    currentNode.node_type === "crm_destination"
  ) {
    try {
      const state = parseCrmDestinationPickerState(
        run.vars[CRM_DESTINATION_STATE_KEY],
      );
      if (!state) {
        throw new Error("The active Travel CRM destination list state is missing or invalid.");
      }
      const cfg = currentNode.config as unknown as CrmDestinationNodeConfig;
      if (message.reply_id === "crm-destination:next" || message.reply_id === "crm-destination:previous") {
        const requestedPage =
          state.page + (message.reply_id === "crm-destination:next" ? 1 : -1);
        state.page = getCrmDestinationPage(state.options, requestedPage).page;
        await sendCrmDestinationPage(db, run, currentNode, state);
        await persistCrmDestinationPickerState(db, run, state);
        await logEvent(db, run.id, "message_sent", currentNode.node_key, {
          node_type: "crm_destination",
          page: state.page,
        });
        return {
          consumed: true,
          flow_run_id: run.id,
          outcome: "advanced",
        };
      }
      const selectedIndex = Number(
        message.reply_id.startsWith("crm-destination:")
          ? message.reply_id.slice("crm-destination:".length)
          : Number.NaN,
      );
      const selected = Number.isInteger(selectedIndex)
        ? state.options[selectedIndex]
        : undefined;
      if (
        !selected ||
        Math.floor(selectedIndex / CRM_DESTINATION_PAGE_SIZE) !== state.page
      ) {
        matched = null;
      } else {
        const freshDestination = (
          await getCrmBridgeClient().getDestinations(selected.scope)
        ).find((destination) => destination.id === selected.id);
        if (!freshDestination) {
          const refreshedOptions = await loadCrmDestinationOptions(
            (currentNode.config as unknown as CrmDestinationNodeConfig).scope,
          );
          if (refreshedOptions.length === 0) {
            throw new Error("The selected destination is no longer available and no PDF destinations remain.");
          }
          const refreshedState: CrmDestinationPickerState = {
            enabled: true,
            options: refreshedOptions,
            page: 0,
          };
          await sendCrmDestinationPage(
            db,
            run,
            currentNode,
            refreshedState,
            "That destination is no longer available. Please choose again.",
          );
          await persistCrmDestinationPickerState(db, run, refreshedState);
          await logEvent(db, run.id, "message_sent", currentNode.node_key, {
            node_type: "crm_destination",
            destination_list_refreshed: true,
          });
          return {
            consumed: true,
            flow_run_id: run.id,
            outcome: "advanced",
          };
        }
        if (freshDestination.pdf) {
          const { whatsapp_message_id } = await engineSendMedia({
            accountId: run.account_id,
            userId: run.user_id,
            conversationId: run.conversation_id!,
            contactId: run.contact_id!,
            kind: "document",
            link: freshDestination.pdf.url,
            filename: freshDestination.pdf.name,
          });
          await logEvent(db, run.id, "message_sent", currentNode.node_key, {
            node_type: "crm_destination",
            selected_destination_id: freshDestination.id,
            media_type: "document",
            whatsapp_message_id,
          });
        } else {
          await logEvent(db, run.id, "node_entered", currentNode.node_key, {
            warning: "destination_pdf_not_configured",
            destination_id: freshDestination.id,
          });
        }
        const newVars = { ...run.vars };
        delete newVars[CRM_DESTINATION_STATE_KEY];
        newVars[CRM_DESTINATION_RESULT_KEY] = {
          id: freshDestination.id,
          name: freshDestination.name,
          scope: freshDestination.scope,
          assignment_status: freshDestination.assignment_status,
          assigned_employee_id: freshDestination.assigned_employee_id ?? null,
        };
        newVars.travel_type = freshDestination.scope;
        const { error: varsError } = await db
          .from("flow_runs")
          .update({ vars: newVars, reprompt_count: 0 })
          .eq("id", run.id)
          .eq("current_node_key", currentNode.node_key)
          .eq("status", "active");
        if (varsError) throw varsError;
        run.vars = newVars;
        run.reprompt_count = 0;
        await submitCrmFlowSnapshotBestEffort(db, run);
        matched = cfg.next_node_key;
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      console.error("[flows] Travel CRM destination selection failed:", detail);
      await logEvent(db, run.id, "error", currentNode.node_key, {
        reason: "crm_destination_selection_failed",
        detail,
      });
      await notifyCrmIntegrationFailure(
        db,
        run,
        "We couldn't process that destination right now. Please contact our team.",
        "crm_destination_selection_failed",
      );
      await endRun(db, run.id, "failed", "crm_destination_selection_failed");
      return {
        consumed: true,
        flow_run_id: run.id,
        outcome: "completed",
      };
    }
  } else if (
    message.kind === "interactive_reply" &&
    currentNode.node_type === "send_list" &&
    typeof currentNode.config.dynamic_source_var === "string" &&
    currentNode.config.dynamic_source_var.trim()
  ) {
    const cfg = currentNode.config as unknown as SendListNodeConfig;
    try {
      const items = getDynamicListItems(cfg, run.vars);
      const pages = readDynamicListPages(run.vars);
      const page = pages[currentNode.node_key] ?? 0;
      const lastPage = Math.max(
        0,
        Math.ceil(items.length / DYNAMIC_LIST_PAGE_SIZE) - 1,
      );
      if (message.reply_id === DYNAMIC_LIST_NEXT_ID && page < lastPage) {
        pages[currentNode.node_key] = page + 1;
        await persistFlowVars(db, run, {
          ...run.vars,
          __flow_dynamic_list_pages: pages,
        });
        await sendListAndSuspend(db, run, currentNode);
        await logEvent(db, run.id, "message_sent", currentNode.node_key, {
          node_type: "send_list",
          dynamic_page: page + 1,
        });
        return {
          consumed: true,
          flow_run_id: run.id,
          outcome: "advanced",
        };
      }
      if (message.reply_id === DYNAMIC_LIST_PREVIOUS_ID && page > 0) {
        pages[currentNode.node_key] = page - 1;
        await persistFlowVars(db, run, {
          ...run.vars,
          __flow_dynamic_list_pages: pages,
        });
        await sendListAndSuspend(db, run, currentNode);
        await logEvent(db, run.id, "message_sent", currentNode.node_key, {
          node_type: "send_list",
          dynamic_page: page - 1,
        });
        return {
          consumed: true,
          flow_run_id: run.id,
          outcome: "advanced",
        };
      }
      const selectedIndex = items.findIndex(
        ({ replyId }) => replyId === message.reply_id,
      );
      if (
        selectedIndex >= page * DYNAMIC_LIST_PAGE_SIZE &&
        selectedIndex < (page + 1) * DYNAMIC_LIST_PAGE_SIZE
      ) {
        const selected = items[selectedIndex];
        const nextVars: Record<string, unknown> = {
          ...run.vars,
          selected_reply_id: selected.replyId,
        };
        for (const mapping of cfg.dynamic_selection_vars ?? []) {
          const value = getFlowVariable(selected.source, mapping.field);
          if (
            value !== undefined &&
            value !== null &&
            !["string", "number", "boolean"].includes(typeof value)
          ) {
            throw new Error(
              `Selected item field "${mapping.field}" is not a scalar value.`,
            );
          }
          if (value === undefined || value === null) {
            delete nextVars[mapping.var_key];
          } else {
            nextVars[mapping.var_key] = value;
          }
        }
        delete nextVars.__flow_dynamic_list_pages;
        await persistFlowVars(db, run, nextVars);
        matched = cfg.dynamic_next_node_key ?? null;
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      await logEvent(db, run.id, "error", currentNode.node_key, {
        reason: "dynamic_send_list_failed",
        detail,
      });
      await persistFlowVars(db, run, {
        ...run.vars,
        crm_success: false,
        crm_error: "The available options could not be loaded.",
      });
      matched = cfg.dynamic_error_next_node_key ?? null;
    }
  } else if (
    message.kind === "interactive_reply" &&
    (currentNode.node_type === "send_buttons" ||
      currentNode.node_type === "send_list")
  ) {
    matched = matchReplyId(currentNode, message.reply_id);
  } else if (
    message.kind === "text" &&
    currentNode.node_type === "collect_input"
  ) {
    const cfg = currentNode.config as unknown as CollectInputNodeConfig;
    const captured = message.text.trim();
    if (!isValidCollectInput(captured, cfg)) {
      try {
        await engineSendText({
          accountId: run.account_id,
          userId: run.user_id,
          conversationId: run.conversation_id!,
          contactId: run.contact_id!,
          text: formatCollectInputPrompt(
            interpolateVars(cfg.prompt_text, run.vars),
            cfg,
          ),
        });
        await logEvent(db, run.id, "fallback_fired", currentNode.node_key, {
          action: "reprompt",
          reason: "input_validation_failed",
          validation: cfg.validation ?? "prompt_format",
        });
      } catch (err) {
        await logEvent(db, run.id, "error", currentNode.node_key, {
          reason: "invalid_input_reprompt_failed",
          detail: err instanceof Error ? err.message : String(err),
        });
      }
      return {
        consumed: true,
        flow_run_id: run.id,
        outcome: "fallback_fired",
      };
    }
    if (captured.length > 0 && cfg.var_key) {
      // Persist captured value + reset reprompt count atomically.
      const newVars = { ...run.vars, [cfg.var_key]: captured };
      const { error: capErr } = await db
        .from("flow_runs")
        .update({
          vars: newVars,
          reprompt_count: 0,
        })
        .eq("id", run.id);
      if (!capErr) {
        // Mirror the UPDATE in-memory so downstream interpolation in
        // the advance loop sees the captured var without us having to
        // re-SELECT the whole row.
        run.vars = newVars;
        run.reprompt_count = 0;
        await submitCrmFlowSnapshotBestEffort(db, run);
        await logEvent(db, run.id, "node_entered", currentNode.node_key, {
          captured_key: cfg.var_key,
          captured_length: captured.length,
        });
        matched = cfg.next_node_key;
      }
    }
  }

  if (matched) {
    // Reset reprompt count on a successful match. Skip the write when
    // already 0 — the collect_input capture branch above already
    // zeroed it, and interactive-reply matches against a fresh run
    // (post-prior-reset) are also already 0. The previous re-read of
    // the whole row was needed only because we weren't mirroring the
    // capture UPDATE into the in-memory `run`; now that we do, the
    // local copy is the source of truth.
    if (run.reprompt_count !== 0) {
      const { error } = await db
        .from("flow_runs")
        .update({ reprompt_count: 0 })
        .eq("id", run.id);
      if (!error) run.reprompt_count = 0;
    }
    const outcome = await advanceFromNodeKey(db, run, matched, nodes);
    return {
      consumed: true,
      flow_run_id: run.id,
      outcome: outcome.outcome,
    };
  }

  // No match → fallback. Apply the policy.
  const policy = resolveFallbackPolicy(
    (await loadFlow(db, run.flow_id))?.fallback_policy,
  );
  const newReprompts = run.reprompt_count + 1;
  await db
    .from("flow_runs")
    .update({ reprompt_count: newReprompts })
    .eq("id", run.id);

  const action = decideFallback({ policy, reprompt_count: newReprompts });
  await logEvent(db, run.id, "fallback_fired", run.current_node_key, {
    action: action.type,
    reprompt_count: newReprompts,
  });
  if (action.type === "ignore") {
    // Don't consume — let automations have a shot at it.
    return { consumed: false, flow_run_id: run.id, outcome: "no_match" };
  }
  if (action.type === "reprompt") {
    // Re-send the same prompt. Same node, no current_node_key change.
    // The interactive helpers interpolate run.vars themselves, so a
    // reprompt renders the same text the original prompt did. A send
    // failure here is logged but does not end the run — the customer
    // still has the original prompt on screen and can retry.
    try {
      if (currentNode.node_type === "send_buttons") {
        await sendButtonsAndSuspend(db, run, currentNode);
      } else if (currentNode.node_type === "send_list") {
        await sendListAndSuspend(db, run, currentNode);
      } else if (currentNode.node_type === "collect_input") {
        // Customer typed something we couldn't accept (empty after trim,
        // or var_key missing — rare). Re-send the prompt so they try again.
        const cfg = currentNode.config as unknown as CollectInputNodeConfig;
        await engineSendText({
          accountId: run.account_id,
          userId: run.user_id,
          conversationId: run.conversation_id!,
          contactId: run.contact_id!,
          text: interpolateVars(cfg.prompt_text, run.vars),
        });
      } else if (currentNode.node_type === "crm_destination") {
        const state = parseCrmDestinationPickerState(
          run.vars[CRM_DESTINATION_STATE_KEY],
        );
        if (!state) {
          throw new Error("The active Travel CRM destination list state is missing or invalid.");
        }
        await sendCrmDestinationPage(db, run, currentNode, state);
      }
    } catch (err) {
      await logEvent(db, run.id, "error", currentNode.node_key, {
        reason: "reprompt_send_failed",
        detail: err instanceof Error ? err.message : String(err),
      });
      if (currentNode.node_type === "crm_destination") {
        await notifyCrmIntegrationFailure(
          db,
          run,
          "We couldn't refresh travel destinations right now. Please contact our team.",
          "crm_destination_reprompt_failed",
        );
      }
    }
    return { consumed: true, flow_run_id: run.id, outcome: "fallback_fired" };
  }
  if (action.type === "handoff") {
    if (!(await submitCrmFlowCompletionOrFail(db, run, true))) {
      return { consumed: true, flow_run_id: run.id, outcome: "completed" };
    }
    if (run.conversation_id) {
      await db
        .from("conversations")
        .update({ status: "pending", updated_at: new Date().toISOString() })
        .eq("id", run.conversation_id);
    }
    await logEvent(db, run.id, "handoff", run.current_node_key, {
      reason: "fallback_exhausted",
    });
    await endRun(db, run.id, "handed_off", "fallback_exhausted");
    return { consumed: true, flow_run_id: run.id, outcome: "handed_off" };
  }
  // action.type === 'end'
  if (!(await submitCrmFlowCompletionOrFail(db, run, true))) {
    return { consumed: true, flow_run_id: run.id, outcome: "completed" };
  }
  await endRun(db, run.id, "completed", "fallback_exhausted_end");
  return { consumed: true, flow_run_id: run.id, outcome: "completed" };
}

async function startNewRun(
  db: AdminClient,
  flow: FlowRow,
  input: DispatchInboundInput,
  nodes: Map<string, FlowNodeRow>,
): Promise<DispatchInboundResult> {
  const initialVars = [...nodes.values()].some((node) =>
    [
      "crm_destination",
      "crm_get_destinations",
      "crm_get_destination",
      "crm_complete_enquiry",
    ].includes(node.node_type),
  )
    ? { [CRM_ENQUIRY_ENABLED_KEY]: true }
    : {};
  // INSERT — partial unique index `idx_one_active_run_per_contact`
  // catches concurrent inserts with 23505. We catch and return as
  // consumed:true (the parallel webhook handles it).
  const { data: inserted, error: insErr } = await db
    .from("flow_runs")
    .insert({
      flow_id: flow.id,
      // Tenancy: NOT NULL post-017. The partial unique index
      // `idx_one_active_run_per_contact` is over (account_id,
      // contact_id) WHERE status='active', so two accounts sharing
      // a contact phone number each run their own flows independently.
      account_id: flow.account_id,
      // Audit: preserves the flow's author on the run row for log
      // attribution.
      user_id: flow.user_id,
      contact_id: input.contactId,
      conversation_id: input.conversationId,
      status: "active",
      current_node_key: flow.entry_node_id,
      vars: initialVars,
    })
    .select("*")
    .maybeSingle();
  if (insErr) {
    // 23505 = unique_violation → another webhook is starting the run.
    const msg = insErr.message ?? "";
    if (msg.includes("23505") || msg.includes("duplicate key")) {
      return { consumed: true, outcome: "duplicate_inbound_ignored" };
    }
    console.error("[flows] startNewRun insert error:", insErr.message);
    return { consumed: false, outcome: "no_match" };
  }
  const run = inserted as FlowRunRow;
  run.vars = { ...initialVars, ...(run.vars ?? {}) };
  await logEvent(db, run.id, "started", flow.entry_node_id, {
    flow_id: flow.id,
    trigger_type: flow.trigger_type,
    meta_message_id: input.message.meta_message_id,
  });
  // Bump the flow's execution counter — used by the builder UI to
  // surface "X runs since activation" on the flow card.
  //
  // Atomic RPC (migration 012) rather than read-modify-write: two
  // concurrent webhooks starting runs for different contacts on the
  // same flow would otherwise both read N and both write N+1, losing
  // a count. Mirrors the automations engine's use of
  // `increment_automation_execution_count` (migration 007).
  const { error: incErr } = await db.rpc("increment_flow_execution_count", {
    p_flow_id: flow.id,
  });
  if (incErr) {
    // Non-fatal — the run itself succeeded; only the counter is off.
    console.error("[flows] execution_count rpc error:", incErr.message);
  }

  if (run.vars[CRM_ENQUIRY_ENABLED_KEY] === true) {
    await submitCrmFlowSnapshotBestEffort(db, run);
  }

  // Run the advance loop starting from the entry node.
  const outcome = await advanceFromNodeKey(db, run, flow.entry_node_id!, nodes);
  return {
    consumed: true,
    flow_run_id: run.id,
    outcome: outcome.outcome === "advanced" ? "started" : outcome.outcome,
  };
}
