import { describe, expect, test } from "bun:test";
import { generateAndSendAiResponse } from "./ai-conversation-response.server";
import type { NextQuestionResult } from "./ai-next-question.server";
import type { SendWhatsAppTextMessageResult } from "./whatsapp-outbound.server";
import type { ExtractedTravelRequirements } from "./ai-travel-extraction";

const requirements: ExtractedTravelRequirements = {
  destination_text: "Bali",
  travel_start_date: null,
  travel_end_date: null,
  travel_month: null,
  adults: null,
  children: null,
  departure_city: null,
  approximate_budget: null,
  hotel_preference: null,
  special_requirements: null,
  trip_type: null,
};

const outbound: SendWhatsAppTextMessageResult = {
  status: "sent",
  provider: {
    providerMessageId: "mock-1",
    status: "sent",
    timestamp: "2026-01-01T00:00:00.000Z",
    recipient: "919876543210",
    messageType: "text",
  },
  message: {
    id: "message-1",
    conversation_id: "conversation-1",
    wa_message_id: "mock-1",
    direction: "outbound",
    message_type: "text",
    body: "Which month are you planning to travel?",
    delivery_status: "sent",
    message_timestamp: "2026-01-01T00:00:00.000Z",
  },
};

function question(action: "ASK" | "CLARIFY", text: string): NextQuestionResult {
  return { action, field: action === "ASK" ? "travel_month" : "destination_text", question: text, status: "AI_ACTIVE" };
}

describe("AI conversation response stage", () => {
  test("missing destination produces an outbound question", async () => {
    const sent: string[] = [];
    const result = await generateAndSendAiResponse(
      {
        conversationId: "conversation-1",
        recipientPhone: "919876543210",
        sourceMessageId: "inbound-1",
        conversationMode: "AI_ACTIVE",
        messages: [{ id: "inbound-1", direction: "inbound", body: "Hi" }],
        requirements: { ...requirements, destination_text: null },
        nextQuestion: { action: "ASK", field: "destination_text", question: "Which destination are you looking for?", status: "AI_ACTIVE" },
      },
      {
        phraseQuestion: async () => ({ action: "ASK", field: "destination_text", question: "Where would you like to travel?", status: "AI_ACTIVE" }),
        sendText: async (input) => { sent.push(input.text); return outbound; },
      },
    );
    expect(result.status).toBe("sent");
    expect(sent).toEqual(["Where would you like to travel?"]);
  });

  test("ambiguous destination produces a clarification", async () => {
    const result = await generateAndSendAiResponse(
      {
        conversationId: "conversation-1",
        recipientPhone: "919876543210",
        sourceMessageId: "inbound-2",
        conversationMode: "AI_ACTIVE",
        messages: [{ id: "inbound-2", direction: "inbound", body: "Bali or Phuket" }],
        requirements: { ...requirements, destination_text: "Bali or Phuket" },
        nextQuestion: question("CLARIFY", "Would you prefer Bali or Phuket?"),
      },
      {
        phraseQuestion: async () => ({ action: "CLARIFY", field: "destination_text", question: "Would you prefer Bali or Phuket?", status: "AI_ACTIVE" }),
        sendText: async () => outbound,
      },
    );
    expect(result.status).toBe("sent");
    expect(result.action).toBe("CLARIFY");
  });

  test("missing travel month sends the deterministic next question", async () => {
    let sentText = "";
    const result = await generateAndSendAiResponse(
      {
        conversationId: "conversation-1",
        recipientPhone: "919876543210",
        sourceMessageId: "inbound-3",
        conversationMode: "AI_ACTIVE",
        messages: [{ id: "inbound-3", direction: "inbound", body: "Bali" }],
        requirements,
        nextQuestion: question("ASK", "Which month are you planning to travel?"),
      },
      { phraseQuestion: async () => { throw new Error("OpenAI unavailable"); }, sendText: async (input) => { sentText = input.text; return outbound; } },
    );
    expect(result.status).toBe("sent");
    expect(sentText).toBe("Which month are you planning to travel?");
  });

  test("HUMAN_ACTIVE returns without phrasing or outbound send", async () => {
    let sent = false;
    const result = await generateAndSendAiResponse(
      {
        conversationId: "conversation-1", recipientPhone: "919876543210", sourceMessageId: "inbound-4",
        conversationMode: "HUMAN_ACTIVE", messages: [], requirements, nextQuestion: question("ASK", "Question"),
      },
      { phraseQuestion: async () => { throw new Error("must not run"); }, sendText: async () => { sent = true; return outbound; } },
    );
    expect(result).toEqual({ status: "human_active", action: "READY", question: null });
    expect(sent).toBe(false);
  });

  test("READY returns without inventing an outbound message", async () => {
    let sent = false;
    const result = await generateAndSendAiResponse(
      {
        conversationId: "conversation-1", recipientPhone: "919876543210", sourceMessageId: "inbound-5",
        conversationMode: "AI_ACTIVE", messages: [], requirements, nextQuestion: { action: "READY", field: null, question: null, status: "READY" },
      },
      { sendText: async () => { sent = true; return outbound; } },
    );
    expect(result).toEqual({ status: "ready", action: "READY", question: null });
    expect(sent).toBe(false);
  });

  test("provider failure is returned safely", async () => {
    const result = await generateAndSendAiResponse(
      {
        conversationId: "conversation-1", recipientPhone: "919876543210", sourceMessageId: "inbound-6",
        conversationMode: "AI_ACTIVE", messages: [], requirements, nextQuestion: question("ASK", "Question"),
      },
      { phraseQuestion: async () => ({ action: "ASK", field: "travel_month", question: "Question", status: "AI_ACTIVE" }), sendText: async () => { throw new Error("provider unavailable"); } },
    );
    expect(result.status).toBe("failed");
    expect(result.error).toContain("provider unavailable");
  });

  test("the inbound message ID is used as the outbound idempotency key", async () => {
    let clientMessageId = "";
    await generateAndSendAiResponse(
      {
        conversationId: "conversation-1", recipientPhone: "919876543210", sourceMessageId: "inbound-7",
        conversationMode: "AI_ACTIVE", messages: [], requirements, nextQuestion: question("ASK", "Question"),
      },
      { phraseQuestion: async () => question("ASK", "Question"), sendText: async (input) => { clientMessageId = input.clientMessageId; return outbound; } },
    );
    expect(clientMessageId).toBe("ai-reply:inbound-7");
  });
});
