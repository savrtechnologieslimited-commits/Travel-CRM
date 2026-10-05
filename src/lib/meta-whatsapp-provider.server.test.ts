import { describe, expect, test } from "bun:test";
import { MetaApiError } from "../../supabase/functions/_shared/whatsapp/meta-api.ts";
import { validateInteractivePayload } from "../../supabase/functions/_shared/whatsapp/interactive.ts";
import { getMetaWhatsAppReadiness, MetaWhatsAppProvider, metaPayload } from "./meta-whatsapp-provider.server";

describe("Meta WhatsApp Cloud API provider", () => {
  test("reports missing Meta webhook and provider credentials without creating a live connection", () => {
    const readiness = getMetaWhatsAppReadiness({});
    expect(readiness.ready).toBe(false);
    expect(readiness.missing).toEqual(expect.arrayContaining([
      "META_WHATSAPP_ACCESS_TOKEN",
      "META_WHATSAPP_PHONE_NUMBER_ID",
      "META_APP_SECRET",
      "WHATSAPP_VERIFY_TOKEN",
    ]));
  });

  test("builds a text payload", () => {
    expect(metaPayload({ type: "text", text: "Hello" }, "919999999999")).toEqual({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "919999999999",
      type: "text",
      text: { preview_url: false, body: "Hello" },
    });
  });

  test("builds reply-button and list payloads", () => {
    expect(metaPayload({ type: "buttons", text: "Choose", buttons: [{ id: "domestic", title: "Domestic" }] }, "919999999999")).toMatchObject({
      type: "interactive",
      interactive: { type: "button", action: { buttons: [{ type: "reply", reply: { id: "domestic", title: "Domestic" } }] } },
    });
    expect(metaPayload({ type: "list", text: "Choose destination", buttonText: "Destinations", sections: [{ title: "International", rows: [{ id: "dubai", title: "Dubai" }] }] }, "919999999999")).toMatchObject({
      type: "interactive",
      interactive: { type: "list", action: { button: "Destinations", sections: [{ title: "International", rows: [{ id: "dubai", title: "Dubai" }] }] } },
    });
  });

  test("builds a document payload", () => {
    expect(metaPayload({ type: "document", url: "https://cdn.example.test/dubai.pdf", caption: "Dubai guide", filename: "dubai.pdf" }, "919999999999")).toMatchObject({
      type: "document",
      document: { link: "https://cdn.example.test/dubai.pdf", caption: "Dubai guide", filename: "dubai.pdf" },
    });
  });

  test("builds video and audio payloads", () => {
    expect(metaPayload({ type: "video", url: "https://cdn.example.test/clip.mp4", caption: "Highlights" }, "919999999999"))
      .toMatchObject({ type: "video", video: { link: "https://cdn.example.test/clip.mp4", caption: "Highlights" } });
    expect(metaPayload({ type: "audio", url: "https://cdn.example.test/note.ogg" }, "919999999999"))
      .toMatchObject({ type: "audio", audio: { link: "https://cdn.example.test/note.ogg" } });
  });

  test("builds and sends an image payload through the shared media adapter", async () => {
    const payloads: Record<string, unknown>[] = [];
    const provider = new MetaWhatsAppProvider({
      accessToken: "secret-token",
      phoneNumberId: "phone-number-1",
      fetchImpl: async (_input, init) => {
        payloads.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        return new Response(JSON.stringify({ messages: [{ id: "wamid.image-1" }] }), { status: 200 });
      },
    });
    const result = await provider.sendWhatsAppMessage({
      conversationId: "c-1",
      recipientPhone: "919999999999",
      payload: { type: "image", url: "https://cdn.example.test/cover.jpg", caption: "Trip cover" },
    });
    expect(result).toMatchObject({ providerMessageId: "wamid.image-1", messageType: "image" });
    expect(payloads[0]).toMatchObject({ type: "image", image: { link: "https://cdn.example.test/cover.jpg", caption: "Trip cover" } });
  });

  test("validates interactive buttons and list payloads before sending", () => {
    expect(validateInteractivePayload({
      kind: "buttons",
      body: "Choose a trip type",
      buttons: [{ id: "domestic", title: "Domestic" }, { id: "international", title: "International" }],
    })).toEqual({ ok: true });
    expect(validateInteractivePayload({
      kind: "list",
      body: "Choose a destination",
      button_label: "Destinations",
      sections: [{ title: "Popular", rows: [{ id: "goa", title: "Goa" }] }],
    })).toEqual({ ok: true });
    expect(validateInteractivePayload({
      kind: "buttons",
      body: "Choose",
      buttons: [{ id: "too-long", title: "This button title is over twenty" }],
    })).toMatchObject({ ok: false });
  });

  test("posts to the Meta messages endpoint without exposing the token in errors", async () => {
    let request: Request | null = null;
    const provider = new MetaWhatsAppProvider({
      accessToken: "secret-token",
      phoneNumberId: "phone-number-1",
      graphVersion: "v20.0",
      fetchImpl: async (input, init) => {
        request = new Request(input, init);
        return new Response(JSON.stringify({ messages: [{ id: "wamid.out-1" }] }), { status: 200 });
      },
    });
    const result = await provider.sendWhatsAppMessage({ conversationId: "c-1", recipientPhone: "919999999999", payload: { type: "text", text: "Hello" } });
    expect(result).toMatchObject({ providerMessageId: "wamid.out-1", status: "accepted", messageType: "text" });
    expect(request?.url).toBe("https://graph.facebook.com/v20.0/phone-number-1/messages");
    expect(request?.headers.get("authorization")).toBe("Bearer secret-token");
  });

  test("sends text, buttons, lists, and documents through the shared Meta adapter", async () => {
    const payloads: Record<string, unknown>[] = [];
    let nextMessageId = 0;
    const provider = new MetaWhatsAppProvider({
      accessToken: "secret-token",
      phoneNumberId: "phone-number-1",
      fetchImpl: async (_input, init) => {
        payloads.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        nextMessageId += 1;
        return new Response(JSON.stringify({ messages: [{ id: `wamid.${nextMessageId}` }] }), { status: 200 });
      },
    });

    const results = await Promise.all([
      provider.sendWhatsAppMessage({ conversationId: "c-1", recipientPhone: "919999999999", payload: { type: "text", text: "Welcome" } }),
      provider.sendWhatsAppMessage({ conversationId: "c-1", recipientPhone: "919999999999", payload: { type: "buttons", text: "Choose", buttons: [{ id: "domestic", title: "Domestic" }, { id: "international", title: "International" }] } }),
      provider.sendWhatsAppMessage({ conversationId: "c-1", recipientPhone: "919999999999", payload: { type: "list", text: "Pick a destination", buttonText: "View destinations", sections: [{ title: "Popular", rows: [{ id: "goa", title: "Goa" }] }] } }),
      provider.sendWhatsAppMessage({ conversationId: "c-1", recipientPhone: "919999999999", payload: { type: "document", url: "https://cdn.example.test/guide.pdf", caption: "Travel guide", filename: "guide.pdf" } }),
    ]);

    expect(results.map((result) => result.messageType)).toEqual(["text", "interactive", "interactive", "document"]);
    expect(results.map((result) => result.providerMessageId)).toEqual(["wamid.1", "wamid.2", "wamid.3", "wamid.4"]);
    expect(payloads.map((body) => body.type)).toEqual(["text", "interactive", "interactive", "document"]);
    expect(payloads[1]?.interactive).toMatchObject({ type: "button", action: { buttons: [
      { type: "reply", reply: { id: "domestic", title: "Domestic" } },
      { type: "reply", reply: { id: "international", title: "International" } },
    ] } });
    expect(payloads[2]?.interactive).toMatchObject({ type: "list", action: { button: "View destinations", sections: [{ title: "Popular", rows: [{ id: "goa", title: "Goa" }] }] } });
    expect(payloads[3]?.document).toMatchObject({ link: "https://cdn.example.test/guide.pdf", filename: "guide.pdf" });
  });

  test("does not treat Meta failures as sent", async () => {
    const provider = new MetaWhatsAppProvider({
      accessToken: "secret-token",
      phoneNumberId: "phone-number-1",
      fetchImpl: async () => new Response(JSON.stringify({ error: { message: "Invalid OAuth access token", code: 190 } }), { status: 401 }),
    });
    await expect(provider.sendWhatsAppTextMessage({ conversationId: "c-1", recipientPhone: "919999999999", text: "Hello" })).rejects.toThrow("WhatsApp delivery failed: Invalid OAuth access token");
  });

  test("handles Meta server errors, network failures, and malformed success responses without success IDs", async () => {
    const httpFailure = new MetaWhatsAppProvider({
      accessToken: "secret-token",
      phoneNumberId: "phone-number-1",
      fetchImpl: async () => new Response(JSON.stringify({ error: { message: "Temporary service issue", code: 2 } }), { status: 503 }),
    });
    await expect(httpFailure.sendWhatsAppTextMessage({ conversationId: "c-1", recipientPhone: "919999999999", text: "Hello" }))
      .rejects.toThrow("WhatsApp delivery failed: Temporary service issue");

    const networkFailure = new MetaWhatsAppProvider({
      accessToken: "secret-token",
      phoneNumberId: "phone-number-1",
      fetchImpl: async () => { throw new Error("network unavailable"); },
    });
    await expect(networkFailure.sendWhatsAppTextMessage({ conversationId: "c-1", recipientPhone: "919999999999", text: "Hello" }))
      .rejects.toThrow("WhatsApp delivery failed: network unavailable");

    const malformedSuccess = new MetaWhatsAppProvider({
      accessToken: "secret-token",
      phoneNumberId: "phone-number-1",
      fetchImpl: async () => new Response(JSON.stringify({ messages: [] }), { status: 200 }),
    });
    await expect(malformedSuccess.sendWhatsAppTextMessage({ conversationId: "c-1", recipientPhone: "919999999999", text: "Hello" }))
      .rejects.toThrow("Meta API response did not include a message id");
  });

  test("normalizes Meta errors and retains safe structured diagnostics", async () => {
    const provider = new MetaWhatsAppProvider({
      accessToken: "secret-token",
      phoneNumberId: "phone-number-1",
      fetchImpl: async () => new Response(JSON.stringify({ error: {
        message: "Invalid OAuth access token",
        type: "OAuthException",
        code: 190,
        error_subcode: 463,
        fbtrace_id: "trace-123",
        error_data: { details: "Token expired" },
      } }), { status: 401 }),
    });
    let caught: unknown;
    try {
      await provider.sendWhatsAppTextMessage({ conversationId: "c-1", recipientPhone: "919999999999", text: "Hello" });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toBe("WhatsApp delivery failed: Invalid OAuth access token");
    expect((caught as Error).cause).toBeInstanceOf(MetaApiError);
    expect((caught as Error).cause).toMatchObject({ code: 190, subcode: 463, fbtraceId: "trace-123", httpStatus: 401, details: "Token expired" });
    expect(JSON.stringify(caught)).not.toContain("secret-token");
  });

  test("logs safe Meta failure diagnostics without the access token", async () => {
    const entries: unknown[] = [];
    const originalError = console.error;
    console.error = (...args: unknown[]) => entries.push(args);
    try {
      const provider = new MetaWhatsAppProvider({
        accessToken: "secret-token",
        phoneNumberId: "phone-number-1",
        graphVersion: "v26.0",
        fetchImpl: async () => new Response(JSON.stringify({ error: {
          message: "Recipient is not a valid test recipient",
          type: "OAuthException",
          code: 131026,
          error_subcode: 2494010,
          error_user_msg: "Add the recipient to the test allowlist",
        } }), { status: 400 }),
      });
      await expect(provider.sendWhatsAppTextMessage({ conversationId: "c-1", recipientPhone: "919999999999", text: "Hello" })).rejects.toThrow();
    } finally {
      console.error = originalError;
    }
    const serialized = JSON.stringify(entries);
    expect(serialized).toContain("131026");
    expect(serialized).toContain("OAuthException");
    expect(serialized).toContain("Recipient is not a valid test recipient");
    expect(serialized).toContain("v26.0");
    expect(serialized).not.toContain("secret-token");
  });
});
