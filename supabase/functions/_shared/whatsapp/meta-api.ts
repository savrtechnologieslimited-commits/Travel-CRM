/*
 * Runtime-neutral adaptation of WACRM's src/lib/whatsapp/meta-api.ts.
 * Copyright (c) 2026 Arnas Donauskas — MIT License (see WACRM LICENSE).
 * Uses named argument objects, typed Meta errors, and injectable fetch;
 * it contains no persistence, CRM contacts, or account model.
 */

import {
  validateInteractivePayload,
  type InteractiveButtonsPayload,
  type InteractiveListPayload,
} from "./interactive.ts";

export interface MetaSendResult {
  messageId: string;
}

export interface MetaPhoneInfo {
  id: string;
  display_phone_number: string;
  verified_name?: string;
  quality_rating?: string;
}

export interface WabaPhoneNumber {
  id: string;
  display_phone_number?: string;
  verified_name?: string;
}

export interface SubscribedApp {
  whatsapp_business_api_data?: {
    id?: string;
    name?: string;
    link?: string;
  };
}

interface MetaErrorEnvelope {
  message?: string;
  code?: number;
  error_subcode?: number;
  type?: string;
  fbtrace_id?: string;
  error_data?: { details?: string };
  error_user_title?: string;
  error_user_msg?: string;
}

interface MetaErrorResponse {
  error?: MetaErrorEnvelope;
}

export class MetaApiError extends Error {
  readonly code: number | null;
  readonly subcode: number | null;
  readonly type: string | null;
  readonly fbtraceId: string | null;
  readonly httpStatus: number;
  readonly details: string | null;

  constructor(
    message: string,
    fields: {
      code?: number | null;
      subcode?: number | null;
      type?: string | null;
      fbtraceId?: string | null;
      httpStatus: number;
      details?: string | null;
    },
  ) {
    super(message);
    this.name = "MetaApiError";
    this.code = fields.code ?? null;
    this.subcode = fields.subcode ?? null;
    this.type = fields.type ?? null;
    this.fbtraceId = fields.fbtraceId ?? null;
    this.httpStatus = fields.httpStatus;
    this.details = fields.details ?? null;
  }
}

export interface MetaCloudApiOptions {
  accessToken: string;
  phoneNumberId?: string;
  graphVersion?: string;
  fetchImpl?: typeof fetch;
}

export interface SendTextMessageArgs {
  to: string;
  text: string;
  contextMessageId?: string;
}

export interface SendTemplateMessageArgs {
  to: string;
  templateName: string;
  language?: string;
  components?: Record<string, unknown>[];
  contextMessageId?: string;
}

export type MediaKind = "image" | "video" | "document" | "audio";

export interface SendMediaMessageArgs {
  to: string;
  kind: MediaKind;
  link: string;
  caption?: string;
  filename?: string;
  contextMessageId?: string;
}

export interface MetaMediaInfo {
  url: string;
  mimeType: string;
  fileSize: number | null;
}

export interface DownloadedMetaMedia {
  bytes: Uint8Array;
  contentType: string;
}

function redactSecret(value: string | undefined, secret: string): string | null {
  if (typeof value !== "string") return null;
  return secret ? value.split(secret).join("[REDACTED]") : value;
}

