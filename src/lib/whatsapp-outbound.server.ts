import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { normalisePhone } from "./phone";
import { MetaWhatsAppProvider } from "./meta-whatsapp-provider.server";
import { getMetaWhatsAppReadiness } from "./meta-whatsapp-provider.server";
import { mockWhatsAppProvider } from "./whatsapp-provider.mock.server";
import { validateInteractivePayload } from "../../supabase/functions/_shared/whatsapp/interactive.ts";
import type {
  SendWhatsAppMessageInput,
  SendWhatsAppTextMessageInput,
  WhatsAppOutboundPayload,
  WhatsAppProvider,
  WhatsAppProviderResult,
} from "./whatsapp-provider.server";

export type OutboundCaller = "AI" | "HUMAN" | "SYSTEM";

export type OutboundConversation = {
  id: string;
  phone_number: string;
  conversation_mode: "AI_ACTIVE" | "HUMAN_ACTIVE";
};

export type WhatsAppConnectionRecord = {
  phone_number_id: string | null;
  waba_id: string | null;
  connection_status: string;
  access_token_secret_ref: string | null;
};

export type OutboundMessageRecord = {
  id: string;
  conversation_id: string;
  wa_message_id: string | null;
  direction: "outbound";
  message_type: "text" | "image" | "video" | "audio" | "interactive" | "document";
  body: string | null;
  media_url?: string | null;
  media_mime_type?: string | null;
  media_filename?: string | null;
  media_storage_path?: string | null;
  delivery_status: string;
  message_timestamp: string;
};

export type WhatsAppOutboundRepository = {
  findConversation: (conversationId: string) => Promise<OutboundConversation | null>;
  findLatestInboundTimestamp: (conversationId: string) => Promise<string | null>;
  findConnection: (phoneNumberId: string) => Promise<WhatsAppConnectionRecord | null>;
  findMessageByProviderId: (providerMessageId: string) => Promise<OutboundMessageRecord | null>;
  insertOutboundMessage: (input: {
    conversationId: string;
    payload: WhatsAppOutboundPayload;
    deliveryStatus: string;
  }) => Promise<OutboundMessageRecord>;
  updateOutboundMessage: (input: {
    messageId: string;
    providerMessageId: string | null;
    deliveryStatus: string;
    messageTimestamp: string;
  }) => Promise<OutboundMessageRecord>;
  deleteOutboundMessage: (messageId: string) => Promise<void>;
};

export type SendWhatsAppTextMessageResult = {
  status: "sent" | "duplicate";
  provider: WhatsAppProviderResult;
  message: OutboundMessageRecord;
};

function validatePhone(phone: string): string {
  const normalized = normalisePhone(phone);
  if (!normalized || !/^\d{8,15}$/.test(normalized)) {
    throw new Error("A valid WhatsApp recipient phone number is required");
  }
  return normalized;
}

export type WhatsAppSendMode = "local" | "meta";

export function resolveWhatsAppSendMode(env: Record<string, string | undefined> = process.env): WhatsAppSendMode {
  const configured = env["WHATSAPP_PROVIDER_MODE"]?.trim().toLowerCase();
  if (configured === "meta") return "meta";
  if (configured === "local" || configured === "mock") return "local";
  return env["NODE_ENV"] === "production" ? "meta" : "local";
}

function validateOutboundPayload(payload: WhatsAppOutboundPayload): void {
  if (payload.type === "text" && !payload.text.trim()) throw new Error("WhatsApp message text is required");
  if (payload.type === "image" || payload.type === "video" || payload.type === "audio" || payload.type === "document") {
    let url: URL;
    try {
      url = new URL(payload.url);
    } catch {
      throw new Error("WhatsApp media must use a valid public HTTPS URL");
    }
    if (url.protocol !== "https:") throw new Error("WhatsApp media must use a valid public HTTPS URL");
    if (payload.type === "document" && payload.filename && payload.filename.length > 255) {
      throw new Error("Document filename is too long");
    }
  }
  if (payload.type === "buttons") {
    const validation = validateInteractivePayload({ kind: "buttons", body: payload.text, buttons: payload.buttons });
    if (!validation.ok) throw new Error(validation.error);
  }
  if (payload.type === "list") {
    const validation = validateInteractivePayload({ kind: "list", body: payload.text, button_label: payload.buttonText, sections: payload.sections });
    if (!validation.ok) throw new Error(validation.error);
  }
}

