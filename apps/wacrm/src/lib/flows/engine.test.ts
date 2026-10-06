import { beforeEach, describe, it, expect, vi } from "vitest";

// ============================================================
// Fakes for the interpolation tests at the bottom of this file
// (issue #553). Same shape as dispatch.test.ts: a minimal Supabase
// query-builder stand-in plus a stubbed meta-send, so we can drive the
// real `dispatchInboundToFlows` and assert on the payload that would
// have gone to Meta. vi.mock is hoisted above the imports below, so
// the pure-helper tests are unaffected — they never touch either.
// ============================================================

const h = vi.hoisted(() => ({
  state: {
    /** Rows loadActiveRunForContact sees. */
    activeRuns: [] as Record<string, unknown>[],
    flows: [] as unknown[],
    nodes: [] as unknown[],
    contacts: [] as unknown[],
    /** flow_run_events INSERTs (what logEvent wrote). */
    events: [] as Record<string, unknown>[],
    /** Every UPDATE, by table. */
    updates: [] as { table: string; row: Record<string, unknown> }[],
  },
  crmDestinations: vi.fn(async () => [] as Array<{
    id: string;
    name: string;
    scope: "domestic" | "international";
    pdf: { name: string; url: string } | null;
    assignment_status: "assigned" | "unassigned" | "ambiguous";
    assigned_employee_id: string;
  }>),
  crmDestinationDetails: vi.fn(
    async (): Promise<{
      destination_id: string;
      destination_name: string;
      travel_type: "domestic" | "international";
      assigned_employee_id: string;
      pdf_url: string | null;
      pdf_available: boolean;
    }> => ({
      destination_id: "destination-1",
      destination_name: "Goa",
      travel_type: "domestic",
      assigned_employee_id: "employee-1",
      pdf_url: "https://crm.example/goa.pdf",
      pdf_available: true,
    }),
  ),
  completeCrmFlow: vi.fn(async () => ({
    customer_id: "customer-1",
    requirement_id: "requirement-1",
    lead_id: "lead-1",
    enquiry_id: "enquiry-1",
    enquiry_number: "ENQ-1",
    created_customer: true,
  })),
  sendText: vi.fn(async () => ({ whatsapp_message_id: "wamid.1" })),
  sendMedia: vi.fn(async () => ({ whatsapp_message_id: "wamid.5" })),
  sendButtons: vi.fn<
    (
      args: Parameters<typeof engineSendInteractiveButtons>[0],
    ) => Promise<{ whatsapp_message_id: string }>
  >(async () => ({ whatsapp_message_id: "wamid.3" })),
  sendList: vi.fn<
    (
      args: Parameters<typeof engineSendInteractiveList>[0],
    ) => Promise<{ whatsapp_message_id: string }>
  >(async () => ({ whatsapp_message_id: "wamid.4" })),
}));

vi.mock("@/lib/crm-bridge", () => ({
  getCrmBridgeClient: () => ({
    getDestinations: h.crmDestinations,
    getDestination: h.crmDestinationDetails,
    completeFlow: h.completeCrmFlow,
  }),
}));

vi.mock("./admin-client", () => {
  function rows(table: string): unknown[] {
    if (table === "flow_runs") return h.state.activeRuns;
    if (table === "flows") return h.state.flows;
    if (table === "flow_nodes") return h.state.nodes;
    if (table === "contacts") return h.state.contacts;
    return [];
  }

  function builder(table: string) {
    const b: Record<string, unknown> = {
      select: () => b,
      eq: () => b,
      is: () => b,
      in: () => b,
      filter: () => b,
      order: () => b,
      limit: () => b,
      update: (row: Record<string, unknown>) => {
        h.state.updates.push({ table, row });
        return b;
      },
      insert: (row: Record<string, unknown>) => {
        if (table === "flow_run_events") h.state.events.push(row);
        return b;
      },
      maybeSingle: async () => ({ data: rows(table)[0] ?? null, error: null }),
      single: async () => ({ data: rows(table)[0] ?? null, error: null }),
      then: (
        resolve: (r: {
          data: unknown[];
          error: null;
          count: number;
        }) => unknown,
      ) => resolve({ data: rows(table), error: null, count: 0 }),
    };
    return b;
  }

  return {
    supabaseAdmin: () => ({
      from: (t: string) => builder(t),
      rpc: () => Promise.resolve({ error: null }),
    }),
  };
});

vi.mock("./meta-send", () => ({
  engineSendText: h.sendText,
  engineSendMedia: h.sendMedia,
  engineSendInteractiveButtons: h.sendButtons,
  engineSendInteractiveList: h.sendList,
}));

import {
  dispatchInboundToFlows,
  matchReplyId,
  matchesKeywordTrigger,
  isAutoAdvancing,
  isSuspending,
  isTerminal,
  evaluateConditionPredicate,
} from "./engine";
import type {
  engineSendInteractiveButtons,
  engineSendInteractiveList,
} from "./meta-send";
import type { ParsedInbound } from "./types";