export class MetaCloudApiClient {
  private readonly accessToken: string;
  private readonly phoneNumberId: string | undefined;
  private readonly graphVersion: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: MetaCloudApiOptions) {
    if (!options.accessToken.trim()) throw new Error("Meta access token is required");
    this.accessToken = options.accessToken;
    this.phoneNumberId = options.phoneNumberId?.trim() || undefined;
    this.graphVersion = options.graphVersion?.trim() || "v20.0";
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private endpoint(id: string, edge?: string): string {
    return `https://graph.facebook.com/${this.graphVersion}/${id}${edge ? `/${edge}` : ""}`;
  }

  private phoneId(override?: string): string {
    const id = override?.trim() || this.phoneNumberId;
    if (!id) throw new Error("Meta phone number ID is required");
    return id;
  }

  private async request(
    url: string,
    init: RequestInit = {},
    fallback = "Meta API request failed",
  ): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${this.accessToken}`);
    const response = await this.fetchImpl(url, { ...init, headers });
    if (!response.ok) {
      let envelope: MetaErrorEnvelope | undefined;
      try {
        envelope = (await response.json() as MetaErrorResponse).error;
      } catch {
        // Preserve the HTTP fallback when Meta returns a non-JSON response.
      }
      const errorMessage = redactSecret(envelope?.message, this.accessToken) ?? `${fallback}: ${response.status}`;
      const details = redactSecret(
        envelope?.error_data?.details ?? envelope?.error_user_msg ?? envelope?.error_user_title,
        this.accessToken,
      );
      throw new MetaApiError(errorMessage, {
        code: typeof envelope?.code === "number" ? envelope.code : null,
        subcode: typeof envelope?.error_subcode === "number" ? envelope.error_subcode : null,
        type: envelope?.type ?? null,
        fbtraceId: envelope?.fbtrace_id ?? null,
        httpStatus: response.status,
        details,
      });
    }
    return response;
  }

  private async sendMessage(phoneNumberId: string, to: string, body: Record<string, unknown>): Promise<MetaSendResult> {
    const response = await this.request(
      this.endpoint(phoneNumberId, "messages"),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to, ...body }),
      },
      "Meta WhatsApp API error",
    );
    const result = await response.json() as { messages?: { id?: string }[] };
    const messageId = result.messages?.[0]?.id;
    if (!messageId) {
      throw new MetaApiError("Meta API response did not include a message id", {
        httpStatus: response.status,
      });
    }
    return { messageId };
  }

  async sendTextMessage(args: SendTextMessageArgs): Promise<MetaSendResult> {
    return this.sendMessage(this.phoneId(), args.to, {
      type: "text",
      text: { body: args.text },
      ...(args.contextMessageId ? { context: { message_id: args.contextMessageId } } : {}),
    });
  }

  async sendTemplateMessage(args: SendTemplateMessageArgs): Promise<MetaSendResult> {
    return this.sendMessage(this.phoneId(), args.to, {
      type: "template",
      template: {
        name: args.templateName,
        language: { code: args.language ?? "en_US" },
        ...(args.components?.length ? { components: args.components } : {}),
      },
      ...(args.contextMessageId ? { context: { message_id: args.contextMessageId } } : {}),
    });
  }

  async sendMediaMessage(args: SendMediaMessageArgs): Promise<MetaSendResult> {
    if (!args.link) throw new Error("sendMediaMessage requires a link");
    const media: Record<string, string> = { link: args.link };
    if (args.caption && args.kind !== "audio") media["caption"] = args.caption;
    if (args.kind === "document" && args.filename) media["filename"] = args.filename;
    return this.sendMessage(this.phoneId(), args.to, {
      type: args.kind,
      [args.kind]: media,
      ...(args.contextMessageId ? { context: { message_id: args.contextMessageId } } : {}),
    });
  }

  async getMediaUrl(mediaId: string): Promise<MetaMediaInfo> {
    if (!mediaId.trim()) throw new Error("Meta media ID is required");
    const response = await this.request(this.endpoint(mediaId));
    const result = await response.json() as { url?: unknown; mime_type?: unknown; file_size?: unknown };
    if (typeof result.url !== "string") throw new Error("Meta media response did not include a download URL");
    const parsedUrl = new URL(result.url);
    if (parsedUrl.protocol !== "https:" || !isMetaMediaHost(parsedUrl.hostname)) {
      throw new Error("Meta returned an unsupported media download host");
    }
    const fileSize = Number(result.file_size);
    return {
      url: parsedUrl.toString(),
      mimeType: typeof result.mime_type === "string" ? result.mime_type : "application/octet-stream",
      fileSize: Number.isFinite(fileSize) && fileSize >= 0 ? fileSize : null,
    };
  }

  async downloadMedia(downloadUrl: string, maxBytes: number): Promise<DownloadedMetaMedia> {
    const url = new URL(downloadUrl);
    if (url.protocol !== "https:" || !isMetaMediaHost(url.hostname)) {
      throw new Error("WhatsApp media download URL is not a trusted Meta host");
    }
    const response = await this.fetchImpl(url, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
      redirect: "error",
    });
    if (!response.ok) {
      throw new MetaApiError(`Meta media download failed: ${response.status}`, { httpStatus: response.status });
    }

    const declaredLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      throw new Error(`Meta media exceeds the ${maxBytes}-byte storage limit`);
    }

    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    const reader = response.body?.getReader();
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        totalBytes += value.byteLength;
        if (totalBytes > maxBytes) {
          await reader.cancel();
          throw new Error(`Meta media exceeds the ${maxBytes}-byte storage limit`);
        }
        chunks.push(value);
      }
    } else {
      const bytes = new Uint8Array(await response.arrayBuffer());
      totalBytes = bytes.byteLength;
      if (totalBytes > maxBytes) throw new Error(`Meta media exceeds the ${maxBytes}-byte storage limit`);
      chunks.push(bytes);
    }

    const bytes = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return {
      bytes,
      contentType: response.headers.get("content-type") ?? "application/octet-stream",
    };
  }

  async sendInteractiveButtons(args: Omit<InteractiveButtonsPayload, "kind"> & { to: string }): Promise<MetaSendResult> {
    const payload: InteractiveButtonsPayload = { ...args, kind: "buttons" };
    const validation = validateInteractivePayload(payload);
    if (!validation.ok) throw new Error(validation.error);
    return this.sendMessage(this.phoneId(), args.to, {
      type: "interactive",
      interactive: {
        type: "button",
        ...(args.header ? { header: { type: "text", text: args.header } } : {}),
        body: { text: args.body },
        ...(args.footer ? { footer: { text: args.footer } } : {}),
        action: {
          buttons: args.buttons.map((button) => ({ type: "reply", reply: button })),
        },
      },
    });
  }

  async sendInteractiveList(args: Omit<InteractiveListPayload, "kind"> & { to: string }): Promise<MetaSendResult> {
    const payload: InteractiveListPayload = { ...args, kind: "list" };
    const validation = validateInteractivePayload(payload);
    if (!validation.ok) throw new Error(validation.error);
    return this.sendMessage(this.phoneId(), args.to, {
      type: "interactive",
      interactive: {
        type: "list",
        ...(args.header ? { header: { type: "text", text: args.header } } : {}),
        body: { text: args.body },
        ...(args.footer ? { footer: { text: args.footer } } : {}),
        action: { button: args.button_label, sections: args.sections },
      },
    });
  }

  async verifyPhoneNumber(phoneNumberId = this.phoneId()): Promise<MetaPhoneInfo> {
    const response = await this.request(
      `${this.endpoint(phoneNumberId)}?fields=id,display_phone_number,verified_name,quality_rating`,
    );
    return await response.json() as MetaPhoneInfo;
  }

  async registerPhoneNumber(phoneNumberId: string, pin: string): Promise<{ success: true; alreadyRegistered: boolean }> {
    const response = await this.fetchImpl(this.endpoint(phoneNumberId, "register"), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ messaging_product: "whatsapp", pin }),
    });
    if (response.ok) return { success: true, alreadyRegistered: false };
    let envelope: MetaErrorEnvelope | undefined;
    try {
      envelope = (await response.json() as MetaErrorResponse).error;
    } catch {
      // Fall through to the structured HTTP error below.
    }
    if (/already.*registered/i.test(envelope?.message ?? "")) {
      return { success: true, alreadyRegistered: true };
    }
    throw new MetaApiError(
      redactSecret(envelope?.message, this.accessToken) ?? `Meta API error: ${response.status}`,
      {
        code: envelope?.code ?? null,
        subcode: envelope?.error_subcode ?? null,
        type: envelope?.type ?? null,
        fbtraceId: envelope?.fbtrace_id ?? null,
        httpStatus: response.status,
        details: redactSecret(envelope?.error_data?.details, this.accessToken),
      },
    );
  }

  async subscribeWabaToApp(wabaId: string): Promise<void> {
    await this.request(this.endpoint(wabaId, "subscribed_apps"), { method: "POST" });
  }

  async listWabaPhoneNumbers(wabaId: string): Promise<WabaPhoneNumber[]> {
    const numbers: WabaPhoneNumber[] = [];
    let nextUrl: string | undefined = `${this.endpoint(wabaId, "phone_numbers")}?fields=id,display_phone_number,verified_name&limit=100`;
    for (let page = 0; nextUrl && page < 5; page += 1) {
      const response = await this.request(nextUrl);
      const result = await response.json() as { data?: WabaPhoneNumber[]; paging?: { next?: string } };
      numbers.push(...(result.data ?? []));
      nextUrl = result.paging?.next;
    }
    return numbers;
  }

  async getSubscribedApps(wabaId: string): Promise<SubscribedApp[]> {
    const response = await this.request(this.endpoint(wabaId, "subscribed_apps"));
    const result = await response.json() as { data?: SubscribedApp[] };
    return result.data ?? [];
  }
}

function isMetaMediaHost(hostname: string): boolean {
  return hostname === "facebook.com" || hostname.endsWith(".facebook.com") ||
    hostname.endsWith(".fbcdn.net") || hostname.endsWith(".fbsbx.com");
}