export function validateMetaConnection(input: {
  phoneNumberId: string;
  readiness: ReturnType<typeof getMetaWhatsAppReadiness>;
  connection: WhatsAppConnectionRecord | null;
}): void {
  if (!input.readiness.ready || !input.connection || input.connection.connection_status !== "connected" ||
      input.connection.phone_number_id !== input.phoneNumberId || !input.connection.waba_id ||
      !input.connection.access_token_secret_ref) {
    throw new Error("WhatsApp Cloud API is not configured for this CRM.");
  }
}

export function isWhatsAppCustomerWindowOpen(latestInboundAt: string | null, now = Date.now()): boolean {
  if (!latestInboundAt) return false;
  const timestamp = Date.parse(latestInboundAt);
  return Number.isFinite(timestamp) && now - timestamp >= 0 && now - timestamp < 24 * 60 * 60 * 1000;
}

function createSupabaseOutboundRepository(): WhatsAppOutboundRepository {
  return {
    async findConversation(conversationId) {
      const { data, error } = await supabaseAdmin
        .from("whatsapp_conversations")
        .select("id,phone_number,conversation_mode")
        .eq("id", conversationId)
        .maybeSingle();
      if (error) throw error;
      return data as OutboundConversation | null;
    },
    async findLatestInboundTimestamp(conversationId) {
      const { data, error } = await supabaseAdmin
        .from("whatsapp_messages")
        .select("message_timestamp")
        .eq("conversation_id", conversationId)
        .eq("direction", "inbound")
        .order("message_timestamp", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return typeof data?.message_timestamp === "string" ? data.message_timestamp : null;
    },
    async findConnection(phoneNumberId) {
      const { data, error } = await supabaseAdmin
        .from("whatsapp_connections")
        .select("phone_number_id,waba_id,connection_status,access_token_secret_ref")
        .eq("phone_number_id", phoneNumberId)
        .maybeSingle();
      if (error) throw error;
      return data as WhatsAppConnectionRecord | null;
    },
    async findMessageByProviderId(providerMessageId) {
      const { data, error } = await supabaseAdmin
        .from("whatsapp_messages")
        .select("id,conversation_id,wa_message_id,direction,message_type,body,media_url,media_mime_type,media_filename,delivery_status,message_timestamp")
        .eq("wa_message_id", providerMessageId)
        .maybeSingle();
      if (error) throw error;
      return data as OutboundMessageRecord | null;
    },
    async insertOutboundMessage({ conversationId, payload, deliveryStatus }) {
      const { data, error } = await supabaseAdmin
        .from("whatsapp_messages")
        .insert({
          conversation_id: conversationId,
          wa_message_id: null,
          direction: "outbound",
          message_type: payload.type === "buttons" || payload.type === "list" ? "interactive" : payload.type,
          body: payload.type === "text" || payload.type === "buttons" || payload.type === "list" ? payload.text : payload.caption ?? null,
          media_url: "storagePath" in payload && payload.storagePath ? null : payload.type === "document" || payload.type === "image" || payload.type === "video" || payload.type === "audio" ? payload.url : null,
          media_storage_path: "storagePath" in payload ? payload.storagePath ?? null : null,
          media_mime_type: payload.type === "document" ? "application/pdf" : payload.type === "image" ? payload.mimeType ?? "image/jpeg" : payload.type === "video" ? "video/mp4" : payload.type === "audio" ? "audio/ogg" : null,
          media_filename: payload.type === "document" ? payload.filename ?? null : null,
          delivery_status: deliveryStatus,
          message_timestamp: new Date().toISOString(),
        })
        .select("id,conversation_id,wa_message_id,direction,message_type,body,media_url,media_mime_type,media_filename,media_storage_path,delivery_status,message_timestamp")
        .single();
      if (error) throw error;
      return data as OutboundMessageRecord;
    },
    async updateOutboundMessage({ messageId, providerMessageId, deliveryStatus, messageTimestamp }) {
      const { data, error } = await supabaseAdmin
        .from("whatsapp_messages")
        .update({
          wa_message_id: providerMessageId,
          delivery_status: deliveryStatus,
          message_timestamp: messageTimestamp,
        })
        .eq("id", messageId)
        .select("id,conversation_id,wa_message_id,direction,message_type,body,media_url,media_mime_type,media_filename,media_storage_path,delivery_status,message_timestamp")
        .single();
      if (error) throw error;
      return data as OutboundMessageRecord;
    },
    async deleteOutboundMessage(messageId) {
      const { error } = await supabaseAdmin.from("whatsapp_messages").delete().eq("id", messageId);
      if (error) throw error;
    },
  };
}

export async function sendWhatsAppTextMessage(
  input: SendWhatsAppTextMessageInput & { caller?: OutboundCaller },
  options: {
    provider?: WhatsAppProvider;
    repository?: WhatsAppOutboundRepository;
  } = {},
): Promise<SendWhatsAppTextMessageResult> {
  const result = await sendWhatsAppMessage({
    conversationId: input.conversationId,
    recipientPhone: input.recipientPhone,
    payload: { type: "text", text: input.text },
    ...(input.clientMessageId !== undefined ? { clientMessageId: input.clientMessageId } : {}),
    ...(input.caller !== undefined ? { caller: input.caller } : {}),
  }, options);
  return result;
}

export async function sendWhatsAppMessage(
  input: SendWhatsAppMessageInput & { caller?: OutboundCaller },
  options: {
    provider?: WhatsAppProvider;
    repository?: WhatsAppOutboundRepository;
    mode?: WhatsAppSendMode;
    env?: Record<string, string | undefined>;
  } = {},
): Promise<SendWhatsAppTextMessageResult> {
  const repository = options.repository ?? createSupabaseOutboundRepository();
  const env = options.env ?? process.env;
  const mode = options.mode ?? resolveWhatsAppSendMode(env);
  let provider = options.provider;
  const conversation = await repository.findConversation(input.conversationId);
  if (!conversation) throw new Error("WhatsApp conversation not found");
  if ((input.caller ?? "AI") === "AI" && conversation.conversation_mode === "HUMAN_ACTIVE") {
    throw new Error("AI cannot send messages in a HUMAN_ACTIVE conversation");
  }
  const requestedRecipient = validatePhone(input.recipientPhone);
  const recipientPhone = validatePhone(conversation.phone_number);
  if (requestedRecipient !== recipientPhone) {
    throw new Error("WhatsApp recipient does not match the conversation");
  }
  validateOutboundPayload(input.payload);

  if (mode === "meta" && !options.provider) {
    const phoneNumberId = env["META_WHATSAPP_PHONE_NUMBER_ID"]?.trim() || env["WHATSAPP_PHONE_NUMBER_ID"]?.trim() || "";
    let connection: WhatsAppConnectionRecord | null = null;
    try {
      connection = phoneNumberId ? await repository.findConnection(phoneNumberId) : null;
    } catch {
      throw new Error("WhatsApp Cloud API is not configured for this CRM.");
    }
    validateMetaConnection({
      phoneNumberId,
      readiness: getMetaWhatsAppReadiness(env),
      connection,
    });
  }
  if (mode === "meta" && input.caller === "HUMAN") {
    const latestInboundAt = await repository.findLatestInboundTimestamp(input.conversationId);
    if (!isWhatsAppCustomerWindowOpen(latestInboundAt)) {
      throw new Error("WhatsApp customer service window has expired; an approved Meta template is required.");
    }
  }
  provider ??= mode === "local" ? mockWhatsAppProvider : new MetaWhatsAppProvider();

  const pending = await repository.insertOutboundMessage({
    conversationId: input.conversationId,
    payload: input.payload,
    deliveryStatus: mode === "local" ? "queued" : "pending",
  });

  try {
    const providerResult = provider.sendWhatsAppMessage
      ? await provider.sendWhatsAppMessage({ ...input, recipientPhone })
      : input.payload.type === "text"
        ? await provider.sendWhatsAppTextMessage({ conversationId: input.conversationId, recipientPhone, text: input.payload.text, clientMessageId: input.clientMessageId })
        : (() => { throw new Error("WhatsApp provider does not support this message type"); })();
    const existing = await repository.findMessageByProviderId(providerResult.providerMessageId);
    if (existing && existing.id !== pending.id) {
      await repository.deleteOutboundMessage(pending.id);
      return { status: "duplicate", provider: providerResult, message: existing };
    }
    const message = await repository.updateOutboundMessage({
      messageId: pending.id,
      providerMessageId: providerResult.providerMessageId,
      deliveryStatus: mode === "local" ? "queued" : providerResult.status,
      messageTimestamp: providerResult.timestamp,
    });
    return { status: "sent", provider: providerResult, message };
  } catch (error) {
    await repository.updateOutboundMessage({
      messageId: pending.id,
      providerMessageId: null,
      deliveryStatus: "failed",
      messageTimestamp: new Date().toISOString(),
    });
    throw error;
  }
}
