import { normalisePhone } from "./phone";
import { resolveTemplateVariables, validateTemplate } from "./whatsapp-phase2";

export type BroadcastAudienceMode = "all_contacts" | "customers_only" | "leads_only" | "active_leads";
export type BroadcastStatus = "draft" | "scheduled" | "running" | "completed" | "cancelled" | "failed" | "paused";
export type BroadcastRecipientStatus =
  | "pending"
  | "queued"
  | "sent"
  | "accepted"
  | "delivered"
  | "read"
  | "failed"
  | "skipped"
  | "duplicate";

export type BroadcastRecipient = {
  id: string;
  name: string;
  phone: string;
  kind: "customer" | "lead";
  status?: string | null;
  recordId?: string | null;
};

export type BroadcastAudience = {
  mode: BroadcastAudienceMode;
  recipients: BroadcastRecipient[];
  summary: string;
};

export type BroadcastSummary = {
  total: number;
  eligible: number;
  skipped: number;
  pending: number;
  sentAccepted: number;
  delivered: number;
  read: number;
  failed: number;
};

type BroadcastCustomerLike = {
  id: string;
  full_name?: string | null;
  mobile?: string | null;
  whatsapp?: string | null;
};

type BroadcastLeadLike = {
  id: string;
  customer_name?: string | null;
  mobile?: string | null;
  whatsapp?: string | null;
  status?: string | null;
};

export function summarizeBroadcastRecipients(recipients: BroadcastRecipient[]) {
  const count = recipients.length;
  return `${count} recipient${count === 1 ? "" : "s"}`;
}

export function isValidBroadcastTransition(current: BroadcastStatus | undefined, next: BroadcastStatus): boolean {
  const transitions: Record<BroadcastStatus, BroadcastStatus[]> = {
    draft: ["scheduled", "running", "cancelled"],
    scheduled: ["running", "cancelled", "paused"],
    running: ["completed", "failed", "paused"],
    completed: [],
    cancelled: [],
    failed: ["scheduled", "running", "completed"],
    paused: ["running", "cancelled", "completed"],
  };
  if (!current) return next === "draft" || next === "scheduled";
  if (current === "running" && next === "running") return true;
  return transitions[current]?.includes(next) ?? false;
}

export function getTemplateVariableNames(body: string) {
  const regex = /{{\s*([A-Za-z0-9_]+)\s*}}/g;
  const names = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = regex.exec(body)) !== null) {
    names.add(match[1]);
  }
  return [...names];
}

export function validateBroadcastTemplate(input: {
  body?: string | null;
  template?: { body?: string | null; is_active?: boolean | null; channel?: string | null } | null;
  values?: Record<string, string | number | null | undefined>;
}) {
  const source = (input.template?.body ?? input.body ?? "").trim();
  const validation = validateTemplate({ name: "Broadcast", body: source });
  if (!validation.valid) {
    return { valid: false, errors: validation.errors, missingVariables: [] };
  }

  const missingVariables = getTemplateVariableNames(source).filter((name) => {
    const value = input.values?.[name];
    return value === undefined || value === null || String(value).trim() === "";
  });

  return {
    valid: missingVariables.length === 0,
    errors: missingVariables.length === 0 ? [] : [`Missing broadcast variable values: ${missingVariables.join(", ")}`],
    missingVariables,
  };
}

export function renderBroadcastMessage(
  body: string,
  values: Record<string, string | number | null | undefined>,
): string {
  const validation = validateBroadcastTemplate({ body, values });
  if (!validation.valid) {
    throw new Error(validation.errors[0] ?? "Broadcast body contains unresolved variables");
  }
  return resolveTemplateVariables({ body }, values).body;
}

export function normalizeBroadcastRecipientPhone(phone: string | null | undefined): string {
  const normalized = normalisePhone(String(phone ?? ""));
  if (!normalized || normalized.length < 8 || normalized.length > 15) {
    return "";
  }
  return normalized;
}

export function buildBroadcastAudience({
  customers,
  leads,
  mode = "all_contacts",
}: {
  customers: BroadcastCustomerLike[];
  leads: BroadcastLeadLike[];
  mode?: BroadcastAudienceMode;
}): BroadcastAudience {
  const recipients: BroadcastRecipient[] = [];
  const seen = new Set<string>();

  const includeCustomer = (customer: BroadcastCustomerLike) => {
    const phone = normalizeBroadcastRecipientPhone(customer.mobile ?? customer.whatsapp ?? "");
    if (!phone) return;
    const key = `customer:${customer.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    recipients.push({
      id: customer.id,
      name: customer.full_name?.trim() || "Unnamed customer",
      phone,
      kind: "customer",
    });
  };

  const includeLead = (lead: BroadcastLeadLike) => {
    const phone = normalizeBroadcastRecipientPhone(lead.mobile ?? lead.whatsapp ?? "");
    if (!phone) return;
    const key = `lead:${lead.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    recipients.push({
      id: lead.id,
      name: lead.customer_name?.trim() || "Unnamed lead",
      phone,
      kind: "lead",
      status: lead.status,
    });
  };

  if (mode === "customers_only" || mode === "all_contacts") {
    customers.forEach(includeCustomer);
  }

  if (mode === "leads_only" || mode === "all_contacts") {
    leads.forEach((lead) => {
      if (mode === "leads_only" && ["closed", "lost", "won"].includes((lead.status ?? "").toLowerCase())) {
        return;
      }
      includeLead(lead);
    });
  }

  if (mode === "active_leads") {
    leads.forEach((lead) => {
      if (["closed", "lost", "won"].includes((lead.status ?? "").toLowerCase())) return;
      includeLead(lead);
    });
  }

  recipients.sort((a, b) => a.name.localeCompare(b.name));

  return {
    mode,
    recipients,
    summary: summarizeBroadcastRecipients(recipients),
  };
}

export function getBroadcastSummary(recipients: Array<{ status?: string | null }>): BroadcastSummary {
  const summary: BroadcastSummary = {
    total: recipients.length,
    eligible: recipients.filter((recipient) => !["skipped", "duplicate", "failed"].includes((recipient.status ?? "").toLowerCase())).length,
    skipped: recipients.filter((recipient) => ["skipped", "duplicate"].includes((recipient.status ?? "").toLowerCase())).length,
    pending: recipients.filter((recipient) => ["pending", "queued"].includes((recipient.status ?? "").toLowerCase())).length,
    sentAccepted: recipients.filter((recipient) => ["sent", "accepted"].includes((recipient.status ?? "").toLowerCase())).length,
    delivered: recipients.filter((recipient) => (recipient.status ?? "").toLowerCase() === "delivered").length,
    read: recipients.filter((recipient) => (recipient.status ?? "").toLowerCase() === "read").length,
    failed: recipients.filter((recipient) => (recipient.status ?? "").toLowerCase() === "failed").length,
  };
  return summary;
}