describe("matchReplyId", () => {
  it("returns null for nodes without options", () => {
    expect(
      matchReplyId({ node_type: "start", config: { next_node_key: "x" } }, "y"),
    ).toBeNull();
    expect(
      matchReplyId({ node_type: "send_message", config: {} }, "y"),
    ).toBeNull();
    expect(matchReplyId({ node_type: "end", config: {} }, "y")).toBeNull();
  });

  it("matches the buttons array on a send_buttons node", () => {
    const node = {
      node_type: "send_buttons",
      config: {
        text: "Pick one",
        buttons: [
          { reply_id: "yes", title: "Yes", next_node_key: "confirmed" },
          { reply_id: "no", title: "No", next_node_key: "declined" },
        ],
      },
    };
    expect(matchReplyId(node, "yes")).toBe("confirmed");
    expect(matchReplyId(node, "no")).toBe("declined");
  });

  it("returns null when no button reply_id matches", () => {
    const node = {
      node_type: "send_buttons",
      config: {
        text: "Pick",
        buttons: [
          { reply_id: "a", title: "A", next_node_key: "to_a" },
          { reply_id: "b", title: "B", next_node_key: "to_b" },
        ],
      },
    };
    expect(matchReplyId(node, "c")).toBeNull();
    expect(matchReplyId(node, "")).toBeNull();
  });

  it("searches across all sections in a send_list node", () => {
    const node = {
      node_type: "send_list",
      config: {
        text: "Pick an order",
        button_label: "View",
        sections: [
          {
            title: "Recent",
            rows: [
              { reply_id: "o1", title: "Order 1", next_node_key: "ord_1" },
            ],
          },
          {
            title: "Older",
            rows: [
              { reply_id: "o2", title: "Order 2", next_node_key: "ord_2" },
              { reply_id: "o3", title: "Order 3", next_node_key: "ord_3" },
            ],
          },
        ],
      },
    };
    expect(matchReplyId(node, "o1")).toBe("ord_1");
    expect(matchReplyId(node, "o2")).toBe("ord_2");
    expect(matchReplyId(node, "o3")).toBe("ord_3");
    expect(matchReplyId(node, "o99")).toBeNull();
  });

  it("returns null when send_list has no sections / empty sections", () => {
    expect(
      matchReplyId(
        { node_type: "send_list", config: { text: "x", sections: [] } },
        "x",
      ),
    ).toBeNull();
    expect(
      matchReplyId(
        {
          node_type: "send_list",
          config: { text: "x", sections: [{ rows: [] }] },
        },
        "x",
      ),
    ).toBeNull();
  });
});

describe("matchesKeywordTrigger", () => {
  it("returns false for empty text", () => {
    expect(matchesKeywordTrigger("", { keywords: ["hi"] })).toBe(false);
  });

  it("returns false when keywords array is empty", () => {
    expect(matchesKeywordTrigger("anything", { keywords: [] })).toBe(false);
  });

  it("default match_type='contains' does case-insensitive substring", () => {
    const cfg = { keywords: ["support"] };
    expect(matchesKeywordTrigger("I need SUPPORT please", cfg)).toBe(true);
    expect(matchesKeywordTrigger("Support is great", cfg)).toBe(true);
    expect(matchesKeywordTrigger("Help me", cfg)).toBe(false);
  });

  it("match_type='exact' compares the whole string case-insensitively", () => {
    const cfg = { keywords: ["help"], match_type: "exact" as const };
    expect(matchesKeywordTrigger("help", cfg)).toBe(true);
    expect(matchesKeywordTrigger("HELP", cfg)).toBe(true);
    expect(matchesKeywordTrigger("help me", cfg)).toBe(false);
  });

  it("case_sensitive=true preserves case", () => {
    const cfg = {
      keywords: ["Support"],
      case_sensitive: true,
    };
    expect(matchesKeywordTrigger("I need Support", cfg)).toBe(true);
    expect(matchesKeywordTrigger("I need support", cfg)).toBe(false);
  });

  it("matches any one of multiple keywords", () => {
    const cfg = { keywords: ["help", "support", "issue"] };
    expect(matchesKeywordTrigger("I have an issue", cfg)).toBe(true);
    expect(matchesKeywordTrigger("I need Help!", cfg)).toBe(true);
    expect(matchesKeywordTrigger("nothing to see here", cfg)).toBe(false);
  });

  it("skips empty strings in the keywords array", () => {
    const cfg = { keywords: ["", "support", ""] };
    expect(matchesKeywordTrigger("support center", cfg)).toBe(true);
    expect(matchesKeywordTrigger("nope", cfg)).toBe(false);
  });
});

describe("node classification helpers", () => {
  it("isAutoAdvancing covers synchronous action nodes", () => {
    expect(isAutoAdvancing("start")).toBe(true);
    expect(isAutoAdvancing("send_message")).toBe(true);
    expect(isAutoAdvancing("send_media")).toBe(true);
    expect(isAutoAdvancing("condition")).toBe(true);
    expect(isAutoAdvancing("set_tag")).toBe(true);
    expect(isAutoAdvancing("crm_get_destinations")).toBe(true);
    expect(isAutoAdvancing("crm_get_destination")).toBe(true);
    expect(isAutoAdvancing("crm_complete_enquiry")).toBe(true);
    expect(isAutoAdvancing("send_buttons")).toBe(false);
    expect(isAutoAdvancing("send_list")).toBe(false);
    expect(isAutoAdvancing("collect_input")).toBe(false);
    expect(isAutoAdvancing("handoff")).toBe(false);
    expect(isAutoAdvancing("end")).toBe(false);
  });

  it("isSuspending covers the input-requiring nodes", () => {
    expect(isSuspending("send_buttons")).toBe(true);
    expect(isSuspending("send_list")).toBe(true);
    expect(isSuspending("crm_destination")).toBe(true);
    expect(isSuspending("collect_input")).toBe(true);
    expect(isSuspending("start")).toBe(false);
    expect(isSuspending("send_message")).toBe(false);
    expect(isSuspending("condition")).toBe(false);
    expect(isSuspending("set_tag")).toBe(false);
    expect(isSuspending("handoff")).toBe(false);
    expect(isSuspending("end")).toBe(false);
  });

  it("isTerminal covers handoff + end", () => {
    expect(isTerminal("handoff")).toBe(true);
    expect(isTerminal("end")).toBe(true);
    expect(isTerminal("start")).toBe(false);
    expect(isTerminal("send_buttons")).toBe(false);
    expect(isTerminal("condition")).toBe(false);
  });

  it("the three classifications are mutually exclusive for known node types", () => {
    const types = [
      "start",
      "send_message",
      "send_buttons",
      "send_list",
      "send_media",
      "crm_destination",
      "crm_get_destinations",
      "crm_get_destination",
      "crm_complete_enquiry",
      "collect_input",
      "condition",
      "set_tag",
      "handoff",
      "end",
    ];
    for (const t of types) {
      const flags = [isAutoAdvancing(t), isSuspending(t), isTerminal(t)];
      // Exactly one of the three should be true for every known node.
      expect(flags.filter(Boolean).length).toBe(1);
    }
  });
});

