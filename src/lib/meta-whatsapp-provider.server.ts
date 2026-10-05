import type {
  SendWhatsAppMessageInput,
  SendWhatsAppTextMessageInput,
  WhatsAppOutboundPayload,
  WhatsAppProvider,
  WhatsAppProviderResult,
} from "./whatsapp-provider.server";
import {
  MetaApiError,
  MetaCloudApiClient,
} from "../../supabase/functions/_shared/whatsapp/meta-api.ts";
import { validateInteractivePayload } from "../../supabase/functions/_shared/whatsapp/interactive.ts";

type MetaProviderOptions = {
  accessToken?: string;
  phoneNumberId?: string;
  graphVersion?: string;
  fetchImpl?: typeof fetch;
};

type MetaErrorResponse = {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    error_user_title?: string;
    error_user_msg?: string;
    fbtrace_id?: string;
  };
};

function logMetaFailure(input: {
  endpoint: string;
  status: number;
  messageType: WhatsAppOutboundPayload["type"];
  error?: MetaErrorResponse["error"];
}) {
  console.error("[WhatsApp Meta] outbound request failed", {
    endpoint: input.endpoint,
    http_status: input.status,
    message_type: input.messageType,
    meta_error_code: input.error?.code ?? null,
    meta_error_type: input.error?.type ?? null,
    meta_error_message: input.error?.message ?? null,
    meta_error_subcode: input.error?.error_subcode ?? null,
    meta_error_details: input.error?.error_user_msg ?? input.error?.error_user_title ?? null,
  });
}

function required(value: string | undefined, name: string): string {
  const result = value?.trim();
  if (!result) throw new Error(`Missing WhatsApp configuration: ${name}`);
  return result;
}

function envValue(primary: string, fallback: string): string | undefined {
  return process.env[primary]?.trim() || process.env[fallback]?.trim();
}

export type MetaWhatsAppReadiness = {
  ready: boolean;
  missing: string[];
  hasAccessToken: boolean;
  hasPhoneNumberId: boolean;
  hasAppSecret: boolean;
  hasVerifyToken: boolean;
};

export function getMetaWhatsAppReadiness(env: Record<string, string | undefined> = process.env): MetaWhatsAppReadiness {
  const missing: string[] = [];
  const accessToken = env["META_WHATSAPP_ACCESS_TOKEN"]?.trim() ?? env["WHATSAPP_ACCESS_TOKEN"]?.trim();
  const phoneNumberId = env["META_WHATSAPP_PHONE_NUMBER_ID"]?.trim() ?? env["WHATSAPP_PHONE_NUMBER_ID"]?.trim();
  const appSecret = env["META_APP_SECRET"]?.trim();
  const verifyToken = env["WHATSAPP_VERIFY_TOKEN"]?.trim();

  if (!accessToken) missing.push("META_WHATSAPP_ACCESS_TOKEN");
  if (!phoneNumberId) missing.push("META_WHATSAPP_PHONE_NUMBER_ID");
  if (!appSecret) missing.push("META_APP_SECRET");
  if (!verifyToken) missing.push("WHATSAPP_VERIFY_TOKEN");

  return {
    ready: missing.length === 0,
    missing,
    hasAccessToken: Boolean(accessToken),
    hasPhoneNumberId: Boolean(phoneNumberId),
    hasAppSecret: Boolean(appSecret),
    hasVerifyToken: Boolean(verifyToken),
  };
}

export function metaPayload(payload: WhatsAppOutboundPayload, recipientPhone: string): Record<string, unknown> {
  const base = { messaging_product: "whatsapp", recipient_type: "individual", to: recipientPhone };
  if (payload.type === "text") return { ...base, type: "text", text: { preview_url: false, body: payload.text } };
  if (payload.type === "image") {
    return {
      ...base,
      type: "image",
      image: { link: payload.url, ...(payload.caption ? { caption: payload.caption } : {}) },
    };
  }
  if (payload.type === "video") {
    return { ...base, type: "video", video: { link: payload.url, ...(payload.caption ? { caption: payload.caption } : {}) } };
  }
  if (payload.type === "audio") {
    return { ...base, type: "audio", audio: { link: payload.url } };
  }
  if (payload.type === "document") {
    return {
      ...base,
      type: "document",
      document: { link: payload.url, ...(payload.caption ? { caption: payload.caption } : {}), ...(payload.filename ? { filename: payload.filename } : {}) },
    };
  }
  if (payload.type === "buttons") {
    return {
      ...base,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: payload.text },
        action: { buttons: payload.buttons.slice(0, 3).map((button) => ({ type: "reply", reply: button })) },
      },
    };
  }
  return {
    ...base,
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: payload.text },
      action: { button: payload.buttonText, sections: payload.sections },
    },
  };
}

