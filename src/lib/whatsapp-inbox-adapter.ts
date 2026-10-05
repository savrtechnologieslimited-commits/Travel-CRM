/*
 * Adapted from WACRM's src/lib/inbox/conversations.ts normalization/filtering
 * patterns for the Travel CRM's
 * existing whatsapp_conversations relation graph. No records are copied or
 * moved; this only normalizes Supabase's nested one-to-one response shape.
 */

import { titleize } from "./crm";
import { format, isToday, isYesterday } from "date-fns";

type TravelInboxRow = {
  customers?: unknown;
  profiles?: unknown;
  leads?: unknown;
  enquiries?: unknown;
  customer_id?: unknown;
  lead_id?: unknown;
  enquiry_id?: unknown;
  last_message_at?: unknown;
  phone_number?: unknown;
  status?: unknown;
  conversation_mode?: unknown;
  last_message_text?: unknown;
};

function normalizeOneToOneRelation(value: unknown): unknown {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export function normalizeTravelWhatsAppConversation<T extends TravelInboxRow>(row: T): T {
  return {
    ...row,
    customers: normalizeOneToOneRelation(row.customers),
    profiles: normalizeOneToOneRelation(row.profiles),
    leads: normalizeOneToOneRelation(row.leads),
    enquiries: normalizeOneToOneRelation(row.enquiries),
  } as T;
}

function nestedText(value: unknown, key: string): string | null {
  if (!value || typeof value !== "object") return null;
  const field = (value as Record<string, unknown>)[key];
  return typeof field === "string" ? field : null;
}

export function matchesTravelWhatsAppConversationSearch(
  conversation: TravelInboxRow,
  search: string,
): boolean {
  const term = search.trim().toLowerCase();
  if (!term) return true;
  const fields = [
    nestedText(conversation.customers, "full_name"),
    nestedText(conversation.leads, "customer_name"),
    nestedText(conversation.enquiries, "code"),
    typeof conversation.phone_number === "string" ? conversation.phone_number : null,
    nestedText(conversation.profiles, "full_name"),
    nestedText(conversation.leads, "code"),
    typeof conversation.last_message_text === "string" ? conversation.last_message_text : null,
  ];
  return fields.some((field) => field?.toLowerCase().includes(term));
}

export function formatWhatsAppMessageDay(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  if (isToday(date)) return "Today";
  if (isYesterday(date)) return "Yesterday";
  return format(date, "MMMM d, yyyy");
}

export function getWhatsAppCustomerWindow(latestInboundAt: string | null, now = Date.now()) {
  const openedAt = latestInboundAt ? Date.parse(latestInboundAt) : Number.NaN;
  const remainingMs = Number.isFinite(openedAt) && openedAt <= now
    ? Math.max(0, openedAt + 24 * 60 * 60 * 1000 - now)
    : 0;
  return { isOpen: remainingMs > 0, remainingMs };
}

export function buildConversationContextSummary(conversation: TravelInboxRow) {
  const customerName = nestedText(conversation.customers, "full_name") ?? "Not linked to a customer";
  const leadCode = nestedText(conversation.leads, "code") ?? null;
  const enquiryCode = nestedText(conversation.enquiries, "code") ?? null;
  const assignment = nestedText(conversation.profiles, "full_name") ?? "Unassigned";
  const phone = typeof conversation.phone_number === "string" ? `+${conversation.phone_number}` : "Phone unavailable";
  const status = typeof conversation.status === "string" ? titleize(conversation.status) : "Unknown";
  const mode = typeof conversation.conversation_mode === "string" ? titleize(conversation.conversation_mode.replace("_", " ")) : "Unknown";

  return [
    { label: "Customer", value: customerName },
    ...(leadCode ? [{ label: "Lead", value: leadCode }] : []),
    ...(enquiryCode ? [{ label: "Enquiry", value: enquiryCode }] : []),
    { label: "Phone", value: phone },
    { label: "Assignment", value: assignment },
    { label: "Status", value: status },
    { label: "Mode", value: mode },
  ];
}

export function buildContactTagSummary(
  tags: Array<{ name?: string | null; color?: string | null; description?: string | null }> = [],
) {
  return tags
    .map((tag) => ({
      name: typeof tag.name === "string" ? tag.name.trim() : "",
      color: typeof tag.color === "string" && tag.color.trim() ? tag.color.trim() : "#3b82f6",
      description: tag.description ?? null,
    }))
    .filter((tag) => tag.name.length > 0);
}

export function matchesConversationTagFilter(
  contactTags: Array<string | null | undefined> | null | undefined,
  filter: string | null | undefined,
) {
  if (!filter || !filter.trim()) return true;
  const term = filter.trim().toLowerCase();
  const names = (contactTags ?? []).filter((tag): tag is string => Boolean(tag && tag.trim()));
  return names.some((tag) => tag.toLowerCase().includes(term));
}

export function matchesContactTagIds(
  conversation: { customer_id?: string | null; lead_id?: string | null; enquiry_id?: string | null },
  assignments: Array<{ tag_id: string; customer_id?: string | null; lead_id?: string | null; enquiry_id?: string | null }>,
  selectedTagIds: string[],
) {
  if (selectedTagIds.length === 0) return true;
  return assignments.some((assignment) =>
    selectedTagIds.includes(assignment.tag_id) && (
      (Boolean(conversation.customer_id) && conversation.customer_id === assignment.customer_id) ||
      (Boolean(conversation.lead_id) && conversation.lead_id === assignment.lead_id) ||
      (Boolean(conversation.enquiry_id) && conversation.enquiry_id === assignment.enquiry_id)
    ),
  );
}

export function buildQuotedReplyLabel(
  message: { body?: string | null; direction?: string | null } | null | undefined,
) {
  if (!message) return "Replying to a previous message";
  const snippet = (message.body ?? "").trim(); 
  if (!snippet) return `Replying to a previous ${message.direction === "inbound" ? "incoming" : "outgoing"} message`;
  return snippet.length > 72 ? `${snippet.slice(0, 69)}...` : snippet;
}