describe("evaluateConditionPredicate", () => {
  it("present: true when subject has a value", () => {
    expect(
      evaluateConditionPredicate({
        operator: "present",
        subjectValue: "alice@example.com",
        configValue: undefined,
      }),
    ).toBe(true);
  });

  it("present: false when subject is undefined or empty", () => {
    expect(
      evaluateConditionPredicate({
        operator: "present",
        subjectValue: undefined,
        configValue: undefined,
      }),
    ).toBe(false);
    expect(
      evaluateConditionPredicate({
        operator: "present",
        subjectValue: "",
        configValue: undefined,
      }),
    ).toBe(false);
  });

  it("absent: inverse of present", () => {
    expect(
      evaluateConditionPredicate({
        operator: "absent",
        subjectValue: undefined,
        configValue: undefined,
      }),
    ).toBe(true);
    expect(
      evaluateConditionPredicate({
        operator: "absent",
        subjectValue: "x",
        configValue: undefined,
      }),
    ).toBe(false);
  });

  it("equals: exact string comparison; case-sensitive", () => {
    expect(
      evaluateConditionPredicate({
        operator: "equals",
        subjectValue: "VIP",
        configValue: "VIP",
      }),
    ).toBe(true);
    expect(
      evaluateConditionPredicate({
        operator: "equals",
        subjectValue: "vip",
        configValue: "VIP",
      }),
    ).toBe(false);
  });

  it("equals: undefined subject never matches (even against empty)", () => {
    expect(
      evaluateConditionPredicate({
        operator: "equals",
        subjectValue: undefined,
        configValue: "",
      }),
    ).toBe(false);
  });

  it("contains: substring match", () => {
    expect(
      evaluateConditionPredicate({
        operator: "contains",
        subjectValue: "support@example.com",
        configValue: "@example.com",
      }),
    ).toBe(true);
    expect(
      evaluateConditionPredicate({
        operator: "contains",
        subjectValue: "support@other.com",
        configValue: "@example.com",
      }),
    ).toBe(false);
  });

  it("contains: undefined subject never matches", () => {
    expect(
      evaluateConditionPredicate({
        operator: "contains",
        subjectValue: undefined,
        configValue: "anything",
      }),
    ).toBe(false);
  });
});

// ============================================================
// {{vars.*}} interpolation in send_buttons / send_list (issue #553).
//
// A send_buttons node placed after a collect_input used to send
// "Hi {{vars.name}}" literally — only send_message, send_media
// captions and collect_input prompts were interpolated.
// ============================================================

const RUN = {
  id: "run-1",
  flow_id: "flow-1",
  account_id: "acct-1",
  user_id: "u-1",
  contact_id: "ct-1",
  conversation_id: "cv-1",
  status: "active",
  current_node_key: "ask_name",
  last_prompt_message_id: null,
  vars: {} as Record<string, unknown>,
  reprompt_count: 0,
  started_at: "2026-01-01T00:00:00Z",
  last_advanced_at: "2026-01-01T00:00:00Z",
  ended_at: null,
  end_reason: null,
};

const FLOW = {
  id: "flow-1",
  name: "Travel enquiry",
  account_id: "acct-1",
  user_id: "u-1",
  status: "active",
  trigger_type: "manual",
  trigger_config: {},
  entry_node_id: "ask_name",
  fallback_policy: {
    on_unknown_reply: "reprompt",
    max_reprompts: 2,
    on_timeout_hours: 24,
    on_exhaust: "handoff",
  },
  created_at: "2026-01-01T00:00:00Z",
};

const BUTTONS_NODE = {
  id: "n2",
  flow_id: "flow-1",
  node_key: "choose",
  node_type: "send_buttons",
  config: {
    text: "Hi {{vars.name}}, please choose an option.",
    header_text: "Welcome {{vars.name}}",
    // footer_text deliberately absent — must stay absent, not become "".
    buttons: [
      { reply_id: "yes", title: "Yes, {{vars.name}}", next_node_key: "done" },
      // A reply_id is a routing key, not customer-visible text; it must
      // reach Meta exactly as authored even if it happens to look like a
      // template.
      { reply_id: "no_{{vars.name}}", title: "No thanks", next_node_key: "done" },
    ],
  },
};

const LIST_NODE = {
  id: "n3",
  flow_id: "flow-1",
  node_key: "pick",
  node_type: "send_list",
  config: {
    text: "{{vars.name}}, pick a plan.",
    button_label: "{{vars.name}}'s plans",
    footer_text: "Prices for {{vars.name}}",
    // header_text deliberately absent.
    sections: [
      {
        title: "Plans for {{vars.name}}",
        rows: [
          {
            reply_id: "basic",
            title: "Basic for {{vars.name}}",
            description: "Best for {{vars.name}}",
            next_node_key: "done",
          },
          // No description — must stay absent.
          { reply_id: "pro", title: "Pro", next_node_key: "done" },
        ],
      },
    ],
  },
};

/** collect_input "ask_name" → `next`, plus both interactive nodes + end. */
function nodesEndingIn(next: "choose" | "pick") {
  return [
    {
      id: "n1",
      flow_id: "flow-1",
      node_key: "ask_name",
      node_type: "collect_input",
      config: {
        prompt_text: "What's your name?",
        var_key: "name",
        next_node_key: next,
      },
    },
    BUTTONS_NODE,
    LIST_NODE,
    { id: "n9", flow_id: "flow-1", node_key: "done", node_type: "end", config: {} },
  ];
}

function dispatch(message: ParsedInbound) {
  return dispatchInboundToFlows({
    accountId: "acct-1",
    userId: "u-1",
    contactId: "ct-1",
    conversationId: "cv-1",
    message,
    isFirstInboundMessage: false,
  });
}