export class MetaWhatsAppProvider implements WhatsAppProvider {
  private readonly phoneNumberId: string;
  private readonly graphVersion: string;
  private readonly api: MetaCloudApiClient;

  constructor(options: MetaProviderOptions = {}) {
    const env = process.env;
    const accessToken = required(options.accessToken ?? envValue("META_WHATSAPP_ACCESS_TOKEN", "WHATSAPP_ACCESS_TOKEN"), "META_WHATSAPP_ACCESS_TOKEN");
    const phoneNumberId = required(options.phoneNumberId ?? envValue("META_WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_PHONE_NUMBER_ID"), "META_WHATSAPP_PHONE_NUMBER_ID");
    const readiness = getMetaWhatsAppReadiness(env);
    if (!readiness.hasAppSecret || !readiness.hasVerifyToken) {
      console.warn("WhatsApp Meta readiness check: webhook credentials are not configured yet.", {
        missing: readiness.missing,
      });
    }
    this.phoneNumberId = phoneNumberId;
    this.graphVersion = options.graphVersion ?? process.env["META_WHATSAPP_GRAPH_VERSION"] ?? "v20.0";
    this.api = new MetaCloudApiClient({
      accessToken,
      phoneNumberId,
      graphVersion: this.graphVersion,
      ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
    });
  }

  async sendWhatsAppMessage(input: SendWhatsAppMessageInput): Promise<WhatsAppProviderResult> {
    const endpoint = `https://graph.facebook.com/${this.graphVersion}/${this.phoneNumberId}/messages`;
    let messageId: string;
    try {
      const payload = input.payload;
      if (payload.type === "text") {
        messageId = (await this.api.sendTextMessage({ to: input.recipientPhone, text: payload.text })).messageId;
      } else if (payload.type === "image") {
        messageId = (await this.api.sendMediaMessage({
          to: input.recipientPhone,
          kind: "image",
          link: payload.url,
          ...(payload.caption ? { caption: payload.caption } : {}),
        })).messageId;
      } else if (payload.type === "video" || payload.type === "audio") {
        messageId = (await this.api.sendMediaMessage({
          to: input.recipientPhone,
          kind: payload.type,
          link: payload.url,
          ...(payload.type === "video" && payload.caption ? { caption: payload.caption } : {}),
        })).messageId;
      } else if (payload.type === "document") {
        messageId = (await this.api.sendMediaMessage({
          to: input.recipientPhone,
          kind: "document",
          link: payload.url,
          ...(payload.caption ? { caption: payload.caption } : {}),
          ...(payload.filename ? { filename: payload.filename } : {}),
        })).messageId;
      } else if (payload.type === "buttons") {
        const interactive = { kind: "buttons" as const, body: payload.text, buttons: payload.buttons };
        const validation = validateInteractivePayload(interactive);
        if (!validation.ok) throw new Error(validation.error);
        messageId = (await this.api.sendInteractiveButtons({
          to: input.recipientPhone,
          body: interactive.body,
          buttons: interactive.buttons,
        })).messageId;
      } else {
        const interactive = {
          kind: "list" as const,
          body: payload.text,
          button_label: payload.buttonText,
          sections: payload.sections,
        };
        const validation = validateInteractivePayload(interactive);
        if (!validation.ok) throw new Error(validation.error);
        messageId = (await this.api.sendInteractiveList({
          to: input.recipientPhone,
          body: interactive.body,
          button_label: interactive.button_label,
          sections: interactive.sections,
        })).messageId;
      }
    } catch (error) {
      const metaError = error instanceof MetaApiError ? error : undefined;
      if (metaError) {
        logMetaFailure({
          endpoint,
          status: metaError.httpStatus,
          messageType: input.payload.type,
          error: {
            message: metaError.message,
            ...(metaError.type ? { type: metaError.type } : {}),
            ...(metaError.code !== null ? { code: metaError.code } : {}),
            ...(metaError.subcode !== null ? { error_subcode: metaError.subcode } : {}),
            ...(metaError.details ? { error_user_msg: metaError.details } : {}),
            ...(metaError.fbtraceId ? { fbtrace_id: metaError.fbtraceId } : {}),
          },
        });
      }
      const message = error instanceof Error ? error.message : "Unknown Meta API error";
      throw new Error(`WhatsApp delivery failed: ${message}`, { cause: error });
    }
    return {
      providerMessageId: messageId,
      status: "accepted",
      timestamp: new Date().toISOString(),
      recipient: input.recipientPhone,
      messageType: input.payload.type === "document" || input.payload.type === "image" || input.payload.type === "video" || input.payload.type === "audio"
        ? input.payload.type
        : input.payload.type === "text" ? "text" : "interactive",
    };
  }

  async sendWhatsAppTextMessage(input: SendWhatsAppTextMessageInput): Promise<WhatsAppProviderResult> {
    return this.sendWhatsAppMessage({ ...input, payload: { type: "text", text: input.text } });
  }
}
