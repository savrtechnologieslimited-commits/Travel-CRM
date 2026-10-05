import { processRuleBasedWhatsAppMessage } from "./rule-based-flow.ts";
import { createSupabaseRuleBasedOperations, type SupabaseLike } from "./supabase-rule-based-operations.ts";
import { createMetaReplySender } from "./meta-transport.ts";
import { verifyMetaWebhookSignature } from "../_shared/whatsapp/webhook-signature.ts";
import { MetaCloudApiClient } from "../_shared/whatsapp/meta-api.ts";
import {
  hasUsableIdentity,
  identityDisplayName,
  normalizeWhatsAppIdentityPhone,
  resolveContactSendTarget,
  resolveInboundIdentity,
  type WhatsAppIdentityContact,
} from "../_shared/whatsapp/identity.ts";

export type WhatsAppInboundMessage = {
  senderPhone: string;
  senderUserId?: string | null;
  senderParentUserId?: string | null;
  senderUsername?: string | null;
  senderDisplayName?: string | null;
  whatsappMessageId: string;
  messageType: string;
  body: string | null;
  mediaMetaId?: string | null;
  mediaMimeType?: string | null;
  mediaFileName?: string | null;
  selectionId: string | null;
  selectionTitle: string | null;
  businessPhoneNumberId: string | null;
  businessPhoneNumber: string | null;
  timestamp: string | null;
};

export type WhatsAppConversation = {
  id: string;
  customer_id: string | null;
  assigned_employee_id: string | null;
  lead_id: string | null;
  enquiry_id: string | null;
  conversation_mode: "AI_ACTIVE" | "HUMAN_ACTIVE";
  current_flow: "WELCOME" | "DESTINATION" | "QUESTIONS" | "COMPLETED";
  current_step: "START" | "SCOPE" | "DESTINATION" | "NAME" | "TRAVEL_DATE" | "ADULTS" | "CHILDREN" | "DEPARTURE_CITY" | "BUDGET" | "SPECIAL_REQUIREMENTS" | "COMPLETED";
};

export type IncomingMessageResult =
  | { status: "processed"; conversationId: string; aiTriggered: boolean }
  | { status: "duplicate"; conversationId: string }
  | { status: "ignored"; reason: "unsupported_event" | "invalid_message" };

export type WhatsAppDeliveryStatus = "sent" | "delivered" | "read" | "failed";

export type WhatsAppStatusUpdate = {
  whatsappMessageId: string;
  status: string;
  timestamp: string | null;
  error: string | null;
};

export type WhatsAppCrmIdentity = {
  customerId: string;
  leadId: string | null;
  enquiryId: string | null;
  displayName: string;
};

export type WhatsAppWebhookOperations = {
  resolveCrmIdentity: (identity: {
    phone: string;
    waUserId: string | null;
    waParentUserId: string | null;
    username: string | null;
    displayName: string | null;
  }) => Promise<WhatsAppCrmIdentity>;
  findOrCreateConversation: (input: {
    phone: string;
    customerId: string;
    leadId: string | null;
    enquiryId: string | null;
  }) => Promise<WhatsAppConversation>;
  findMessageByWhatsAppId: (whatsappMessageId: string) => Promise<{
    conversation_id: string;
  } | null>;
  createInboundMessage: (input: {
    conversationId: string;
    message: WhatsAppInboundMessage;
  }) => Promise<void>;
  updateMessageStatus: (input: {
    whatsappMessageId: string;
    status: WhatsAppDeliveryStatus;
    timestamp: string;
    error: string | null;
  }) => Promise<boolean>;
  processRuleBasedWhatsAppConversation: (input: {
    conversationId: string;
    body: string;
  }) => Promise<unknown>;
};

export type InboundMediaMirrorResult =
  | { status: "stored"; storagePath: string; mimeType: string }
  | { status: "too_large" | "unavailable" | "failed" };

export type InboundMediaMirror = (input: {
  conversationId: string;
  message: WhatsAppInboundMessage;
}) => Promise<InboundMediaMirrorResult>;

