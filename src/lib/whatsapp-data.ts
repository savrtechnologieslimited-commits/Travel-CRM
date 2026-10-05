import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { wacrmSupabase as supabase } from "@/integrations/supabase/wacrm-client";
import { titleize } from "@/lib/crm";
import {
  matchesTravelWhatsAppConversationSearch,
  normalizeTravelWhatsAppConversation,
} from "./whatsapp-inbox-adapter";
import { normalisePhone } from "./phone";

/**
 * WhatsApp conversation layer.
 *
 * Threads live in `whatsapp_conversations` (one per phone number) and every
 * message — inbound or outbound — is a row in `whatsapp_messages`. Employee
 * sends use the authenticated server function and existing provider; pending
 * rows receive Meta's ID and accepted state after the provider responds.
 */

export type WhatsAppDirection = "inbound" | "outbound";
export type WhatsAppMessageType = "text" | "image" | "document" | "interactive" | "other";

export type WhatsAppTag = {
  id: string;
  name: string;
  color?: string | null;
  description?: string | null;
  active?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type WhatsAppContactTag = {
  id: string;
  tag_id: string;
  customer_id?: string | null;
  lead_id?: string | null;
  enquiry_id?: string | null;
  created_at?: string | null;
  tag?: WhatsAppTag | null;
};

export type WhatsAppContactNote = {
  id: string;
  customer_id?: string | null;
  lead_id?: string | null;
  enquiry_id?: string | null;
  conversation_id?: string | null;
  note: string;
  created_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type WhatsAppQuickReply = {
  id: string;
  shortcut: string;
  title: string;
  body: string;
  category?: string | null;
  active?: boolean | null;
  created_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

const CONVERSATION_SELECT =
  "id,customer_id,phone_number,assigned_employee_id,lead_id,enquiry_id,status,conversation_mode,unread_count,last_message_at,created_at,updated_at,customers(id,full_name,email,mobile),profiles!whatsapp_conversations_assigned_employee_id_fkey(id,full_name),leads(id,code,customer_name),enquiries(id,code)";

export function useWhatsAppConversations(search?: string) {
  return useQuery({
    queryKey: ["whatsapp-conversations", search ?? ""],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_conversations")
        .select(CONVERSATION_SELECT)
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      const conversationRows = data ?? [];
      const conversationIds = conversationRows.map((row) => row.id);
      const lastMessageByConversation = new Map<string, string>();
      if (conversationIds.length > 0) {
        const { data: messageRows, error: messagesError } = await supabase
          .from("whatsapp_messages")
          .select("conversation_id,body")
          .in("conversation_id", conversationIds)
          .order("message_timestamp", { ascending: false })
          .limit(1000);
        if (messagesError) throw messagesError;
        for (const message of messageRows ?? []) {
          if (!lastMessageByConversation.has(message.conversation_id)) {
            lastMessageByConversation.set(message.conversation_id, message.body ?? "");
          }
        }
      }
      const rows = conversationRows.map((row) => normalizeTravelWhatsAppConversation({
        ...row,
        last_message_text: lastMessageByConversation.get(row.id) ?? null,
      }));
      return rows.filter((conversation) =>
        matchesTravelWhatsAppConversationSearch(conversation, search ?? ""),
      );
    },
  });
}

export function useWhatsAppTags() {
  return useQuery({
    queryKey: ["whatsapp-tags"],
    queryFn: async () => {
      const { data, error } = await (supabase.from("whatsapp_tags" as never) as any)
        .select("*")
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as WhatsAppTag[];
    },
  });
}

export function useWhatsAppContactTags(
  contact: { customerId?: string | null; leadId?: string | null; enquiryId?: string | null } | null | undefined,
) {
  return useQuery({
    queryKey: [
      "whatsapp-contact-tags",
      contact?.customerId ?? null,
      contact?.leadId ?? null,
      contact?.enquiryId ?? null,
    ],
    enabled: Boolean(contact?.customerId || contact?.leadId || contact?.enquiryId),
    queryFn: async () => {
      if (!contact?.customerId && !contact?.leadId && !contact?.enquiryId) return [] as WhatsAppContactTag[];
      const filters: string[] = [];
      if (contact?.customerId) filters.push(`customer_id.eq.${contact.customerId}`);
      if (contact?.leadId) filters.push(`lead_id.eq.${contact.leadId}`);
      if (contact?.enquiryId) filters.push(`enquiry_id.eq.${contact.enquiryId}`);
      const { data, error } = await (supabase.from("whatsapp_contact_tags" as never) as any)
        .select("id,tag_id,customer_id,lead_id,enquiry_id,created_at")
        .or(filters.join(","))
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as WhatsAppContactTag[];
    },
  });
}

export function useAllWhatsAppContactTags() {
  return useQuery({
    queryKey: ["whatsapp-contact-tags", "all"],
    queryFn: async () => {
      const { data, error } = await (supabase.from("whatsapp_contact_tags" as never) as any)
        .select("id,tag_id,customer_id,lead_id,enquiry_id,created_at,tag:whatsapp_tags(id,name,color,description)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as WhatsAppContactTag[];
    },
  });
}

export function useWhatsAppContactNotes(
  context: { conversationId?: string | null; customerId?: string | null; leadId?: string | null; enquiryId?: string | null } | null | undefined,
) {
  return useQuery({
    queryKey: [
      "whatsapp-contact-notes",
      context?.conversationId ?? null,
      context?.customerId ?? null,
      context?.leadId ?? null,
      context?.enquiryId ?? null,
    ],
    enabled: Boolean(context?.conversationId || context?.customerId || context?.leadId || context?.enquiryId),
    queryFn: async () => {
      if (!context?.conversationId && !context?.customerId && !context?.leadId && !context?.enquiryId) return [] as WhatsAppContactNote[];
      const filters: string[] = [];
      if (context?.conversationId) filters.push(`conversation_id.eq.${context.conversationId}`);
      if (context?.customerId) filters.push(`customer_id.eq.${context.customerId}`);
      if (context?.leadId) filters.push(`lead_id.eq.${context.leadId}`);
      if (context?.enquiryId) filters.push(`enquiry_id.eq.${context.enquiryId}`);
      const { data, error } = await (supabase.from("whatsapp_contact_notes" as never) as any)
        .select("id,customer_id,lead_id,enquiry_id,conversation_id,note,created_by,created_at,updated_at")
        .or(filters.join(","))
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as WhatsAppContactNote[];
    },
  });
}

export function useWhatsAppQuickReplies() {
  return useQuery({
    queryKey: ["whatsapp-quick-replies"],
    queryFn: async () => {
      const { data, error } = await (supabase.from("whatsapp_quick_replies" as never) as any)
        .select("*")
        .eq("active", true)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as WhatsAppQuickReply[];
    },
  });
}

export function useWhatsAppMessages(conversationId?: string | null) {
  return useQuery({
    queryKey: ["whatsapp-messages", conversationId],
    enabled: Boolean(conversationId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_messages")
        .select(
          "id,conversation_id,wa_message_id,direction,message_type,body,media_url,media_mime_type,media_meta_id,media_filename,media_storage_path,delivery_status,status_updated_at,delivery_error,message_timestamp,created_at,reply_to_message_id",
        )
        .eq("conversation_id", conversationId!)
        .order("message_timestamp", { ascending: true });
      if (error) throw error;
      const rows = data ?? [];
      const paths = rows.flatMap((row) => row.media_storage_path ? [row.media_storage_path] : []);
      if (paths.length === 0) return rows;
      const { data: signedRows, error: signingError } = await supabase.storage
        .from("whatsapp-media")
        .createSignedUrls(paths, 3600);
      if (signingError) throw signingError;
      const urls = new Map((signedRows ?? []).flatMap((row) => row.path && row.signedUrl ? [[row.path, row.signedUrl] as const] : []));
      return rows.map((row) => row.media_storage_path
        ? { ...row, media_url: urls.get(row.media_storage_path) ?? row.media_url }
        : row);
    },
  });
}

export function useWhatsAppTravelRequirements(conversationId?: string | null) {
  return useQuery({
    queryKey: ["whatsapp-travel-requirements", conversationId],
    enabled: Boolean(conversationId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_travel_requirements")
        .select(
          "id,conversation_id,lead_id,enquiry_id,customer_id,destination_text,travel_start_date,travel_end_date,travel_month,adults,children,departure_city,approximate_budget,hotel_preference,special_requirements,trip_type,created_at",
        )
        .eq("conversation_id", conversationId!)
        .maybeSingle();
      if (error) throw error;
      return data ?? null;
    },
  });
}

export function rankWhatsAppConversationMatch(
  conversation: {
    id?: string;
    lead_id?: string | null;
    enquiry_id?: string | null;
    customer_id?: string | null;
    phone_number?: string | null;
    unread_count?: number | null;
    conversation_mode?: string | null;
  },
  context: { leadId?: string | null; enquiryId?: string | null; customerId?: string | null; phoneNumber?: string | null },
) {
  let score = 0;
  if (conversation.lead_id && context.leadId && conversation.lead_id === context.leadId) score += 120;
  if (conversation.enquiry_id && context.enquiryId && conversation.enquiry_id === context.enquiryId)
    score += 150;
  if (conversation.customer_id && context.customerId && conversation.customer_id === context.customerId)
    score += 80;
  if (context.phoneNumber) {
    const phone = normalisePhone(context.phoneNumber);
    if (phone && normalisePhone(conversation.phone_number ?? "") === phone) score += 60;
  }
  if (conversation.unread_count && conversation.unread_count > 0) score += 5;
  if (conversation.conversation_mode === "HUMAN_ACTIVE") score += 1;
  return score;
}

export function findBestConversationForContext(
  rows: Array<{
    id?: string;
    lead_id?: string | null;
    enquiry_id?: string | null;
    customer_id?: string | null;
    phone_number?: string | null;
    unread_count?: number | null;
    conversation_mode?: string | null;
  }>,
  context: { leadId?: string | null; enquiryId?: string | null; customerId?: string | null; phoneNumber?: string | null },
) {
  if (!rows.length) return null;
  return [...rows].sort(
    (a, b) => rankWhatsAppConversationMatch(b, context) - rankWhatsAppConversationMatch(a, context),
  )[0] ?? null;
}

export function formatConversationMode(mode?: string | null) {
  switch (mode) {
    case "AI_ACTIVE":
      return "AUTOMATION ACTIVE";
    case "HUMAN_ACTIVE":
      return "HUMAN ACTIVE";
    default:
      return mode ? titleize(mode) : "Unknown";
  }
}

export function useWhatsAppConversationsForContext(input: {
  leadId?: string | null;
  enquiryId?: string | null;
  customerId?: string | null;
  phoneNumber?: string | null;
}) {
  return useQuery({
    queryKey: ["whatsapp-conversations-context", input.leadId ?? null, input.enquiryId ?? null, input.customerId ?? null, input.phoneNumber ?? null],
    enabled: Boolean(input.leadId || input.enquiryId || input.customerId || input.phoneNumber),
    queryFn: async () => {
      const filters: string[] = [];
      if (input.phoneNumber) {
        const phone = normalisePhone(input.phoneNumber);
        if (phone) filters.push(`phone_number.eq.${phone}`);
      }
      if (input.leadId) filters.push(`lead_id.eq.${input.leadId}`);
      if (input.enquiryId) filters.push(`enquiry_id.eq.${input.enquiryId}`);
      if (input.customerId) filters.push(`customer_id.eq.${input.customerId}`);
      if (!filters.length) return [];
      const { data, error } = await supabase
        .from("whatsapp_conversations")
        .select(
          "id,customer_id,phone_number,assigned_employee_id,lead_id,enquiry_id,status,conversation_mode,unread_count,last_message_at,customers(id,full_name,email,mobile),profiles!whatsapp_conversations_assigned_employee_id_fkey(id,full_name),leads(id,code,customer_name),enquiries(id,code)",
        )
        .or(filters.join(","))
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      const rows = (data ?? []).map(normalizeTravelWhatsAppConversation);
      return rows.sort((a, b) => rankWhatsAppConversationMatch(b, input) - rankWhatsAppConversationMatch(a, input));
    },
  });
}

/** Finds the thread for a phone number, creating it when it does not exist yet. */
export async function ensureConversation(input: {
  phone_number: string;
  customer_id?: string | null;
  lead_id?: string | null;
  enquiry_id?: string | null;
  assigned_employee_id?: string | null;
}) {
  const phone = normalisePhone(input.phone_number);
  if (!phone) throw new Error("A WhatsApp number is required to open a conversation");

  const existing = await supabase
    .from("whatsapp_conversations")
    .select("id,customer_id,lead_id,enquiry_id")
    .eq("phone_number", phone)
    .maybeSingle();
  if (existing.error) throw existing.error;

  if (existing.data) {
    const patch: Record<string, string> = {};
    if (input.customer_id && !existing.data.customer_id) patch["customer_id"] = input.customer_id;
    if (input.lead_id && !existing.data.lead_id) patch["lead_id"] = input.lead_id;
    if (input.enquiry_id && !existing.data.enquiry_id) patch["enquiry_id"] = input.enquiry_id;
    if (Object.keys(patch).length) {
      const { error } = await supabase
        .from("whatsapp_conversations")
        .update(patch as never)
        .eq("id", existing.data.id);
      if (error) throw error;
    }
    return existing.data.id;
  }

  const { data: userData } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("whatsapp_conversations")
    .insert({
      phone_number: phone,
      customer_id: input.customer_id ?? null,
      lead_id: input.lead_id ?? null,
      enquiry_id: input.enquiry_id ?? null,
      assigned_employee_id: input.assigned_employee_id ?? userData.user?.id ?? null,
      created_by: userData.user?.id ?? null,
    } as never)
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export function useCreateWhatsAppConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof ensureConversation>[0]) => ensureConversation(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["whatsapp-conversations"] });
      toast.success("Conversation ready");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/** Records a message on a thread. The database trigger keeps unread count and last message time in sync. */
export async function recordWhatsAppMessage(input: {
  conversation_id: string;
  direction: WhatsAppDirection;
  body?: string | null;
  message_type?: WhatsAppMessageType;
  media_url?: string | null;
  media_mime_type?: string | null;
  delivery_status?: string;
  wa_message_id?: string | null;
  message_timestamp?: string;
  reply_to_message_id?: string | null;
}) {
  const { data: userData } = await supabase.auth.getUser();
  const { error } = await supabase.from("whatsapp_messages").insert({
    conversation_id: input.conversation_id,
    direction: input.direction,
    message_type: input.message_type ?? "text",
    body: input.body ?? null,
    media_url: input.media_url ?? null,
    media_mime_type: input.media_mime_type ?? null,
    delivery_status:
      input.delivery_status ?? (input.direction === "inbound" ? "received" : "pending"),
    wa_message_id: input.wa_message_id ?? null,
    message_timestamp: input.message_timestamp ?? new Date().toISOString(),
    reply_to_message_id: input.reply_to_message_id ?? null,
    created_by: userData.user?.id ?? null,
  } as never);
  if (error) throw error;
}

export async function createWhatsAppTag(input: { name: string; color?: string; description?: string | null }) {
  const name = input.name.trim();
  if (!name) throw new Error("Tag name is required");
  const { data, error } = await (supabase.from("whatsapp_tags" as never) as any)
    .insert({
      name,
      color: input.color ?? "#3b82f6",
      description: input.description ?? null,
      active: true,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as WhatsAppTag;
}

export async function updateWhatsAppTag(id: string, input: { name?: string; color?: string; description?: string | null; active?: boolean }) {
  const payload: Record<string, unknown> = {};
  if (input.name !== undefined) payload.name = input.name.trim();
  if (input.color !== undefined) payload.color = input.color;
  if (input.description !== undefined) payload.description = input.description;
  if (input.active !== undefined) payload.active = input.active;
  if (!Object.keys(payload).length) return null;
  const { data, error } = await (supabase.from("whatsapp_tags" as never) as any)
    .update(payload)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data as WhatsAppTag | null;
}

export async function deleteWhatsAppTag(id: string) {
  const { error } = await (supabase.from("whatsapp_tags" as never) as any)
    .update({ active: false })
    .eq("id", id);
  if (error) throw error;
}

export async function assignWhatsAppTagToContact(input: {
  customer_id?: string | null;
  lead_id?: string | null;
  enquiry_id?: string | null;
  tag_id: string;
}) {
  const row = {
    customer_id: input.customer_id ?? null,
    lead_id: input.lead_id ?? null,
    enquiry_id: input.enquiry_id ?? null,
    tag_id: input.tag_id,
  };
  const { data, error } = await (supabase.from("whatsapp_contact_tags" as never) as any)
    .upsert(row, { onConflict: "tag_id,customer_id" })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function removeWhatsAppTagFromContact(tagId: string, contact: { customerId?: string | null; leadId?: string | null; enquiryId?: string | null }) {
  let query = (supabase.from("whatsapp_contact_tags" as never) as any).delete();
  if (contact.customerId) query = query.eq("customer_id", contact.customerId);
  if (contact.leadId) query = query.eq("lead_id", contact.leadId);
  if (contact.enquiryId) query = query.eq("enquiry_id", contact.enquiryId);
  query = query.eq("tag_id", tagId);
  const { error } = await query;
  if (error) throw error;
}

export async function createWhatsAppContactNote(input: {
  conversation_id?: string | null;
  customer_id?: string | null;
  lead_id?: string | null;
  enquiry_id?: string | null;
  note: string;
}) {
  const text = input.note.trim();
  if (!text) throw new Error("Note text is required");
  const { data, error } = await (supabase.from("whatsapp_contact_notes" as never) as any)
    .insert({
      conversation_id: input.conversation_id ?? null,
      customer_id: input.customer_id ?? null,
      lead_id: input.lead_id ?? null,
      enquiry_id: input.enquiry_id ?? null,
      note: text,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as WhatsAppContactNote;
}

export async function updateWhatsAppContactNote(id: string, note: string) {
  const text = note.trim();
  if (!text) throw new Error("Note text is required");
  const { data, error } = await (supabase.from("whatsapp_contact_notes" as never) as any)
    .update({ note: text })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data as WhatsAppContactNote;
}

export async function deleteWhatsAppContactNote(id: string) {
  const { error } = await (supabase.from("whatsapp_contact_notes" as never) as any).delete().eq("id", id);
  if (error) throw error;
}

export async function createWhatsAppQuickReply(input: { shortcut: string; title: string; body: string; category?: string }) {
  const shortcut = input.shortcut.trim();
  const title = input.title.trim();
  const body = input.body.trim();
  if (!shortcut || !title || !body) throw new Error("Quick reply shortcut, title, and body are required");
  const { data, error } = await (supabase.from("whatsapp_quick_replies" as never) as any)
    .insert({
      shortcut,
      title,
      body,
      category: input.category ?? "general",
      active: true,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as WhatsAppQuickReply;
}

export async function updateWhatsAppQuickReply(id: string, input: { shortcut?: string; title?: string; body?: string; category?: string; active?: boolean }) {
  const payload: Record<string, unknown> = {};
  if (input.shortcut !== undefined) payload.shortcut = input.shortcut.trim();
  if (input.title !== undefined) payload.title = input.title.trim();
  if (input.body !== undefined) payload.body = input.body.trim();
  if (input.category !== undefined) payload.category = input.category;
  if (input.active !== undefined) payload.active = input.active;
  const { data, error } = await (supabase.from("whatsapp_quick_replies" as never) as any)
    .update(payload)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data as WhatsAppQuickReply;
}

export async function deleteWhatsAppQuickReply(id: string) {
  const { error } = await (supabase.from("whatsapp_quick_replies" as never) as any)
    .update({ active: false })
    .eq("id", id);
  if (error) throw error;
}

export function useCreateWhatsAppTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createWhatsAppTag,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["whatsapp-tags"] }),
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateWhatsAppTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, values }: { id: string; values: { name?: string; color?: string; description?: string | null; active?: boolean } }) =>
      updateWhatsAppTag(id, values),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["whatsapp-tags"] }),
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useAssignWhatsAppTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: assignWhatsAppTagToContact,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["whatsapp-contact-tags"] });
      qc.invalidateQueries({ queryKey: ["whatsapp-conversations"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useRemoveWhatsAppTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ tagId, contact }: { tagId: string; contact: { customerId?: string | null; leadId?: string | null; enquiryId?: string | null } }) =>
      removeWhatsAppTagFromContact(tagId, contact),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["whatsapp-contact-tags"] }),
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useCreateWhatsAppContactNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createWhatsAppContactNote,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["whatsapp-contact-notes"] }),
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateWhatsAppContactNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) => updateWhatsAppContactNote(id, note),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["whatsapp-contact-notes"] }),
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteWhatsAppContactNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteWhatsAppContactNote,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["whatsapp-contact-notes"] }),
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useCreateWhatsAppQuickReply() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createWhatsAppQuickReply,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["whatsapp-quick-replies"] }),
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateWhatsAppQuickReply() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, values }: { id: string; values: { shortcut?: string; title?: string; body?: string; category?: string; active?: boolean } }) =>
      updateWhatsAppQuickReply(id, values),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["whatsapp-quick-replies"] }),
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteWhatsAppQuickReply() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteWhatsAppQuickReply,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["whatsapp-quick-replies"] }),
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useRecordWhatsAppMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof recordWhatsAppMessage>[0]) =>
      recordWhatsAppMessage(input),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["whatsapp-messages", vars.conversation_id] });
      qc.invalidateQueries({ queryKey: ["whatsapp-conversations"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateWhatsAppConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      values,
    }: {
      id: string;
      values: Record<string, string | number | null>;
    }) => {
      const { error } = await supabase
        .from("whatsapp_conversations")
        .update(values as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["whatsapp-conversations"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/** Clears the unread badge when a staff member opens the thread. */
export function useMarkConversationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("whatsapp_conversations")
        .update({ unread_count: 0 } as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["whatsapp-conversations"] }),
  });
}
