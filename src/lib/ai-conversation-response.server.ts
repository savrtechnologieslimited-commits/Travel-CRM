import {
  evaluateNextQuestionWithOpenAI,
  type ExtractedTravelRequirementsLike,
  type NextQuestionResult,
  type OpenAIQuestionProviderInput,
} from "./ai-next-question.server";
import { sendWhatsAppTextMessage, type SendWhatsAppTextMessageResult } from "./whatsapp-outbound.server";
import type { ConversationMessage } from "./ai-travel-extraction";

export type AiConversationResponseResult =
  | {
      status: "sent";
      action: "ASK" | "CLARIFY";
      question: string;
      outbound: SendWhatsAppTextMessageResult;
    }
  | { status: "ready"; action: "READY"; question: null }
  | { status: "human_active"; action: "READY"; question: null }
  | { status: "failed"; action: "ASK" | "CLARIFY"; question: string; error: string };

export type AiConversationResponseDependencies = {
  phraseQuestion?: (input: OpenAIQuestionProviderInput) => Promise<NextQuestionResult>;
  sendText?: (input: {
    conversationId: string;
    recipientPhone: string;
    text: string;
    clientMessageId: string;
  }) => Promise<SendWhatsAppTextMessageResult>;
};

export async function generateAndSendAiResponse(input: {
  conversationId: string;
  recipientPhone: string;
  sourceMessageId: string;
  conversationMode: "AI_ACTIVE" | "HUMAN_ACTIVE";
  messages: ConversationMessage[];
  requirements: ExtractedTravelRequirementsLike;
  nextQuestion: NextQuestionResult;
}, dependencies: AiConversationResponseDependencies = {}): Promise<AiConversationResponseResult> {
  if (input.conversationMode === "HUMAN_ACTIVE") {
    return { status: "human_active", action: "READY", question: null };
  }

  if (input.nextQuestion.action === "READY") {
    return { status: "ready", action: "READY", question: null };
  }

  const phraseQuestion = dependencies.phraseQuestion ?? evaluateNextQuestionWithOpenAI;
  let question = input.nextQuestion.question;
  try {
    const phrased = await phraseQuestion({
      messages: input.messages,
      requirements: input.requirements,
    });
    if (phrased.question?.trim()) question = phrased.question.trim();
  } catch {
    // The deterministic question remains a safe fallback when phrasing is unavailable.
  }

  if (!question?.trim()) {
    return {
      status: "failed",
      action: input.nextQuestion.action,
      question: "Could you share a little more about your travel plans?",
      error: "No usable AI question was generated",
    };
  }

  const sendText = dependencies.sendText ?? ((message) => sendWhatsAppTextMessage(message));
  try {
    const outbound = await sendText({
      conversationId: input.conversationId,
      recipientPhone: input.recipientPhone,
      text: question,
      clientMessageId: `ai-reply:${input.sourceMessageId}`,
    });
    return { status: "sent", action: input.nextQuestion.action, question, outbound };
  } catch (error) {
    return {
      status: "failed",
      action: input.nextQuestion.action,
      question,
      error: error instanceof Error ? error.message : "WhatsApp outbound send failed",
    };
  }
}
