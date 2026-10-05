export type WhatsAppMessageStatus = "sent" | "accepted" | "failed";

export type WhatsAppReplyButton = { id: string; title: string };
export type WhatsAppListSection = {
  title?: string;
  rows: { id: string; title: string; description?: string }[];
};

export type WhatsAppOutboundPayload =
  | { type: "text"; text: string }
  | { type: "image"; url: string; caption?: string; mimeType?: string; storagePath?: string }
  | { type: "video"; url: string; caption?: string; storagePath?: string }
  | { type: "audio"; url: string; storagePath?: string }
  | { type: "buttons"; text: string; buttons: WhatsAppReplyButton[] }
  | { type: "list"; text: string; buttonText: string; sections: WhatsAppListSection[] }
  | { type: "document"; url: string; caption?: string; filename?: string; storagePath?: string };

export type SendWhatsAppTextMessageInput = {
  conversationId: string;
  recipientPhone: string;
  text: string;
  clientMessageId?: string;
};

export type SendWhatsAppMessageInput = {
  conversationId: string;
  recipientPhone: string;
  payload: WhatsAppOutboundPayload;
  clientMessageId?: string;
};

export type WhatsAppProviderResult = {
  providerMessageId: string;
  status: WhatsAppMessageStatus;
  timestamp: string;
  recipient: string;
  messageType: "text" | "image" | "video" | "audio" | "interactive" | "document";
};

export interface WhatsAppProvider {
  sendWhatsAppMessage?(input: SendWhatsAppMessageInput): Promise<WhatsAppProviderResult>;
  sendWhatsAppTextMessage(
    input: SendWhatsAppTextMessageInput,
  ): Promise<WhatsAppProviderResult>;
}
