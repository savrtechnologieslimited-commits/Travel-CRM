import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { normalisePhone } from "./phone";
import {
  buildBroadcastAudience,
  getBroadcastSummary,
  isValidBroadcastTransition,
  renderBroadcastMessage,
  type BroadcastAudienceMode,
  type BroadcastRecipientStatus,
  type BroadcastStatus,
} from "./broadcasts";
import { sendWhatsAppMessage } from "./whatsapp-outbound.server";
import type { WhatsAppProvider } from "./whatsapp-provider.server";

export type BroadcastRecord = {
  id: string;
  title: string;
  status: BroadcastStatus;
  audience_mode: BroadcastAudienceMode;
  template_id: string | null;
  body: string;
  scheduled_for: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

export type BroadcastRecipientRow = {
  id: string;
  broadcast_id: string;
  recipient_type: "customer" | "lead";
  recipient_id: string | null;
  customer_id: string | null;
  lead_id: string | null;
  phone: string;
  display_name: string;
  conversation_id: string | null;
  status: BroadcastRecipientStatus;
  failure_reason: string | null;
  meta_message_id: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
};

export type BroadcastRunRow = {
  id: string;
  broadcast_id: string;
  status: "running" | "completed" | "failed";
  started_at: string;
  finished_at: string | null;
  summary: Record<string, number> | null;
  created_at: string;
};

export type BroadcastExecutionSummary = {
  broadcast: BroadcastRecord;
  summary: ReturnType<typeof getBroadcastSummary>;
  recipients: BroadcastRecipientRow[];
};

export type BroadcastRepository = {
  getBroadcast: (id: string) => Promise<BroadcastRecord | null>;
  listBroadcasts: () => Promise<BroadcastRecord[]>;
  listDueScheduledBroadcasts: (now: string) => Promise<BroadcastRecord[]>;
  claimDueBroadcast: (now: string, broadcastId?: string) => Promise<BroadcastRecord | null>;
  createBroadcast: (input: {
    title: string;
    status: BroadcastStatus;
    audience_mode: BroadcastAudienceMode;
    template_id: string | null;
    body: string;
    scheduled_for: string | null;
    created_by?: string | null;
  }) => Promise<BroadcastRecord>;
  updateBroadcast: (id: string, patch: Partial<BroadcastRecord>) => Promise<BroadcastRecord>;
  listRecipients: (broadcastId: string) => Promise<BroadcastRecipientRow[]>;
  insertRecipients: (rows: Array<{
    broadcast_id: string;
    recipient_type: "customer" | "lead";
    recipient_id: string | null;
    customer_id: string | null;
    lead_id: string | null;
    phone: string;
    display_name: string;
    conversation_id?: string | null;
    status?: BroadcastRecipientStatus;
    failure_reason?: string | null;
    meta_message_id?: string | null;
    sent_at?: string | null;
  }>) => Promise<BroadcastRecipientRow[]>;
  updateRecipient: (id: string, patch: Partial<BroadcastRecipientRow>) => Promise<BroadcastRecipientRow>;
  createRun: (input: {
    broadcast_id: string;
    status: "running" | "completed" | "failed";
    started_at: string;
    finished_at?: string | null;
    summary?: Record<string, number> | null;
  }) => Promise<BroadcastRunRow>;
  updateRun: (id: string, patch: Partial<BroadcastRunRow>) => Promise<BroadcastRunRow>;
};

function makeDefaultBroadcastRepository(): BroadcastRepository {
  return {
    async getBroadcast(id) {
      const { data, error } = await supabaseAdmin.from("broadcasts").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return (data ?? null) as BroadcastRecord | null;
    },
    async listBroadcasts() {
      const { data, error } = await supabaseAdmin.from("broadcasts").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as BroadcastRecord[];
    },
    async listDueScheduledBroadcasts(now) {
      const cutoff = new Date(now).toISOString();
      const { data, error } = await supabaseAdmin
        .from("broadcasts")
        .select("*")
        .eq("status", "scheduled")
        .not("scheduled_for", "is", null)
        .lte("scheduled_for", cutoff)
        .order("scheduled_for", { ascending: true });
      if (error) throw error;
      return (data ?? []) as BroadcastRecord[];
    },
    async claimDueBroadcast(now, broadcastId) {
      const cutoff = new Date(now).toISOString();
      let query = supabaseAdmin
        .from("broadcasts")
        .update({ status: "running", updated_at: new Date().toISOString() } as never)
        .eq("status", "scheduled")
        .not("scheduled_for", "is", null)
        .lte("scheduled_for", cutoff)
        .select("*")
        .limit(1);

      if (broadcastId) {
        query = query.eq("id", broadcastId) as typeof query;
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data?.[0] ?? null) as BroadcastRecord | null;
    },
    async createBroadcast(input) {
      const { data, error } = await supabaseAdmin
        .from("broadcasts")
        .insert({
          title: input.title,
          status: input.status,
          audience_mode: input.audience_mode,
          template_id: input.template_id,
          body: input.body,
          scheduled_for: input.scheduled_for,
          created_by: input.created_by ?? null,
        } as never)
        .select("*")
        .single();
      if (error) throw error;
      return data as BroadcastRecord;
    },
    async updateBroadcast(id, patch) {
      const { data, error } = await supabaseAdmin
        .from("broadcasts")
        .update(patch as never)
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      return data as BroadcastRecord;
    },
    async listRecipients(broadcastId) {
      const { data, error } = await supabaseAdmin
        .from("broadcast_recipients")
        .select("*")
        .eq("broadcast_id", broadcastId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as BroadcastRecipientRow[];
    },
    async insertRecipients(rows) {
      if (!rows.length) return [] as BroadcastRecipientRow[];
      const { data, error } = await supabaseAdmin
        .from("broadcast_recipients")
        .insert(rows as never)
        .select("*");
      if (error) throw error;
      return (data ?? []) as BroadcastRecipientRow[];
    },
    async updateRecipient(id, patch) {
      const { data, error } = await supabaseAdmin
        .from("broadcast_recipients")
        .update(patch as never)
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      return data as BroadcastRecipientRow;
    },
    async createRun(input) {
      const { data, error } = await supabaseAdmin
        .from("broadcast_runs")
        .insert({
          broadcast_id: input.broadcast_id,
          status: input.status,
          started_at: input.started_at,
          finished_at: input.finished_at ?? null,
          summary: input.summary ?? null,
        } as never)
        .select("*")
        .single();
      if (error) throw error;
      return data as BroadcastRunRow;
    },
    async updateRun(id, patch) {
      const { data, error } = await supabaseAdmin
        .from("broadcast_runs")
        .update(patch as never)
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      return data as BroadcastRunRow;
    },
  };
}

export async function createBroadcastDraft(input: {
  title: string;
  mode: BroadcastAudienceMode;
  body: string;
  templateId?: string | null;
  scheduledFor?: string | null;
  customers: Array<{ id: string; full_name?: string | null; mobile?: string | null; whatsapp?: string | null }>;
  leads: Array<{ id: string; customer_name?: string | null; mobile?: string | null; whatsapp?: string | null; status?: string | null }>;
  createdBy?: string | null;
  repository?: BroadcastRepository;
}) {
  const repo = input.repository ?? makeDefaultBroadcastRepository();
  const title = input.title.trim();
  if (!title) throw new Error("Broadcast title is required");

  const body = input.body?.trim();
  if (!body) throw new Error("Broadcast body is required");

  const audience = buildBroadcastAudience({ customers: input.customers, leads: input.leads, mode: input.mode });
  if (!audience.recipients.length) {
    throw new Error("No valid recipients match the selected broadcast audience");
  }

  const validTemplate = {
    body,
    values: Object.fromEntries(
      audience.recipients.map((recipient) => [recipient.kind === "customer" ? "name" : "name", recipient.name]),
    ),
  };
  const validation = validTemplate.body ? { valid: true, errors: [] } : { valid: false, errors: ["Broadcast body is required"] };
  if (!validation.valid) throw new Error(validation.errors[0]);

  const broadcast = await repo.createBroadcast({
    title,
    status: input.scheduledFor ? "scheduled" : "draft",
    audience_mode: input.mode,
    template_id: input.templateId ?? null,
    body,
    scheduled_for: input.scheduledFor ?? null,
    created_by: input.createdBy ?? null,
  });

  const rows = audience.recipients.map((recipient) => ({
    broadcast_id: broadcast.id,
    recipient_type: recipient.kind,
    recipient_id: recipient.id,
    customer_id: recipient.kind === "customer" ? recipient.id : null,
    lead_id: recipient.kind === "lead" ? recipient.id : null,
    phone: recipient.phone,
    display_name: recipient.name,
    status: "pending" as BroadcastRecipientStatus,
    failure_reason: null,
    meta_message_id: null,
    sent_at: null,
  }));

  const recipients = await repo.insertRecipients(rows);

  return { broadcast, recipients, summary: getBroadcastSummary(recipients) };
}

export async function cancelScheduledBroadcast(input: {
  broadcastId: string;
  repository?: BroadcastRepository;
}) {
  const repo = input.repository ?? makeDefaultBroadcastRepository();
  const broadcast = await repo.getBroadcast(input.broadcastId);
  if (!broadcast) throw new Error("Broadcast not found");
  if (!isValidBroadcastTransition(broadcast.status, "cancelled")) {
    throw new Error(`Invalid broadcast state transition from ${broadcast.status} to cancelled`);
  }
  const updated = await repo.updateBroadcast(input.broadcastId, { status: "cancelled", completed_at: new Date().toISOString() });
  const recipients = await repo.listRecipients(input.broadcastId);
  await Promise.all(
    recipients
      .filter((recipient) => ["pending", "queued", "sent", "accepted"].includes((recipient.status ?? "").toLowerCase()))
      .map((recipient) => repo.updateRecipient(recipient.id, { status: "skipped", failure_reason: "Broadcast cancelled" })),
  );
  return { broadcast: updated, recipients };
}

export async function duplicateBroadcast(input: {
  broadcastId: string;
  repository?: BroadcastRepository;
}) {
  const repo = input.repository ?? makeDefaultBroadcastRepository();
  const source = await repo.getBroadcast(input.broadcastId);
  if (!source) throw new Error("Broadcast not found");
  const recipients = await repo.listRecipients(input.broadcastId);
  const duplicate = await repo.createBroadcast({
    title: `${source.title} (copy)`,
    status: "draft",
    audience_mode: source.audience_mode,
    template_id: source.template_id,
    body: source.body,
    scheduled_for: null,
    created_by: source.created_by,
  });
  const rows = recipients.map((recipient) => ({
    broadcast_id: duplicate.id,
    recipient_type: recipient.recipient_type,
    recipient_id: recipient.recipient_id,
    customer_id: recipient.customer_id,
    lead_id: recipient.lead_id,
    phone: recipient.phone,
    display_name: recipient.display_name,
    status: "pending" as BroadcastRecipientStatus,
    failure_reason: null,
    meta_message_id: null,
    sent_at: null,
  }));
  const copiedRecipients = await repo.insertRecipients(rows);
  return { broadcast: duplicate, recipients: copiedRecipients };
}

async function ensureBroadcastConversation(repository: BroadcastRepository, input: {
  phone: string;
  customer_id?: string | null;
  lead_id?: string | null;
}) {
  const phone = normalisePhone(input.phone);
  if (!phone) throw new Error("A valid WhatsApp number is required for this broadcast recipient.");

  const { data, error } = await supabaseAdmin
    .from("whatsapp_conversations")
    .select("id,customer_id,lead_id")
    .eq("phone_number", phone)
    .maybeSingle();

  if (error) throw error;
  if (data) {
    const patch: Record<string, string> = {};
    if (input.customer_id && !data.customer_id) patch.customer_id = input.customer_id;
    if (input.lead_id && !data.lead_id) patch.lead_id = input.lead_id;
    if (Object.keys(patch).length) {
      const { error: updateError } = await supabaseAdmin
        .from("whatsapp_conversations")
        .update(patch as never)
        .eq("id", data.id);
      if (updateError) throw updateError;
    }
    return data.id as string;
  }

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from("whatsapp_conversations")
    .insert({
      phone_number: phone,
      customer_id: input.customer_id ?? null,
      lead_id: input.lead_id ?? null,
      created_by: null,
      assigned_employee_id: null,
    } as never)
    .select("id")
    .single();
  if (insertError) throw insertError;
  return inserted.id as string;
}

export async function executeBroadcast(input: {
  broadcastId: string;
  mode: "local" | "meta";
  repository?: BroadcastRepository;
  provider?: WhatsAppProvider;
  now?: () => string;
}) {
  const repo = input.repository ?? makeDefaultBroadcastRepository();
  const now = input.now ?? (() => new Date().toISOString());

  const broadcast = await repo.getBroadcast(input.broadcastId);
  if (!broadcast) throw new Error("Broadcast not found");
  const alreadyRunning = broadcast.status === "running";
  if (!alreadyRunning && !isValidBroadcastTransition(broadcast.status, "running")) {
    throw new Error(`Invalid broadcast state transition from ${broadcast.status} to running`);
  }

  const recipients = await repo.listRecipients(input.broadcastId);
  const run = await repo.createRun({
    broadcast_id: input.broadcastId,
    status: "running",
    started_at: now(),
  });

  await repo.updateBroadcast(input.broadcastId, { status: "running" });

  const nextRecipients = await Promise.all(
    recipients.map(async (recipient) => {
      const shouldSkip = ["sent", "accepted", "delivered", "read", "skipped", "duplicate"].includes(
        (recipient.status ?? "").toLowerCase(),
      );
      if (shouldSkip) return recipient;

      const rowUpdate = { status: "queued" as BroadcastRecipientStatus, failure_reason: null, meta_message_id: null };
      const queuedRecipient = await repo.updateRecipient(recipient.id, rowUpdate);

      try {
        if (input.mode === "local") {
          const simulatedMessageId = `mock-${broadcast.id}-${queuedRecipient.id}`;
          return await repo.updateRecipient(queuedRecipient.id, {
            status: "accepted",
            meta_message_id: simulatedMessageId,
            failure_reason: null,
            sent_at: now(),
          });
        }

        const body = renderBroadcastMessage(broadcast.body, {
          name: queuedRecipient.display_name,
          phone: queuedRecipient.phone,
          kind: queuedRecipient.recipient_type,
          status: queuedRecipient.status,
        });
        const conversationId = input.provider
          ? `mock-broadcast-${queuedRecipient.phone}`
          : await ensureBroadcastConversation(repo, {
              phone: queuedRecipient.phone,
              customer_id: queuedRecipient.customer_id,
              lead_id: queuedRecipient.lead_id,
            });
        const result = await sendWhatsAppMessage(
          {
            conversationId,
            recipientPhone: queuedRecipient.phone,
            payload: { type: "text", text: body },
            caller: "SYSTEM",
          },
          {
            provider: input.provider,
            mode: "meta",
            repository: input.provider
              ? {
                  findConversation: async () => ({
                    id: conversationId,
                    phone_number: queuedRecipient.phone,
                    conversation_mode: "AI_ACTIVE",
                  }),
                  findLatestInboundTimestamp: async () => null,
                  findConnection: async () => null,
                  findMessageByProviderId: async () => null,
                  insertOutboundMessage: async ({ conversationId, payload, deliveryStatus }) => ({
                    id: `message-${conversationId}`,
                    conversation_id: conversationId,
                    wa_message_id: null,
                    direction: "outbound",
                    message_type: payload.type === "text" ? "text" : "interactive",
                    body: payload.type === "text" ? payload.text : payload.text,
                    delivery_status: deliveryStatus,
                    message_timestamp: new Date().toISOString(),
                  }),
                  updateOutboundMessage: async ({ messageId, providerMessageId, deliveryStatus, messageTimestamp }) => ({
                    id: messageId,
                    conversation_id: conversationId,
                    wa_message_id: providerMessageId,
                    direction: "outbound",
                    message_type: "text",
                    body: body,
                    media_url: null,
                    media_mime_type: null,
                    delivery_status: deliveryStatus,
                    message_timestamp: messageTimestamp,
                  }),
                  deleteOutboundMessage: async () => {},
                }
              : undefined,
          },
        );
        return await repo.updateRecipient(queuedRecipient.id, {
          conversation_id: conversationId,
          status: (result.status ?? "sent").toLowerCase() === "duplicate" ? "duplicate" : "sent",
          failure_reason: null,
          meta_message_id: result.provider.providerMessageId,
          sent_at: result.provider.timestamp,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Broadcast send failed";
        return await repo.updateRecipient(queuedRecipient.id, {
          status: "failed",
          failure_reason: message,
          sent_at: now(),
        });
      }
    }),
  );

  const summary = getBroadcastSummary(nextRecipients);
  const finalStatus: BroadcastStatus = summary.failed > 0 && summary.total > 0 ? "completed" : "completed";
  const updatedBroadcast = await repo.updateBroadcast(input.broadcastId, {
    status: finalStatus,
    completed_at: now(),
  });
  await repo.updateRun(run.id, {
    status: summary.failed > 0 && summary.total > 0 ? "failed" : "completed",
    finished_at: now(),
    summary,
  });

  return {
    broadcast: updatedBroadcast,
    summary,
    recipients: nextRecipients,
  } satisfies BroadcastExecutionSummary;
}

export async function retryFailedRecipients(input: {
  broadcastId: string;
  mode: "local" | "meta";
  repository?: BroadcastRepository;
  provider?: WhatsAppProvider;
  now?: () => string;
}) {
  const repo = input.repository ?? makeDefaultBroadcastRepository();
  const recipients = await repo.listRecipients(input.broadcastId);
  const failed = recipients.filter((recipient) => (recipient.status ?? "").toLowerCase() === "failed");
  if (!failed.length) {
    const broadcast = await repo.getBroadcast(input.broadcastId);
    return { broadcast, summary: getBroadcastSummary(recipients), recipients };
  }

  await Promise.all(
    failed.map((recipient) => repo.updateRecipient(recipient.id, { status: "pending", failure_reason: null })),
  );

  return executeBroadcast({
    broadcastId: input.broadcastId,
    mode: input.mode,
    repository: repo,
    provider: input.provider,
    now: input.now,
  });
}
