import { describe, expect, test } from "bun:test";
import { MockWhatsAppProvider } from "./whatsapp-provider.mock.server";
import {
  sendWhatsAppMessage,
  sendWhatsAppTextMessage,
  resolveWhatsAppSendMode,
  isWhatsAppCustomerWindowOpen,
  validateMetaConnection,
  type OutboundMessageRecord,
  type WhatsAppOutboundRepository,
  type WhatsAppConnectionRecord,
} from "./whatsapp-outbound.server";
import type { WhatsAppProvider, WhatsAppProviderResult } from "./whatsapp-provider.server";

function createRepository(mode: "AI_ACTIVE" | "HUMAN_ACTIVE" = "AI_ACTIVE") {
  const messages: OutboundMessageRecord[] = [];
  const connection: WhatsAppConnectionRecord = {
    phone_number_id: "phone-number-1",
    waba_id: "waba-1",
    connection_status: "connected",
    access_token_secret_ref: "secret-ref",
  };
  const repository: WhatsAppOutboundRepository = {
    findConversation: async () => ({
      id: "conversation-1",
      phone_number: "919876543210",
      conversation_mode: mode,
    }),
    findLatestInboundTimestamp: async () => new Date().toISOString(),
    findConnection: async () => connection,
    findMessageByProviderId: async (providerMessageId) =>
      messages.find((message) => message.wa_message_id === providerMessageId) ?? null,
    insertOutboundMessage: async ({ conversationId, payload, deliveryStatus }) => {
      const message: OutboundMessageRecord = {
        id: `message-${messages.length + 1}`,
        conversation_id: conversationId,
        wa_message_id: null,
        direction: "outbound",
        message_type: payload.type === "buttons" || payload.type === "list" ? "interactive" : payload.type,
        body: payload.type === "text" || payload.type === "buttons" || payload.type === "list" ? payload.text : payload.caption ?? null,
        ...(payload.type === "image" || payload.type === "document" ? { media_url: payload.url } : {}),
        ...(payload.type === "image" ? { media_mime_type: payload.mimeType ?? "image/jpeg" } : payload.type === "document" ? { media_mime_type: "application/pdf" } : {}),
        ...(payload.type === "document" && payload.filename ? { media_filename: payload.filename } : {}),
        delivery_status: deliveryStatus,
        message_timestamp: "2026-10-02T00:00:00.000Z",
      };
      messages.push(message);
      return message;
    },
    updateOutboundMessage: async ({ messageId, providerMessageId, deliveryStatus, messageTimestamp }) => {
      const message = messages.find((item) => item.id === messageId);
      if (!message) throw new Error("outbound message missing");
      message.wa_message_id = providerMessageId;
      message.delivery_status = deliveryStatus;
      message.message_timestamp = messageTimestamp;
      return message;
    },
    deleteOutboundMessage: async (messageId) => {
      const index = messages.findIndex((message) => message.id === messageId);
      if (index >= 0) messages.splice(index, 1);
    },
  };
  return { repository, messages, connection };
}

function providerResult(id = "provider-1"): WhatsAppProviderResult {
  return {
    providerMessageId: id,
    status: "sent",
    timestamp: "2026-01-01T00:00:00.000Z",
    recipient: "919876543210",
    messageType: "text",
  };
}