type SupabaseQuery = {
  error?: Error | null;
  select: (columns: string) => SupabaseQuery;
  eq: (column: string, value: string) => SupabaseQuery;
  maybeSingle: () => Promise<{ data: any; error: Error | null }>;
  single: () => Promise<{ data: any; error: Error | null }>;
  insert: (values: Record<string, unknown>) => SupabaseQuery;
  update: (values: Record<string, unknown>) => SupabaseQuery;
};

export type SupabaseWebhookClient = {
  from: (table: string) => SupabaseQuery;
  rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: any; error: Error | null }>;
};

export function createSupabaseWebhookOperations(
  supabase: SupabaseWebhookClient,
  processRuleBasedWhatsAppConversation: (input: { conversationId: string; body: string }) => Promise<unknown>,
  mirrorInboundMedia?: InboundMediaMirror,
): WhatsAppWebhookOperations {
  return {
    async resolveCrmIdentity(inputIdentity) {
      const { data, error } = await supabase.rpc("resolve_whatsapp_crm_identity", {
        p_phone: normalizeWhatsAppPhone(inputIdentity.phone),
        p_wa_user_id: inputIdentity.waUserId,
        p_wa_parent_user_id: inputIdentity.waParentUserId,
        p_username: inputIdentity.username,
        p_display_name: inputIdentity.displayName,
      });
      if (error) throw error;
      const identity = Array.isArray(data) ? data[0] : data;
      if (!identity?.customer_id) throw new Error("WhatsApp identity resolution did not return a customer");
      return {
        customerId: identity.customer_id,
        leadId: identity.lead_id ?? null,
        enquiryId: identity.enquiry_id ?? null,
        displayName: identity.display_name ?? "WhatsApp customer",
      };
    },
    async findOrCreateConversation({ phone, customerId, leadId, enquiryId }) {
      const { data, error } = await supabase.rpc("find_or_create_whatsapp_conversation", {
        p_phone: normalizeWhatsAppPhone(phone),
        p_customer_id: customerId,
        p_lead_id: leadId,
        p_enquiry_id: enquiryId,
      });
      if (error) throw error;
      const conversation = Array.isArray(data) ? data[0] : data;
      if (!conversation?.id) throw new Error("WhatsApp conversation resolution returned no conversation");
      return conversation as WhatsAppConversation;
    },
    async findMessageByWhatsAppId(whatsappMessageId) {
      const result = await supabase
        .from("whatsapp_messages")
        .select("conversation_id")
        .eq("wa_message_id", whatsappMessageId)
        .maybeSingle();
      if (result.error) throw result.error;
      return result.data;
    },
    async createInboundMessage({ conversationId, message }) {
      const result = await supabase
        .from("whatsapp_messages")
        .insert({
          conversation_id: conversationId,
          wa_message_id: message.whatsappMessageId,
          direction: "inbound",
          message_type: message.messageType,
          body: message.body,
          media_meta_id: message.mediaMetaId ?? null,
          media_mime_type: message.mediaMimeType ?? null,
          media_filename: message.mediaFileName ?? null,
          media_download_status: message.mediaMetaId ? "pending" : "not_media",
          delivery_status: "received",
          message_timestamp: messageTimestamp(message.timestamp),
        });
      if (result.error) {
        const duplicate = await this.findMessageByWhatsAppId(message.whatsappMessageId);
        if (duplicate) return;
        throw result.error;
      }
      if (!message.mediaMetaId) return;
      let mirrored: InboundMediaMirrorResult = { status: "unavailable" };
      try {
        mirrored = mirrorInboundMedia
          ? await mirrorInboundMedia({ conversationId, message })
          : { status: "unavailable" };
      } catch {
        mirrored = { status: "failed" };
      }
      const patch = mirrored.status === "stored"
        ? {
            media_storage_path: mirrored.storagePath,
            media_mime_type: mirrored.mimeType,
            media_download_status: "stored",
          }
        : { media_download_status: mirrored.status };
      const updated = await supabase.from("whatsapp_messages")
        .update(patch)
        .eq("wa_message_id", message.whatsappMessageId);
      if (updated.error) console.warn("WhatsApp media state update failed", updated.error);
    },
    async updateMessageStatus({ whatsappMessageId, status, timestamp, error: deliveryError }) {
      const { data, error } = await supabase.rpc("apply_whatsapp_message_status", {
        p_wa_message_id: whatsappMessageId,
        p_status: status,
        p_status_timestamp: timestamp,
        p_delivery_error: deliveryError,
      });
      if (error) throw error;
      return data === true;
    },
    processRuleBasedWhatsAppConversation,
  };
}

