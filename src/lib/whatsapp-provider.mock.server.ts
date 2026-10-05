import type {
  SendWhatsAppMessageInput,
  SendWhatsAppTextMessageInput,
  WhatsAppProvider,
  WhatsAppProviderResult,
} from "./whatsapp-provider.server";

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export class MockWhatsAppProvider implements WhatsAppProvider {
  async sendWhatsAppMessage(input: SendWhatsAppMessageInput): Promise<WhatsAppProviderResult> {
    const identity = input.clientMessageId ?? `${input.conversationId}:${input.recipientPhone}:${JSON.stringify(input.payload)}`;
    return {
      providerMessageId: `mock-${stableHash(identity)}`,
      status: "sent",
      timestamp: "2026-01-01T00:00:00.000Z",
      recipient: input.recipientPhone,
      messageType: input.payload.type === "document" || input.payload.type === "image"
        ? input.payload.type
        : input.payload.type === "text" ? "text" : "interactive",
    };
  }

  async sendWhatsAppTextMessage(
    input: SendWhatsAppTextMessageInput,
  ): Promise<WhatsAppProviderResult> {
    const identity = input.clientMessageId ?? `${input.conversationId}:${input.recipientPhone}:${input.text}`;
    return {
      providerMessageId: `mock-${stableHash(identity)}`,
      status: "sent",
      timestamp: "2026-01-01T00:00:00.000Z",
      recipient: input.recipientPhone,
      messageType: "text",
    };
  }
}

export const mockWhatsAppProvider = new MockWhatsAppProvider();
