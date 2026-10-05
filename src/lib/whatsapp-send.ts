import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { WhatsAppOutboundPayload } from "./whatsapp-provider.server";

export type WhatsAppSendRequest = {
  conversationId: string;
  payload: WhatsAppOutboundPayload;
  replyToMessageId?: string | null;
};

function validateSendRequest(input: unknown): WhatsAppSendRequest {
  if (!input || typeof input !== "object") throw new Error("Invalid WhatsApp send request");
  const value = input as Record<string, unknown>;
  if (typeof value["conversationId"] !== "string" || !value["conversationId"].trim()) {
    throw new Error("A WhatsApp conversation is required");
  }
  const replyToMessageId = value["replyToMessageId"];
  if (replyToMessageId !== undefined && replyToMessageId !== null && (typeof replyToMessageId !== "string" || !replyToMessageId.trim())) {
    throw new Error("Invalid WhatsApp reply target");
  }
  const payload = value["payload"] as Record<string, unknown> | null;
  if (!payload || typeof payload !== "object" || typeof payload["type"] !== "string") {
    throw new Error("Unsupported WhatsApp message type");
  }

  switch (payload["type"]) {
    case "text":
      if (typeof payload["text"] !== "string" || !payload["text"].trim()) throw new Error("Write a message first");
      break;
    case "image":
    case "video":
    case "audio":
      if ((typeof payload["url"] !== "string" || !payload["url"].trim()) && typeof payload["storagePath"] !== "string") throw new Error("Attach a media file or add a public HTTPS media URL");
      break;
    case "document":
      if ((typeof payload["url"] !== "string" || !payload["url"].trim()) && typeof payload["storagePath"] !== "string") throw new Error("Attach a document or add a public HTTPS URL");
      break;
    case "buttons":
      if (typeof payload["text"] !== "string" || !Array.isArray(payload["buttons"])) throw new Error("Invalid interactive button message");
      break;
    case "list":
      if (typeof payload["text"] !== "string" || typeof payload["buttonText"] !== "string" || !Array.isArray(payload["sections"])) {
        throw new Error("Invalid interactive list message");
      }
      break;
    default:
      throw new Error("Unsupported WhatsApp message type");
  }

  return {
    conversationId: value["conversationId"],
    payload: payload as WhatsAppOutboundPayload,
    replyToMessageId: typeof replyToMessageId === "string" ? replyToMessageId : null,
  };
}

function safeSendError(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("not configured for this CRM") || message.includes("Missing WhatsApp configuration")) {
    return "WhatsApp Cloud API is not configured for this CRM.";
  }
  if (message.includes("valid WhatsApp recipient")) return "This conversation has an invalid WhatsApp recipient number.";
  if (message.includes("HUMAN_ACTIVE")) return "Automated replies are paused because this conversation is assigned to a human.";
  if (message.includes("customer service window has expired")) {
    return "The 24-hour WhatsApp reply window has expired. A Meta-approved template send is not available in this CRM yet.";
  }
  if (message.includes("conversation not found") || message.includes("not available")) return "This WhatsApp conversation is not available.";
  if (message.includes("WhatsApp message text is required") || message.includes("Write a message first")) return "Write a message first.";
  if (message.includes("HTTPS URL") || message.includes("Document filename") || message.includes("interactive")) return message;
  return "WhatsApp could not send this message. Check the connection and try again.";
}

export const getWhatsAppSendModeFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { resolveWhatsAppSendMode } = await import("./whatsapp-outbound.server");
    return { mode: resolveWhatsAppSendMode() };
  });

export const sendWhatsAppMessageFn = createServerFn({ method: "POST" })
  .validator(validateSendRequest)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { data: conversation, error } = await context.supabase
      .from("whatsapp_conversations")
      .select("id,phone_number")
      .eq("id", data.conversationId)
      .maybeSingle();
    if (error || !conversation) throw new Error("This WhatsApp conversation is not available.");

    if (data.replyToMessageId) {
      const { data: replyTarget, error: replyTargetError } = await context.supabase
        .from("whatsapp_messages")
        .select("id")
        .eq("id", data.replyToMessageId)
        .eq("conversation_id", data.conversationId)
        .maybeSingle();
      if (replyTargetError || !replyTarget) throw new Error("The WhatsApp reply target is unavailable.");
    }

    let payload = data.payload;
    if ("storagePath" in payload && payload.storagePath) {
      if (!payload.storagePath.startsWith(`${data.conversationId}/`) || payload.storagePath.includes("..")) {
        throw new Error("The WhatsApp attachment is not available for this conversation.");
      }
      const { data: signed, error: signingError } = await context.supabase.storage
        .from("whatsapp-media")
        .createSignedUrl(payload.storagePath, 3600);
      if (signingError || !signed?.signedUrl) throw new Error("Could not prepare the WhatsApp attachment.");
      payload = { ...payload, url: signed.signedUrl } as WhatsAppOutboundPayload;
    }

    try {
      const { sendWhatsAppMessage, resolveWhatsAppSendMode } = await import("./whatsapp-outbound.server");
      const result = await sendWhatsAppMessage({
        conversationId: data.conversationId,
        recipientPhone: conversation.phone_number,
        payload,
        caller: "HUMAN",
      });
      if (data.replyToMessageId) {
        const { error: replyUpdateError } = await context.supabase
          .from("whatsapp_messages")
          .update({ reply_to_message_id: data.replyToMessageId } as never)
          .eq("id", result.message.id)
          .eq("conversation_id", data.conversationId);
        if (replyUpdateError) console.error("Failed to persist WhatsApp reply context", replyUpdateError.message);
      }
      return { ...result, mode: resolveWhatsAppSendMode() };
    } catch (error) {
      throw new Error(safeSendError(error));
    }
  });