export const WHATSAPP_MEDIA_MAX_BYTES = 16 * 1024 * 1024;

const WHATSAPP_MEDIA_TYPES = new Set([
  "image/jpeg", "image/png", "image/webp", "image/gif",
  "video/mp4", "video/3gpp",
  "audio/aac", "audio/amr", "audio/mpeg", "audio/mp4", "audio/ogg", "audio/opus",
  "application/pdf", "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
]);

const WHATSAPP_MEDIA_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
  "video/mp4": "mp4", "video/3gpp": "3gp",
  "audio/aac": "aac", "audio/amr": "amr", "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/ogg": "ogg", "audio/opus": "opus",
  "application/pdf": "pdf", "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "text/plain": "txt",
};

export function createMetaInboundMediaMirror(
  supabase: SupabaseLike,
  options: { accessToken: string; graphVersion?: string; fetchImpl?: typeof fetch },
): InboundMediaMirror {
  if (!supabase.storage) return async () => ({ status: "unavailable" });
  const api = new MetaCloudApiClient({
    accessToken: options.accessToken,
    graphVersion: options.graphVersion,
    ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
  });

  return async ({ conversationId, message }) => {
    if (!message.mediaMetaId) return { status: "unavailable" };
    try {
      const info = await api.getMediaUrl(message.mediaMetaId);
      if (info.fileSize !== null && info.fileSize > WHATSAPP_MEDIA_MAX_BYTES) return { status: "too_large" };
      const downloaded = await api.downloadMedia(info.url, WHATSAPP_MEDIA_MAX_BYTES);
      const mimeType = (info.mimeType || downloaded.contentType).split(";")[0]?.trim().toLowerCase();
      if (!mimeType || !WHATSAPP_MEDIA_TYPES.has(mimeType)) return { status: "failed" };
      const mediaKey = message.mediaMetaId.replace(/[^A-Za-z0-9_-]/g, "_");
      const extension = WHATSAPP_MEDIA_EXTENSIONS[mimeType] ?? "bin";
      const storagePath = `${conversationId}/inbound/${mediaKey}.${extension}`;
      const { error } = await supabase.storage.from("whatsapp-media").upload(storagePath, downloaded.bytes, {
        contentType: mimeType,
        cacheControl: "3600",
        upsert: true,
      });
      if (error) return { status: "failed" };
      return { status: "stored", storagePath, mimeType };
    } catch (error) {
      return error instanceof Error && error.message.includes("storage limit")
        ? { status: "too_large" }
        : { status: "failed" };
    }
  };
}

export function createRuleBasedSupabaseWebhookOperations(
  supabase: SupabaseWebhookClient & SupabaseLike,
  sendReply: (conversationId: string, reply: { text: string; buttons?: string[]; list?: { id: string; title: string; description?: string }[]; document?: { url: string; name?: string | null } }) => Promise<void>,
  mirrorInboundMedia?: InboundMediaMirror,
): WhatsAppWebhookOperations {
  const flowOperations = createSupabaseRuleBasedOperations(supabase, sendReply);
  return createSupabaseWebhookOperations(
    supabase,
    ({ conversationId, body }) => processRuleBasedWhatsAppMessage(conversationId, body, flowOperations),
    mirrorInboundMedia,
  );
}

export type ParsedWebhook =
  | { kind: "message"; message: WhatsAppInboundMessage }
  | { kind: "status"; update: WhatsAppStatusUpdate }
  | { kind: "unsupported" }
  | { kind: "invalid" };

const runtime = globalThis as typeof globalThis & {
  Deno?: { env: { get(name: string): string | undefined } };
};

export function normalizeWhatsAppPhone(phone: string): string {
  return normalizeWhatsAppIdentityPhone(phone);
}

export { hasUsableIdentity, identityDisplayName, resolveContactSendTarget, resolveInboundIdentity };