describe("WhatsApp outbound provider abstraction", () => {
  test("sends and persists a successful outbound text", async () => {
    const { repository, messages } = createRepository();
    const result = await sendWhatsAppTextMessage(
      { conversationId: "conversation-1", recipientPhone: "+91 98765 43210", text: "Hello" },
      { repository, provider: { sendWhatsAppTextMessage: async () => providerResult() } },
    );

    expect(result.status).toBe("sent");
    expect(result.message.direction).toBe("outbound");
    expect(result.message.wa_message_id).toBe("provider-1");
    expect(messages).toHaveLength(1);
  });

  test("persists pending text before provider send, then stores Meta ID and accepted state", async () => {
    const { repository, messages } = createRepository();
    let statusAtProviderCall = "";
    const result = await sendWhatsAppMessage(
      { conversationId: "conversation-1", recipientPhone: "+91 98765 43210", payload: { type: "text", text: "Hello" }, caller: "HUMAN" },
      {
        mode: "meta",
        repository,
        provider: {
          sendWhatsAppMessage: async () => {
            statusAtProviderCall = messages[0]?.delivery_status ?? "";
            return { ...providerResult("wamid.meta-1"), status: "accepted" };
          },
          sendWhatsAppTextMessage: async () => providerResult("wamid.meta-1"),
        },
      },
    );

    expect(statusAtProviderCall).toBe("pending");
    expect(result.message).toMatchObject({ wa_message_id: "wamid.meta-1", delivery_status: "accepted" });
    expect(messages).toHaveLength(1);
  });

  test("blocks Meta sends safely when required credentials are missing", async () => {
    const { repository, messages } = createRepository();
    await expect(sendWhatsAppMessage(
      { conversationId: "conversation-1", recipientPhone: "919876543210", payload: { type: "text", text: "Hello" }, caller: "HUMAN" },
      { mode: "meta", repository, env: {} },
    )).rejects.toThrow("WhatsApp Cloud API is not configured for this CRM.");
    expect(messages).toHaveLength(0);
  });

  test("blocks Meta sends when no connected WhatsApp connection exists", async () => {
    const { repository, messages } = createRepository();
    repository.findConnection = async () => null;
    await expect(sendWhatsAppMessage(
      { conversationId: "conversation-1", recipientPhone: "919876543210", payload: { type: "text", text: "Hello" }, caller: "HUMAN" },
      {
        mode: "meta",
        repository,
        env: {
          META_WHATSAPP_ACCESS_TOKEN: "test-token",
          META_WHATSAPP_PHONE_NUMBER_ID: "phone-number-1",
          META_APP_SECRET: "test-app-secret",
          WHATSAPP_VERIFY_TOKEN: "test-verify-token",
        },
      },
    )).rejects.toThrow("WhatsApp Cloud API is not configured for this CRM.");
    expect(messages).toHaveLength(0);
  });

  test("requires a connected registry row with WABA and server credential reference", () => {
    const ready = {
      ready: true,
      missing: [],
      hasAccessToken: true,
      hasPhoneNumberId: true,
      hasAppSecret: true,
      hasVerifyToken: true,
    };
    expect(() => validateMetaConnection({
      phoneNumberId: "phone-number-1",
      readiness: ready,
      connection: { phone_number_id: "phone-number-1", waba_id: "waba-1", connection_status: "connected", access_token_secret_ref: "secret-ref" },
    })).not.toThrow();
    expect(() => validateMetaConnection({ phoneNumberId: "phone-number-1", readiness: ready, connection: null }))
      .toThrow("WhatsApp Cloud API is not configured for this CRM.");
    expect(() => validateMetaConnection({
      phoneNumberId: "phone-number-1",
      readiness: ready,
      connection: { phone_number_id: "phone-number-1", waba_id: null, connection_status: "connected", access_token_secret_ref: "secret-ref" },
    })).toThrow("WhatsApp Cloud API is not configured for this CRM.");
  });

  test("blocks employee Meta sends after the 24-hour window without persisting or calling the provider", async () => {
    const { repository, messages } = createRepository();
    repository.findLatestInboundTimestamp = async () => new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    let providerCalled = false;
    await expect(sendWhatsAppMessage(
      { conversationId: "conversation-1", recipientPhone: "919876543210", payload: { type: "text", text: "Hello" }, caller: "HUMAN" },
      {
        mode: "meta",
        repository,
        provider: {
          sendWhatsAppMessage: async () => { providerCalled = true; return { ...providerResult(), status: "accepted" }; },
          sendWhatsAppTextMessage: async () => providerResult(),
        },
      },
    )).rejects.toThrow("customer service window has expired");
    expect(messages).toHaveLength(0);
    expect(providerCalled).toBe(false);
  });

  test("considers timestamps only within the open 24-hour range", () => {
    const now = Date.parse("2026-10-02T12:00:00.000Z");
    expect(isWhatsAppCustomerWindowOpen("2026-10-02T00:00:01.000Z", now)).toBe(true);
    expect(isWhatsAppCustomerWindowOpen("2026-10-01T12:00:00.000Z", now)).toBe(false);
    expect(isWhatsAppCustomerWindowOpen(null, now)).toBe(false);
    expect(isWhatsAppCustomerWindowOpen("invalid", now)).toBe(false);
  });

  test("local mode stays a queued simulation without Meta credentials", async () => {
    const { repository, messages } = createRepository();
    const result = await sendWhatsAppMessage(
      { conversationId: "conversation-1", recipientPhone: "919876543210", payload: { type: "text", text: "Hello" }, caller: "HUMAN" },
      { mode: "local", repository, env: {} },
    );
    expect(result.provider.providerMessageId).toMatch(/^mock-/);
    expect(result.message.delivery_status).toBe("queued");
    expect(messages).toHaveLength(1);
    expect(resolveWhatsAppSendMode({ NODE_ENV: "development" })).toBe("local");
    expect(resolveWhatsAppSendMode({ NODE_ENV: "production" })).toBe("meta");
  });

  test("sends and persists image, PDF, button, and list payloads through the provider abstraction", async () => {
    const { repository, messages } = createRepository();
    const sent: string[] = [];
    const payloads = [
      { type: "image", url: "https://cdn.example.test/cover.jpg", caption: "Cover" },
      { type: "document", url: "https://cdn.example.test/guide.pdf", caption: "Guide", filename: "guide.pdf" },
      { type: "buttons", text: "Choose", buttons: [{ id: "domestic", title: "Domestic" }] },
      { type: "list", text: "Choose destination", buttonText: "Destinations", sections: [{ title: "Popular", rows: [{ id: "goa", title: "Goa" }] }] },
    ] as const;
    const provider: WhatsAppProvider = {
      sendWhatsAppMessage: async (input) => {
        sent.push(input.payload.type);
        return {
          ...providerResult(`wamid.${sent.length}`),
          status: "accepted",
          messageType: input.payload.type === "image" || input.payload.type === "document"
            ? input.payload.type
            : input.payload.type === "text" ? "text" : "interactive",
        };
      },
      sendWhatsAppTextMessage: async () => providerResult(),
    };

    for (const payload of payloads) {
      await sendWhatsAppMessage(
        { conversationId: "conversation-1", recipientPhone: "919876543210", payload, caller: "HUMAN" },
        { mode: "meta", repository, provider },
      );
    }

    expect(sent).toEqual(["image", "document", "buttons", "list"]);
    expect(messages.map((message) => message.message_type)).toEqual(["image", "document", "interactive", "interactive"]);
    expect(messages[0]).toMatchObject({ media_url: "https://cdn.example.test/cover.jpg", media_mime_type: "image/jpeg" });
    expect(messages[1]).toMatchObject({ media_url: "https://cdn.example.test/guide.pdf", media_mime_type: "application/pdf", media_filename: "guide.pdf" });
    expect(messages.every((message) => message.delivery_status === "accepted" && message.wa_message_id !== null)).toBe(true);
  });

  test("normalizes the phone before calling the provider", async () => {
    const { repository } = createRepository();
    let recipient = "";
    await sendWhatsAppTextMessage(
      { conversationId: "conversation-1", recipientPhone: "09876543210", text: "Hello" },
      {
        repository,
        provider: {
          sendWhatsAppTextMessage: async (input) => {
            recipient = input.recipientPhone;
            return providerResult();
          },
        },
      },
    );
    expect(recipient).toBe("919876543210");
  });

  test("rejects an invalid phone before calling the provider", async () => {
    const { repository } = createRepository();
    let called = false;
    await expect(
      sendWhatsAppTextMessage(
        { conversationId: "conversation-1", recipientPhone: "abc", text: "Hello" },
        {
          repository,
          provider: { sendWhatsAppTextMessage: async () => { called = true; return providerResult(); } },
        },
      ),
    ).rejects.toThrow("valid WhatsApp recipient");
    expect(called).toBe(false);
  });

  test("rejects a missing conversation", async () => {
    const { repository } = createRepository();
    repository.findConversation = async () => null;
    await expect(
      sendWhatsAppTextMessage(
        { conversationId: "missing", recipientPhone: "9876543210", text: "Hello" },
        { repository, provider: new MockWhatsAppProvider() },
      ),
    ).rejects.toThrow("conversation not found");
  });

  test("protects HUMAN_ACTIVE conversations from AI sends", async () => {
    const { repository } = createRepository("HUMAN_ACTIVE");
    await expect(
      sendWhatsAppTextMessage(
        { conversationId: "conversation-1", recipientPhone: "9876543210", text: "Hello", caller: "AI" },
        { repository, provider: new MockWhatsAppProvider() },
      ),
    ).rejects.toThrow("HUMAN_ACTIVE");
  });

  test("marks a failed provider send as failed instead of leaving it successful", async () => {
    const { repository, messages } = createRepository();
    const failure: WhatsAppProvider = {
      sendWhatsAppTextMessage: async () => {
        throw new Error("provider unavailable");
      },
    };
    await expect(
      sendWhatsAppTextMessage(
        { conversationId: "conversation-1", recipientPhone: "9876543210", text: "Hello" },
        { repository, provider: failure },
      ),
    ).rejects.toThrow("provider unavailable");
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ wa_message_id: null, delivery_status: "failed" });
  });

  test("returns an existing record when the provider message ID is duplicated", async () => {
    const { repository, messages } = createRepository();
    const first = await sendWhatsAppTextMessage(
      { conversationId: "conversation-1", recipientPhone: "9876543210", text: "Hello" },
      { repository, provider: { sendWhatsAppTextMessage: async () => providerResult("same-id") } },
    );
    const second = await sendWhatsAppTextMessage(
      { conversationId: "conversation-1", recipientPhone: "9876543210", text: "Hello again" },
      { repository, provider: { sendWhatsAppTextMessage: async () => providerResult("same-id") } },
    );

    expect(first.status).toBe("sent");
    expect(second.status).toBe("duplicate");
    expect(second.message.id).toBe(first.message.id);
    expect(messages).toHaveLength(1);
  });

  test("mock provider is deterministic and does not call external APIs", async () => {
    const provider = new MockWhatsAppProvider();
    const input = { conversationId: "conversation-1", recipientPhone: "919876543210", text: "Hello", clientMessageId: "client-1" };
    const first = await provider.sendWhatsAppTextMessage(input);
    const second = await provider.sendWhatsAppTextMessage(input);
    expect(first).toEqual(second);
    expect(first.providerMessageId).toMatch(/^mock-/);
    expect(first.status).toBe("sent");
  });

  test("provider and outbound modules contain no browser credential exposure", async () => {
    const providerSource = await Bun.file(new URL("./whatsapp-provider.server.ts", import.meta.url)).text();
    const outboundSource = await Bun.file(new URL("./whatsapp-outbound.server.ts", import.meta.url)).text();
    expect(`${providerSource}\n${outboundSource}`).not.toContain("VITE_");
    expect(`${providerSource}\n${outboundSource}`).not.toContain("OPENAI_API_KEY");
    expect(`${providerSource}\n${outboundSource}`).not.toContain("WHATSAPP_ACCESS_TOKEN");
  });

  test("employee-facing send surfaces do not open WhatsApp links or call Graph from the browser", async () => {
    const inboxSource = await Bun.file(new URL("../components/whatsapp-inbox.tsx", import.meta.url)).text();
    const messagingSource = await Bun.file(new URL("../routes/_authenticated/messaging.tsx", import.meta.url)).text();
    const proposalSource = await Bun.file(new URL("../components/lead-send-proposal-dialog.tsx", import.meta.url)).text();
    const browserSendSources = `${inboxSource}\n${messagingSource}\n${proposalSource}`;
    expect(browserSendSources).not.toContain("openWhatsApp(");
    expect(browserSendSources).not.toContain("graph.facebook.com");
    expect(browserSendSources).not.toContain("META_WHATSAPP_ACCESS_TOKEN");
    expect(browserSendSources).not.toContain("META_APP_SECRET");
    expect(browserSendSources).not.toContain("WHATSAPP_VERIFY_TOKEN");
  });
});