function text(t: string): ParsedInbound {
  return { kind: "text", text: t, meta_message_id: `m-${t}` };
}

describe("crm_destination runtime", () => {
  beforeEach(() => {
    h.state.activeRuns = [
      {
        ...RUN,
        current_node_key: "destination_picker",
        vars: {
          __crm_enquiry_enabled: true,
          __crm_destination_picker: {
            enabled: true,
            options: [
              { id: "destination-1", name: "Goa", scope: "domestic" },
            ],
            page: 0,
          },
        },
      },
    ];
    h.state.flows = [FLOW];
    h.state.contacts = [
      {
        id: "ct-1",
        name: "Customer",
        email: "customer@example.com",
        phone: null,
      },
    ];
    h.state.contacts = [];
    h.state.nodes = [
      {
        id: "picker-node",
        flow_id: "flow-1",
        node_key: "destination_picker",
        node_type: "crm_destination",
        config: {
          prompt_text: "Choose a destination",
          button_label: "View destinations",
          next_node_key: "ask_more",
        },
      },
      {
        id: "input-node",
        flow_id: "flow-1",
        node_key: "ask_more",
        node_type: "collect_input",
        config: {
          prompt_text: "Any other details?",
          var_key: "details",
          next_node_key: "done",
        },
      },
      { id: "end-node", flow_id: "flow-1", node_key: "done", node_type: "end", config: {} },
    ];
    h.state.events = [];
    h.state.updates = [];
    h.crmDestinations.mockResolvedValue([
      {
        id: "destination-1",
        name: "Goa",
        scope: "domestic",
        pdf: { name: "goa-itinerary.pdf", url: "https://crm.example/signed.pdf" },
        assignment_status: "assigned",
        assigned_employee_id: "employee-1",
      },
    ]);
    h.crmDestinations.mockClear();
    h.sendMedia.mockClear();
    h.completeCrmFlow.mockClear();
  });

  it("re-fetches the selected destination, sends its PDF, and stores it for CRM completion", async () => {
    const result = await dispatch({
      kind: "interactive_reply",
      reply_id: "crm-destination:0",
      reply_title: "Goa",
      meta_message_id: "destination-reply-1",
    });

    expect(h.crmDestinations).toHaveBeenCalledWith("domestic");
    expect(h.sendMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "document",
        link: "https://crm.example/signed.pdf",
        filename: "goa-itinerary.pdf",
      }),
    );
    expect(h.state.updates).toContainEqual(
      expect.objectContaining({
        table: "flow_runs",
        row: expect.objectContaining({
          vars: {
            __crm_enquiry_enabled: true,
            __crm_destination: {
              id: "destination-1",
              name: "Goa",
              scope: "domestic",
              assignment_status: "assigned",
              assigned_employee_id: "employee-1",
            },
            travel_type: "domestic",
          },
        }),
      }),
    );
    expect(result).toMatchObject({ consumed: true, outcome: "advanced" });
  });

  it("continues when a selected destination has no configured PDF", async () => {
    h.crmDestinations.mockResolvedValue([
      {
        id: "destination-1",
        name: "Goa",
        scope: "domestic",
        pdf: null,
        assignment_status: "assigned",
        assigned_employee_id: "employee-1",
      },
    ]);
    const persistedVars = h.state.activeRuns[0]!.vars as Record<string, unknown>;
    persistedVars.__crm_destination_picker = {
      enabled: true,
      options: [{ id: "destination-1", name: "Goa", scope: "domestic" }],
      page: 0,
    };

    const result = await dispatch({
      kind: "interactive_reply",
      reply_id: "crm-destination:0",
      reply_title: "Goa",
      meta_message_id: "destination-reply-no-pdf",
    });

    expect(h.sendMedia).not.toHaveBeenCalled();
    expect(h.state.events).toContainEqual(
      expect.objectContaining({
        event_type: "node_entered",
        payload: expect.objectContaining({
          warning: "destination_pdf_not_configured",
        }),
      }),
    );
    expect(result).toMatchObject({ consumed: true, outcome: "advanced" });
  });

  it("submits the selected destination and customer answers when the flow ends", async () => {
    h.state.activeRuns = [
      {
        ...RUN,
        current_node_key: "ask_details",
        vars: {
          __crm_enquiry_enabled: true,
          details: "Two travelers in June",
          customer_name: "Saved Name",
          travel_date: "20 December 2026",
          adults: "2",
          children: "1",
          departure_city: "Delhi",
          budget: "USD 1,250",
          special_requirements: "Vegetarian meals",
          __crm_destination: {
            id: "destination-1",
            name: "Goa",
            scope: "domestic",
            assignment_status: "assigned",
            assigned_employee_id: "employee-1",
          },
        },
      },
    ];
    h.state.contacts = [
      {
        id: "ct-1",
        name: "Customer",
        email: "customer@example.com",
        phone: null,
      },
    ];
    h.state.nodes = [
      {
        id: "input-node",
        flow_id: "flow-1",
        node_key: "ask_details",
        node_type: "collect_input",
        config: {
          prompt_text: "Any other details?",
          var_key: "more_details",
          next_node_key: "done",
        },
      },
      { id: "end-node", flow_id: "flow-1", node_key: "done", node_type: "end", config: {} },
    ];

    const result = await dispatch(text("June 15"));

    expect(h.completeCrmFlow).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        flow_run_id: "run-1",
        flow_id: "flow-1",
        wacrm_contact_id: "ct-1",
        flow_name: "Travel enquiry",
        contact: {
          name: "Saved Name",
          email: "customer@example.com",
          phone: null,
        },
        destination: {
          id: "destination-1",
          name: "Goa",
          scope: "domestic",
          assignment_status: "assigned",
          assigned_employee_id: "employee-1",
        },
        answers: {
          details: "Two travelers in June",
          customer_name: "Saved Name",
          travel_date: "20 December 2026",
          adults: "2",
          children: "1",
          departure_city: "Delhi",
          budget: "USD 1,250",
          special_requirements: "Vegetarian meals",
          more_details: "June 15",
          conversation_id: "cv-1",
          __wacrm_travel_date_iso: "2026-12-20",
          __wacrm_budget_amount: "1250",
          __wacrm_budget_currency: "USD",
        },
        handoff_requested: false,
      }),
    );
    expect(result).toMatchObject({ consumed: true, outcome: "completed" });
  });

  it("marks a no-destination agent handoff for CRM fallback assignment", async () => {
    h.state.activeRuns = [
      {
        ...RUN,
        current_node_key: "travel_type",
        vars: {
          __crm_enquiry_enabled: true,
          travel_type: "international",
        },
      },
    ];
    h.state.flows = [FLOW];
    h.state.contacts = [
      {
        id: "ct-1",
        name: "Contact display name",
        email: null,
        phone: "+919876543210",
      },
    ];
    h.state.nodes = [
      {
        id: "buttons-node",
        flow_id: "flow-1",
        node_key: "travel_type",
        node_type: "send_buttons",
        config: {
          text: "Select travel type",
          buttons: [
            { reply_id: "agent", title: "Speak to Agent", next_node_key: "handoff" },
          ],
        },
      },
      {
        id: "handoff-node",
        flow_id: "flow-1",
        node_key: "handoff",
        node_type: "handoff",
        config: { note: "Customer requested a human agent." },
      },
    ];

    const result = await dispatch({
      kind: "interactive_reply",
      reply_id: "agent",
      reply_title: "Speak to Agent",
      meta_message_id: "agent-handoff-1",
    });

    expect(h.completeCrmFlow).toHaveBeenCalledWith(
      expect.objectContaining({
        destination: null,
        handoff_requested: true,
        answers: expect.objectContaining({ travel_type: "international" }),
      }),
    );
    expect(result).toMatchObject({ consumed: true, outcome: "handed_off" });
  });
});

