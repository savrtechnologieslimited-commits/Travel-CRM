import { MetaApiError, MetaCloudApiClient } from "../_shared/whatsapp/meta-api.ts";
import { validateInteractivePayload } from "../_shared/whatsapp/interactive.ts";

type MetaReply = {
  text: string;
  buttons?: string[];
  list?: { id: string; title: string; description?: string }[];
  document?: { url: string; name?: string | null };
};

type EdgeSupabase = { from: (table: string) => any };

export function createMetaReplySender(
  supabase: EdgeSupabase,
  env: { get(name: string): string | undefined },
  fetchImpl: typeof fetch = fetch,
) {
  return async (conversationId: string, reply: MetaReply): Promise<void> => {
    const conversation = await supabase.from("whatsapp_conversations").select("phone_number").eq("id", conversationId).single();
    if (conversation.error) throw conversation.error;

    const accessToken = env.get("META_WHATSAPP_ACCESS_TOKEN") ?? env.get("WHATSAPP_ACCESS_TOKEN");
    const phoneNumberId = env.get("META_WHATSAPP_PHONE_NUMBER_ID") ?? env.get("WHATSAPP_PHONE_NUMBER_ID");
    const graphVersion = env.get("META_WHATSAPP_GRAPH_VERSION") ?? "v20.0";
    if (!accessToken || !phoneNumberId) throw new Error("WhatsApp Meta configuration is missing");

    const api = new MetaCloudApiClient({ accessToken, phoneNumberId, graphVersion, fetchImpl });
    let providerMessageId: string | null = null;
    let failure: unknown = null;
    const messageType = reply.document ? "document" : reply.buttons?.length || reply.list?.length ? "interactive" : "text";

    try {
      if (reply.document) {
        providerMessageId = (await api.sendMediaMessage({
          to: conversation.data.phone_number,
          kind: "document",
          link: reply.document.url,
          caption: reply.text,
          ...(reply.document.name ? { filename: reply.document.name } : {}),
        })).messageId;
      } else if (reply.buttons?.length) {
        const buttons = reply.buttons.slice(0, 3).map((title) => ({
          id: title.toLowerCase().replace(/\s+/g, "_"),
          title: title.slice(0, 20),
        }));
        const payload = { kind: "buttons" as const, body: reply.text, buttons };
        const validation = validateInteractivePayload(payload);
        if (!validation.ok) throw new Error(validation.error);
        providerMessageId = (await api.sendInteractiveButtons({
          to: conversation.data.phone_number,
          body: payload.body,
          buttons: payload.buttons,
        })).messageId;
      } else if (reply.list?.length) {
        const payload = {
          kind: "list" as const,
          body: reply.text,
          button_label: "View destinations",
          sections: [{ title: "Destinations", rows: reply.list.slice(0, 10) }],
        };
        const validation = validateInteractivePayload(payload);
        if (!validation.ok) throw new Error(validation.error);
        providerMessageId = (await api.sendInteractiveList({
          to: conversation.data.phone_number,
          body: payload.body,
          button_label: payload.button_label,
          sections: payload.sections,
        })).messageId;
      } else {
        providerMessageId = (await api.sendTextMessage({
          to: conversation.data.phone_number,
          text: reply.text,
        })).messageId;
      }
    } catch (error) {
      failure = error;
      if (error instanceof MetaApiError) {
        console.error("[WhatsApp Meta] outbound request failed", {
          endpoint: `https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`,
          http_status: error.httpStatus,
          message_type: messageType,
          meta_error_code: error.code,
          meta_error_type: error.type,
          meta_error_message: error.message,
          meta_error_subcode: error.subcode,
          meta_error_details: error.details,
          fbtrace_id: error.fbtraceId,
        });
      }
    }

    await supabase.from("whatsapp_messages").insert({
      conversation_id: conversationId,
      wa_message_id: providerMessageId,
      direction: "outbound",
      message_type: messageType,
      body: reply.text,
      media_url: reply.document?.url ?? null,
      media_mime_type: reply.document ? "application/pdf" : null,
      delivery_status: providerMessageId ? "accepted" : "failed",
      message_timestamp: new Date().toISOString(),
    });

    if (providerMessageId) return;
    if (reply.document) {
      await createMetaReplySender(supabase, env, fetchImpl)(conversationId, { text: "I could not send the destination PDF, but we can continue with your travel request." });
      return;
    }
    const errorMessage = failure instanceof Error ? failure.message : "Unknown Meta API error";
    throw new Error(`WhatsApp delivery failed: ${errorMessage}`, { cause: failure });
  };
}