function messageTimestamp(timestamp: string | null): string {
  if (!timestamp || !/^\d+$/.test(timestamp)) return new Date().toISOString();
  const date = new Date(Number(timestamp) * 1000);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

export function parseWhatsAppWebhook(payload: unknown): ParsedWebhook {
  if (!payload || typeof payload !== "object") return { kind: "invalid" };
  const root = payload as { entry?: unknown };
  if (!Array.isArray(root.entry)) return { kind: "unsupported" };

  for (const entry of root.entry) {
    if (!entry || typeof entry !== "object") continue;
    const changes = (entry as { changes?: unknown }).changes;
    if (!Array.isArray(changes)) continue;

    for (const change of changes) {
      if (!change || typeof change !== "object") continue;
      const value = (change as { value?: unknown }).value;
      if (!value || typeof value !== "object") continue;
      const typedValue = value as {
        metadata?: { display_phone_number?: unknown; phone_number_id?: unknown };
        messages?: unknown;
        statuses?: unknown;
        contacts?: unknown;
      };
      if (Array.isArray(typedValue.statuses)) {
        const status = typedValue.statuses.find((item) => item && typeof item === "object") as {
          id?: unknown;
          status?: unknown;
          timestamp?: unknown;
          errors?: Array<{ title?: unknown; message?: unknown; code?: unknown }>;
        } | undefined;
        if (typeof status?.id === "string" && typeof status.status === "string") {
          const providerError = status.errors?.[0];
          return {
            kind: "status",
            update: {
              whatsappMessageId: status.id,
              status: status.status,
              timestamp: typeof status.timestamp === "string" ? status.timestamp : null,
              error: typeof providerError?.message === "string"
                ? providerError.message
                : typeof providerError?.title === "string"
                  ? providerError.title
                  : typeof providerError?.code === "number" ? `Meta error ${providerError.code}` : null,
            },
          };
        }
      }
      if (!Array.isArray(typedValue.messages)) continue;

      const contacts = Array.isArray(typedValue.contacts)
        ? typedValue.contacts as WhatsAppIdentityContact[]
        : [];
      for (const [messageIndex, message] of typedValue.messages.entries()) {
        if (!message || typeof message !== "object") continue;
        const typedMessage = message as {
          from?: unknown;
          from_user_id?: unknown;
          from_parent_user_id?: unknown;
          id?: unknown;
          type?: unknown;
          timestamp?: unknown;
          text?: { body?: unknown };
          image?: { caption?: unknown; mime_type?: unknown; id?: unknown; sha256?: unknown };
          video?: { caption?: unknown; mime_type?: unknown; id?: unknown; sha256?: unknown };
          document?: { caption?: unknown; mime_type?: unknown; id?: unknown; filename?: unknown; sha256?: unknown };
          audio?: { id?: unknown; mime_type?: unknown; voice?: unknown; sha256?: unknown };
          sticker?: { id?: unknown; mime_type?: unknown; animated?: unknown; sha256?: unknown };
          interactive?: {
            type?: unknown;
            button_reply?: { id?: unknown; title?: unknown };
            list_reply?: { id?: unknown; title?: unknown; description?: unknown };
          };
        };
        if (
          typeof typedMessage.id !== "string" ||
          typeof typedMessage.type !== "string"
        ) {
          continue;
        }

        const buttonReply = typedMessage.interactive?.button_reply;
        const listReply = typedMessage.interactive?.list_reply;
        const selection = buttonReply ?? listReply;
        const selectionId = typeof selection?.id === "string" ? selection.id : null;
        const selectionTitle = typeof selection?.title === "string" ? selection.title : null;

        const mediaCandidate = (() => {
          if (typedMessage.type === "image" && typedMessage.image) return typedMessage.image;
          if (typedMessage.type === "video" && typedMessage.video) return typedMessage.video;
          if (typedMessage.type === "document" && typedMessage.document) return typedMessage.document;
          if (typedMessage.type === "audio" && typedMessage.audio) return typedMessage.audio;
          if (typedMessage.type === "sticker" && typedMessage.sticker) return typedMessage.sticker;
          return null;
        })();

        const mediaMetaId = typeof mediaCandidate?.id === "string" ? mediaCandidate.id : null;
        const mediaMimeType = typeof mediaCandidate?.mime_type === "string" ? mediaCandidate.mime_type : null;
        const mediaFileName = typeof mediaCandidate?.filename === "string" ? mediaCandidate.filename : null;

        const captionText =
          typeof typedMessage.image?.caption === "string" ? typedMessage.image.caption :
          typeof typedMessage.video?.caption === "string" ? typedMessage.video.caption :
          typeof typedMessage.document?.caption === "string" ? typedMessage.document.caption :
          null;

        const body = typedMessage.type === "text" && typeof typedMessage.text?.body === "string"
          ? typedMessage.text.body
          : (captionText ?? selectionTitle);

        const contact = contacts.find((candidate) =>
          (typeof typedMessage.from === "string" && candidate.wa_id === typedMessage.from) ||
          (typeof typedMessage.from_user_id === "string" && candidate.user_id === typedMessage.from_user_id),
        ) ?? contacts[messageIndex] ?? contacts[0] ?? null;
        const identity = resolveInboundIdentity({
          from: typeof typedMessage.from === "string" ? typedMessage.from : null,
          from_user_id: typeof typedMessage.from_user_id === "string" ? typedMessage.from_user_id : null,
          from_parent_user_id: typeof typedMessage.from_parent_user_id === "string" ? typedMessage.from_parent_user_id : null,
        }, contact);

        return {
          kind: "message",
          message: {
            senderPhone: identity.phone,
            senderUserId: identity.waUserId,
            senderParentUserId: identity.waParentUserId,
            senderUsername: identity.waUsername,
            senderDisplayName: identity.name,
            whatsappMessageId: typedMessage.id,
            messageType: typedMessage.type,
            body,
            mediaMetaId,
            mediaMimeType,
            mediaFileName,
            selectionId,
            selectionTitle,
            businessPhoneNumberId:
              typeof typedValue.metadata?.phone_number_id === "string"
                ? typedValue.metadata.phone_number_id
                : null,
            businessPhoneNumber:
              typeof typedValue.metadata?.display_phone_number === "string"
                ? normalizeWhatsAppPhone(typedValue.metadata.display_phone_number)
                : null,
            timestamp:
              typeof typedMessage.timestamp === "string" ? typedMessage.timestamp : null,
          },
        };
      }
    }
  }

  return { kind: "unsupported" };
}

export async function handleIncomingWhatsAppMessage(
  message: WhatsAppInboundMessage,
  operations: WhatsAppWebhookOperations,
): Promise<IncomingMessageResult> {
  const identity = resolveInboundIdentity({
    from: message.senderPhone,
    from_user_id: message.senderUserId,
    from_parent_user_id: message.senderParentUserId,
  }, {
    profile: { name: message.senderDisplayName, username: message.senderUsername },
  });
  if (!hasUsableIdentity(identity) || !message.whatsappMessageId) {
    return { status: "ignored", reason: "invalid_message" };
  }

  const duplicate = await operations.findMessageByWhatsAppId(message.whatsappMessageId);
  if (duplicate) {
    return { status: "duplicate", conversationId: duplicate.conversation_id };
  }

  const phone = identity.phone;
  const displayName = identityDisplayName(identity);
  const crmIdentity = await operations.resolveCrmIdentity({
    phone,
    waUserId: identity.waUserId,
    waParentUserId: identity.waParentUserId,
    username: identity.waUsername,
    displayName: displayName || null,
  });
  const conversation = await operations.findOrCreateConversation({
    phone,
    customerId: crmIdentity.customerId,
    leadId: crmIdentity.leadId,
    enquiryId: crmIdentity.enquiryId,
  });

  await operations.createInboundMessage({ conversationId: conversation.id, message });

  if (conversation.conversation_mode === "HUMAN_ACTIVE") {
    return { status: "processed", conversationId: conversation.id, aiTriggered: false };
  }

  if (!message.body?.trim()) {
    return { status: "processed", conversationId: conversation.id, aiTriggered: false };
  }
  await operations.processRuleBasedWhatsAppConversation({ conversationId: conversation.id, body: message.body });
  return { status: "processed", conversationId: conversation.id, aiTriggered: false };
}

function parseMetaDeliveryStatus(status: string): WhatsAppDeliveryStatus | null {
  return status === "sent" || status === "delivered" || status === "read" || status === "failed"
    ? status
    : null;
}

export function verificationResponse(request: Request, expectedToken: string | undefined): Response {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && Boolean(expectedToken) && token === expectedToken && challenge) {
    return new Response(challenge, { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

export async function webhookRequest(
  request: Request,
  dependencies: {
    verifyToken?: string;
    appSecret?: string;
    operations: WhatsAppWebhookOperations;
    tenantRouter?: {
      resolveTenant: (phoneNumberId: string) => Promise<{ tenantId: string | null; ready: boolean }>;
      processMessage: (tenantId: string, message: WhatsAppInboundMessage) => Promise<IncomingMessageResult>;
    };
  },
): Promise<Response> {
  if (request.method === "GET") {
    return verificationResponse(request, dependencies.verifyToken);
  }
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");
  if (!(await verifyMetaWebhookSignature(rawBody, signature, dependencies.appSecret))) {
    return new Response(JSON.stringify({ error: "Invalid webhook signature" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody) as unknown;
  } catch {
    return new Response(JSON.stringify({ error: "Malformed JSON" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const parsed = parseWhatsAppWebhook(payload);
  if (parsed.kind === "status") {
    const status = parseMetaDeliveryStatus(parsed.update.status);
    if (!status) {
      return new Response(JSON.stringify({ status: "ignored", reason: "unsupported_status" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    const matched = await dependencies.operations.updateMessageStatus({
      whatsappMessageId: parsed.update.whatsappMessageId,
      status,
      timestamp: messageTimestamp(parsed.update.timestamp),
      error: status === "failed" ? parsed.update.error : null,
    });
    return new Response(JSON.stringify({ status: matched ? "updated" : "unmatched", messageId: parsed.update.whatsappMessageId }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
  if (parsed.kind !== "message") {
    return new Response(JSON.stringify({ status: "ignored", reason: parsed.kind === "invalid" ? "invalid_event" : "unsupported_event" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  if (dependencies.tenantRouter) {
    if (!parsed.message.businessPhoneNumberId) {
      return new Response(JSON.stringify({ error: "Missing business phone number id" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }
    const route = await dependencies.tenantRouter.resolveTenant(parsed.message.businessPhoneNumberId);
    if (!route.ready) {
      return new Response(JSON.stringify({ error: "Tenant WhatsApp routing is not ready" }), {
        status: 503,
        headers: { "content-type": "application/json" },
      });
    }
    if (!route.tenantId) {
      return new Response(JSON.stringify({ error: "Unknown WhatsApp business phone number" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }
    const tenantResult = await dependencies.tenantRouter.processMessage(route.tenantId, parsed.message);
    return new Response(JSON.stringify(tenantResult), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  const result = await handleIncomingWhatsAppMessage(parsed.message, dependencies.operations);
  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

export function createWebhookRequestHandler(
  operations: WhatsAppWebhookOperations,
): (request: Request) => Promise<Response> {
  return (request) =>
    webhookRequest(request, {
      verifyToken: runtime.Deno?.env.get("WHATSAPP_VERIFY_TOKEN"),
      appSecret: runtime.Deno?.env.get("META_APP_SECRET"),
      operations,
    });
}

const edge = globalThis as typeof globalThis & {
  Deno?: {
    env: { get(name: string): string | undefined };
    serve?: (handler: (request: Request) => Response | Promise<Response>) => void;
  };
};

if (edge.Deno?.serve) {
  const { createClient } = await import("npm:@supabase/supabase-js@2");
  const supabaseUrl = edge.Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = edge.Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) throw new Error("Missing Supabase Edge Function configuration");
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const sendReply = createMetaReplySender(supabase, edge.Deno.env);
  const accessToken = edge.Deno.env.get("META_WHATSAPP_ACCESS_TOKEN") ?? edge.Deno.env.get("WHATSAPP_ACCESS_TOKEN");
  const mediaMirror = accessToken
    ? createMetaInboundMediaMirror(supabase, {
        accessToken,
        graphVersion: edge.Deno.env.get("META_WHATSAPP_GRAPH_VERSION"),
      })
    : undefined;
  edge.Deno.serve(createWebhookRequestHandler(createRuleBasedSupabaseWebhookOperations(supabase, sendReply, mediaMirror)));
}