describe("reusable Travel CRM nodes and dynamic lists", () => {
  beforeEach(() => {
    h.state.activeRuns = [{ ...RUN, current_node_key: "menu", vars: {} }];
    h.state.flows = [FLOW];
    h.state.contacts = [
      {
        id: "ct-1",
        name: "WhatsApp contact",
        email: null,
        phone: "+919876543210",
      },
    ];
    h.state.nodes = [];
    h.state.events = [];
    h.state.updates = [];
    h.crmDestinations.mockReset();
    h.crmDestinations.mockResolvedValue([]);
    h.crmDestinationDetails.mockReset();
    h.crmDestinationDetails.mockResolvedValue({
      destination_id: "destination-1",
      destination_name: "Goa",
      travel_type: "domestic",
      assigned_employee_id: "employee-1",
      pdf_url: "https://crm.example/goa.pdf",
      pdf_available: true,
    });
    h.crmDestinationDetails.mockResolvedValue({
      destination_id: "destination-1",
      destination_name: "Goa",
      travel_type: "domestic",
      assigned_employee_id: "employee-1",
      pdf_url: "https://crm.example/goa.pdf",
      pdf_available: true,
    });
    h.completeCrmFlow.mockReset();
    h.completeCrmFlow.mockResolvedValue({
      customer_id: "customer-1",
      requirement_id: "requirement-1",
      lead_id: "lead-1",
      enquiry_id: "enquiry-1",
      enquiry_number: "ENQ-1",
      created_customer: true,
    });
    h.sendText.mockClear();
    h.sendList.mockClear();
    h.sendMedia.mockClear();
  });

  it("loads live, assigned destinations into flow variables for a dynamic Send List", async () => {
    h.crmDestinations.mockResolvedValue([
      {
        id: "destination-1",
        name: "Goa",
        scope: "domestic",
        pdf: null,
        assignment_status: "assigned",
        assigned_employee_id: "employee-1",
      },
    ]);
    h.state.nodes = [
      {
        id: "menu",
        flow_id: "flow-1",
        node_key: "menu",
        node_type: "send_buttons",
        config: {
          text: "Choose",
          buttons: [{ reply_id: "domestic", title: "Domestic", next_node_key: "lookup" }],
        },
      },
      {
        id: "lookup",
        flow_id: "flow-1",
        node_key: "lookup",
        node_type: "crm_get_destinations",
        config: {
          travel_type: "domestic",
          result_var: "destinations",
          next_node_key: "pick",
          error_next_node_key: "error",
        },
      },
      {
        id: "pick",
        flow_id: "flow-1",
        node_key: "pick",
        node_type: "send_list",
        config: {
          text: "Choose a destination",
          button_label: "View destinations",
          sections: [],
          dynamic_source_var: "destinations",
          dynamic_title_field: "destination_name",
          dynamic_reply_id_field: "destination_id",
          dynamic_description_field: "travel_type",
          dynamic_selection_vars: [
            { var_key: "travel_type", field: "travel_type" },
            { var_key: "selected_destination_id", field: "destination_id" },
            { var_key: "selected_destination_name", field: "destination_name" },
            { var_key: "selected_assigned_employee_id", field: "assigned_employee_id" },
          ],
          dynamic_next_node_key: "details",
          dynamic_error_next_node_key: "error",
        },
      },
      { id: "error", flow_id: "flow-1", node_key: "error", node_type: "end", config: {} },
      { id: "done", flow_id: "flow-1", node_key: "details", node_type: "end", config: {} },
    ];

    const result = await dispatch({
      kind: "interactive_reply",
      reply_id: "domestic",
      reply_title: "Domestic",
      meta_message_id: "lookup-destinations",
    });

    expect(h.crmDestinations).toHaveBeenCalledWith("domestic");
    expect(h.sendList.mock.calls[0]?.[0].sections[0]?.rows).toEqual([
      { id: "destination-1", title: "Goa", description: "domestic" },
    ]);
    expect(h.state.updates).toContainEqual(
      expect.objectContaining({
        table: "flow_runs",
        row: expect.objectContaining({
          vars: expect.objectContaining({
            destinations: [
              {
                destination_id: "destination-1",
                destination_name: "Goa",
                travel_type: "domestic",
                assigned_employee_id: "employee-1",
              },
            ],
          }),
        }),
      }),
    );
    expect(result).toMatchObject({ consumed: true, outcome: "advanced" });
  });

  it("maps the selected reply, fetches destination details, and sends the dynamic PDF", async () => {
    h.crmDestinationDetails.mockResolvedValue({
      destination_id: "destination-1",
      destination_name: "Goa",
      travel_type: "domestic",
      assigned_employee_id: "employee-1",
      pdf_url: "https://crm.example/goa.pdf",
      pdf_available: true,
    });
    h.state.activeRuns = [
      {
        ...RUN,
        current_node_key: "pick",
        vars: {
          destinations: [
            {
              destination_id: "destination-1",
              destination_name: "Goa",
              travel_type: "domestic",
              assigned_employee_id: "employee-1",
            },
          ],
        },
      },
    ];
    h.state.nodes = [
      {
        id: "pick",
        flow_id: "flow-1",
        node_key: "pick",
        node_type: "send_list",
        config: {
          text: "Choose a destination",
          button_label: "View destinations",
          sections: [],
          dynamic_source_var: "destinations",
          dynamic_title_field: "destination_name",
          dynamic_reply_id_field: "destination_id",
          dynamic_selection_vars: [
            { var_key: "selected_destination_id", field: "destination_id" },
            { var_key: "selected_destination_name", field: "destination_name" },
            { var_key: "selected_assigned_employee_id", field: "assigned_employee_id" },
            { var_key: "travel_type", field: "travel_type" },
          ],
          dynamic_next_node_key: "details",
          dynamic_error_next_node_key: "error",
        },
      },
      {
        id: "details",
        flow_id: "flow-1",
        node_key: "details",
        node_type: "crm_get_destination",
        config: {
          destination_id_var: "selected_destination_id",
          result_var: "destination",
          next_node_key: "pdf",
          error_next_node_key: "error",
        },
      },
      {
        id: "pdf",
        flow_id: "flow-1",
        node_key: "pdf",
        node_type: "send_media",
        config: {
          media_type: "document",
          media_url: "{{destination.pdf_url}}",
          skip_if_empty: true,
          next_node_key: "end",
        },
      },
      { id: "end", flow_id: "flow-1", node_key: "end", node_type: "end", config: {} },
      { id: "error", flow_id: "flow-1", node_key: "error", node_type: "end", config: {} },
    ];

    const result = await dispatch({
      kind: "interactive_reply",
      reply_id: "destination-1",
      reply_title: "Goa",
      meta_message_id: "select-destination",
    });

    expect(h.crmDestinationDetails).toHaveBeenCalledWith("destination-1");
    expect(h.sendMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "document",
        link: "https://crm.example/goa.pdf",
      }),
    );
    expect(h.state.updates).toContainEqual(
      expect.objectContaining({
        table: "flow_runs",
        row: expect.objectContaining({
          vars: expect.objectContaining({
            selected_destination_id: "destination-1",
            selected_destination_name: "Goa",
            selected_assigned_employee_id: "employee-1",
            travel_type: "domestic",
          }),
        }),
      }),
    );
    expect(result).toMatchObject({ consumed: true, outcome: "completed" });
  });

  it("skips dynamic media when Travel CRM has no PDF", async () => {
    h.crmDestinationDetails.mockResolvedValue({
      destination_id: "destination-1",
      destination_name: "Goa",
      travel_type: "domestic",
      assigned_employee_id: "employee-1",
      pdf_url: null,
      pdf_available: false,
    });
    h.state.activeRuns = [
      {
        ...RUN,
        current_node_key: "menu",
        vars: { selected_destination_id: "destination-1" },
      },
    ];
    h.state.nodes = [
      {
        id: "menu",
        flow_id: "flow-1",
        node_key: "menu",
        node_type: "send_buttons",
        config: {
          text: "Continue",
          buttons: [{ reply_id: "go", title: "Go", next_node_key: "details" }],
        },
      },
      {
        id: "details",
        flow_id: "flow-1",
        node_key: "details",
        node_type: "crm_get_destination",
        config: {
          destination_id_var: "selected_destination_id",
          result_var: "destination",
          next_node_key: "pdf",
          error_next_node_key: "error",
        },
      },
      {
        id: "pdf",
        flow_id: "flow-1",
        node_key: "pdf",
        node_type: "send_media",
        config: {
          media_type: "document",
          media_url: "{{destination.pdf_url}}",
          skip_if_empty: true,
          next_node_key: "end",
        },
      },
      { id: "end", flow_id: "flow-1", node_key: "end", node_type: "end", config: {} },
      { id: "error", flow_id: "flow-1", node_key: "error", node_type: "end", config: {} },
    ];

    await dispatch({
      kind: "interactive_reply",
      reply_id: "go",
      reply_title: "Go",
      meta_message_id: "skip-missing-pdf",
    });

    expect(h.sendMedia).not.toHaveBeenCalled();
    expect(h.state.events).toContainEqual(
      expect.objectContaining({
        event_type: "node_entered",
        node_key: "pdf",
        payload: expect.objectContaining({ skipped: true }),
      }),
    );
  });

  it("creates an enquiry before taking the configured success path", async () => {
    h.completeCrmFlow.mockResolvedValue({
      customer_id: "customer-1",
      requirement_id: "requirement-1",
      lead_id: "lead-1",
      enquiry_id: "enquiry-1",
      enquiry_number: "ENQ-1",
      created_customer: true,
    });
    h.state.contacts = [
      {
        id: "ct-1",
        name: "Contact",
        email: null,
        phone: "+919876543210",
      },
    ];
    h.state.activeRuns = [
      {
        ...RUN,
        current_node_key: "menu",
        vars: {
          customer_name: "Asha",
          travel_type: "domestic",
          selected_destination_id: "00000000-0000-4000-8000-000000000001",
          selected_destination_name: "Goa",
          selected_assigned_employee_id: "00000000-0000-4000-8000-000000000002",
          travel_date: "2026-12-20",
          adults: "2",
          children: "1",
          departure_city: "Delhi",
          budget: "INR 50000",
          special_requirements: "Vegetarian meals",
        },
      },
    ];
    h.state.nodes = [
      {
        id: "menu",
        flow_id: "flow-1",
        node_key: "menu",
        node_type: "send_buttons",
        config: {
          text: "Continue",
          buttons: [{ reply_id: "complete", title: "Complete", next_node_key: "crm" }],
        },
      },
      {
        id: "crm",
        flow_id: "flow-1",
        node_key: "crm",
        node_type: "crm_complete_enquiry",
        config: {
          input_mapping: {
            customer_name: "customer_name",
            whatsapp_number: "phone",
            travel_type: "travel_type",
            destination_id: "selected_destination_id",
            destination_name: "selected_destination_name",
            assigned_employee_id: "selected_assigned_employee_id",
            travel_date: "travel_date",
            adults: "adults",
            children: "children",
            departure_city: "departure_city",
            budget: "budget",
            special_requirements: "special_requirements",
          },
          next_node_key: "success",
          error_next_node_key: "failure",
        },
      },
      {
        id: "success",
        flow_id: "flow-1",
        node_key: "success",
        node_type: "send_message",
        config: { text: "Created {{enquiry_number}}", next_node_key: "end" },
      },
      { id: "end", flow_id: "flow-1", node_key: "end", node_type: "end", config: {} },
      {
        id: "failure",
        flow_id: "flow-1",
        node_key: "failure",
        node_type: "send_message",
        config: { text: "We could not save your enquiry.", next_node_key: "handoff" },
      },
      { id: "handoff", flow_id: "flow-1", node_key: "handoff", node_type: "handoff", config: {} },
    ];

    const result = await dispatch({
      kind: "interactive_reply",
      reply_id: "complete",
      reply_title: "Complete",
      meta_message_id: "complete-enquiry",
    });

    expect(h.completeCrmFlow).toHaveBeenCalledWith(
      expect.objectContaining({
        contact: expect.objectContaining({ phone: "+919876543210", name: "Asha" }),
        destination: expect.objectContaining({
          id: "00000000-0000-4000-8000-000000000001",
          assigned_employee_id: "00000000-0000-4000-8000-000000000002",
        }),
        answers: expect.objectContaining({
          customer_name: "Asha",
          destination_name: "Goa",
          travel_date: "2026-12-20",
          adults: "2",
          children: "1",
          departure_city: "Delhi",
          budget: "INR 50000",
          special_requirements: "Vegetarian meals",
          whatsapp_number: "+919876543210",
          conversation_id: "cv-1",
        }),
      }),
    );
    expect(h.sendText).toHaveBeenCalledWith(
      expect.objectContaining({ text: "Created ENQ-1" }),
    );
    expect(result).toMatchObject({ consumed: true, outcome: "completed" });
  });

  it("routes a CRM write failure to the error path without sending a success message", async () => {
    h.completeCrmFlow.mockRejectedValueOnce(new Error("CRM unavailable"));
    h.state.contacts = [
      {
        id: "ct-1",
        name: "Contact",
        email: null,
        phone: "+919876543210",
      },
    ];
    h.state.nodes = [
      {
        id: "menu",
        flow_id: "flow-1",
        node_key: "menu",
        node_type: "send_buttons",
        config: {
          text: "Continue",
          buttons: [{ reply_id: "complete", title: "Complete", next_node_key: "crm" }],
        },
      },
      {
        id: "crm",
        flow_id: "flow-1",
        node_key: "crm",
        node_type: "crm_complete_enquiry",
        config: {
          input_mapping: {},
          next_node_key: "success",
          error_next_node_key: "failure",
        },
      },
      {
        id: "success",
        flow_id: "flow-1",
        node_key: "success",
        node_type: "send_message",
        config: { text: "Your enquiry was created.", next_node_key: "end" },
      },
      { id: "end", flow_id: "flow-1", node_key: "end", node_type: "end", config: {} },
      {
        id: "failure",
        flow_id: "flow-1",
        node_key: "failure",
        node_type: "send_message",
        config: { text: "We could not save your enquiry.", next_node_key: "handoff" },
      },
      { id: "handoff", flow_id: "flow-1", node_key: "handoff", node_type: "handoff", config: {} },
    ];

    const result = await dispatch({
      kind: "interactive_reply",
      reply_id: "complete",
      reply_title: "Complete",
      meta_message_id: "failed-complete-enquiry",
    });

    expect(h.sendText).toHaveBeenCalledWith(
      expect.objectContaining({ text: "We could not save your enquiry." }),
    );
    expect(h.sendText).not.toHaveBeenCalledWith(
      expect.objectContaining({ text: "Your enquiry was created." }),
    );
    expect(result).toMatchObject({ consumed: true, outcome: "handed_off" });
  });
});

describe("send_buttons / send_list interpolate {{vars.*}} (#553)", () => {
  beforeEach(() => {
    h.state.activeRuns = [{ ...RUN, vars: {} }];
    h.state.flows = [FLOW];
    h.state.nodes = nodesEndingIn("choose");
    h.state.events = [];
    h.state.updates = [];
  });

  it("send_buttons after collect_input renders body, header and button titles", async () => {
    const result = await dispatch(text("Alice"));

    expect(result).toMatchObject({ consumed: true, outcome: "advanced" });
    expect(h.sendButtons).toHaveBeenCalledTimes(1);
    const args = h.sendButtons.mock.calls[0][0];
    expect(args.bodyText).toBe("Hi Alice, please choose an option.");
    expect(args.headerText).toBe("Welcome Alice");
    expect(args.footerText).toBeUndefined();
    expect(args.buttons).toEqual([
      { id: "yes", title: "Yes, Alice" },
      { id: "no_{{vars.name}}", title: "No thanks" },
    ]);
    // The run really suspended on the buttons node.
    expect(h.state.updates).toContainEqual(
      expect.objectContaining({
        table: "flow_runs",
        row: expect.objectContaining({ current_node_key: "choose" }),
      }),
    );
  });

  it("send_list after collect_input renders body, button label, footer, section and row text", async () => {
    h.state.nodes = nodesEndingIn("pick");

    const result = await dispatch(text("Alice"));

    expect(result).toMatchObject({ consumed: true, outcome: "advanced" });
    expect(h.sendList).toHaveBeenCalledTimes(1);
    const args = h.sendList.mock.calls[0][0];
    expect(args.bodyText).toBe("Alice, pick a plan.");
    expect(args.buttonLabel).toBe("Alice's plans");
    expect(args.footerText).toBe("Prices for Alice");
    expect(args.headerText).toBeUndefined();
    expect(args.sections).toEqual([
      {
        title: "Plans for Alice",
        rows: [
          { id: "basic", title: "Basic for Alice", description: "Best for Alice" },
          { id: "pro", title: "Pro", description: undefined },
        ],
      },
    ]);
  });

  it("reprompt re-sends the interactive node with the same interpolation", async () => {
    // Run already suspended on the buttons node with the var captured;
    // the customer types instead of tapping → fallback → reprompt.
    h.state.activeRuns = [
      { ...RUN, current_node_key: "choose", vars: { name: "Alice" } },
    ];

    const result = await dispatch(text("huh?"));

    expect(result).toMatchObject({ consumed: true, outcome: "fallback_fired" });
    expect(h.sendButtons).toHaveBeenCalledTimes(1);
    expect(h.sendButtons.mock.calls[0][0].bodyText).toBe(
      "Hi Alice, please choose an option.",
    );
    expect(h.sendButtons.mock.calls[0][0].buttons[0]).toEqual({
      id: "yes",
      title: "Yes, Alice",
    });
  });

  describe("collect_input validation", () => {
    beforeEach(() => {
      h.state.activeRuns = [
        { ...RUN, current_node_key: "ask_travel_date", reprompt_count: 2 },
      ];
      h.state.flows = [FLOW];
      h.state.nodes = [
        {
          id: "date-node",
          flow_id: "flow-1",
          node_key: "ask_travel_date",
          node_type: "collect_input",
          config: {
            prompt_text:
              "What is your planned travel date? Reply in YYYY-MM-DD format, for example: 2026-10-25.",
            var_key: "travel_date",
            next_node_key: "done",
          },
        },
        { id: "end-node", flow_id: "flow-1", node_key: "done", node_type: "end", config: {} },
      ];
      h.state.events = [];
      h.state.updates = [];
      h.sendText.mockClear();
    });

    it("repeats the same question for an invalid format without exhausting retries", async () => {
      const prompt =
        "What is your planned travel date? Reply in YYYY-MM-DD format, for example: 2026-10-25.";

      const result = await dispatch(text("next Friday"));

      expect(result).toMatchObject({ consumed: true, outcome: "fallback_fired" });
      expect(h.sendText).toHaveBeenCalledWith(
        expect.objectContaining({ text: prompt }),
      );
      expect(h.state.events).toContainEqual(
        expect.objectContaining({
          event_type: "fallback_fired",
          node_key: "ask_travel_date",
          payload: expect.objectContaining({
            action: "reprompt",
            reason: "input_validation_failed",
          }),
        }),
      );
      expect(
        h.state.updates.some(
          ({ table, row }) =>
            table === "flow_runs" &&
            (row.status === "handed_off" || row.status === "completed"),
        ),
      ).toBe(false);
      expect(h.state.updates).not.toContainEqual(
        expect.objectContaining({
          table: "flow_runs",
          row: expect.objectContaining({
            vars: expect.objectContaining({ travel_date: "next Friday" }),
          }),
        }),
      );
    });

    it("captures a valid answer and advances the flow", async () => {
      const result = await dispatch(text("2026-10-25"));

      expect(result).toMatchObject({ consumed: true, outcome: "completed" });
      expect(h.state.updates).toContainEqual(
        expect.objectContaining({
          table: "flow_runs",
          row: expect.objectContaining({
            vars: expect.objectContaining({ travel_date: "2026-10-25" }),
          }),
        }),
      );
    });
  });

  it("a send failure (e.g. an interpolated title over Meta's limit) is logged and fails the run", async () => {
    // "Yes, Bartholomew Montgomery" is 27 chars; meta-api's validator
    // rejects titles over INTERACTIVE_LIMITS.buttonTitleMaxLength (20)
    // before calling Meta. The stub stands in for that throw.
    h.sendButtons.mockRejectedValueOnce(
      new Error(
        'Interactive button title "Yes, Bartholomew Montgomery" exceeds 20 chars.',
      ),
    );

    const result = await dispatch(text("Bartholomew Montgomery"));

    // Previously the throw escaped to dispatchInboundToFlows' catch:
    // consumed:false, nothing in flow_run_events, run left active.
    expect(result).toMatchObject({ consumed: true, outcome: "completed" });
    expect(h.state.events).toContainEqual(
      expect.objectContaining({
        event_type: "error",
        node_key: "choose",
        payload: {
          reason: "send_buttons_failed",
          detail: expect.stringContaining("exceeds 20 chars"),
        },
      }),
    );
    expect(h.state.updates).toContainEqual(
      expect.objectContaining({
        table: "flow_runs",
        row: expect.objectContaining({
          status: "failed",
          end_reason: "send_buttons_failed",
        }),
      }),
    );
  });
});
