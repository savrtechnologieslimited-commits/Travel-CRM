import OpenAI from "openai";
import { TRAVEL_REQUIREMENT_FIELDS, type ExtractedTravelRequirements } from "./ai-travel-extraction";

export type NextQuestionAction = "ASK" | "READY" | "CLARIFY";
export type SupportedNextQuestionField =
  | "destination_text"
  | "travel_start_date"
  | "travel_end_date"
  | "travel_month"
  | "adults"
  | "children"
  | "departure_city"
  | "approximate_budget"
  | "hotel_preference"
  | "special_requirements"
  | "trip_type"
  | null;

export type NextQuestionResult = {
  action: NextQuestionAction;
  field: SupportedNextQuestionField;
  question: string | null;
  status?: "AI_ACTIVE" | "HUMAN_ACTIVE" | "READY" | "INVALID";
};

export type ExtractedTravelRequirementsLike = ExtractedTravelRequirements;

export type NextQuestionInput = {
  conversationMode?: "AI_ACTIVE" | "HUMAN_ACTIVE";
  requirements: ExtractedTravelRequirementsLike;
};

export type OpenAIQuestionProviderInput = {
  messages: Array<{ id: string; direction: "inbound" | "outbound"; body?: string | null; message_timestamp?: string }>;
  requirements: ExtractedTravelRequirementsLike;
  model?: string;
  apiKey?: string;
  client?: {
    responses: {
      create: (args: Record<string, unknown>) => Promise<{ output_text?: string; output?: Array<{ content?: Array<{ type?: string; text?: string; value?: string }> }> }>;
    };
  };
};

const QUESTION_PRIORITY: Array<keyof ExtractedTravelRequirementsLike> = [
  "destination_text",
  "travel_month",
  "adults",
  "children",
  "departure_city",
  "approximate_budget",
  "hotel_preference",
  "special_requirements",
  "trip_type",
];

export function determineNextQuestion(
  requirements: ExtractedTravelRequirementsLike,
  options: Partial<{ conversationMode: "AI_ACTIVE" | "HUMAN_ACTIVE" }> = {},
): NextQuestionResult {
  const mode = options.conversationMode ?? "AI_ACTIVE";
  if (mode === "HUMAN_ACTIVE") {
    return {
      action: "READY",
      field: null,
      question: null,
      status: "HUMAN_ACTIVE",
    };
  }

  if (
    requirements.destination_text &&
    /\b(?:talk|speak|human|agent|consultant|someone|person)\b/i.test(requirements.destination_text)
  ) {
    return {
      action: "READY",
      field: null,
      question: null,
      status: "AI_ACTIVE",
    };
  }

  const destination = requirements.destination_text?.trim();
  if (destination && /\bor\b|\b\/\b|\bmaybe\b|\bnot sure\b|\bperhaps\b/i.test(destination)) {
    return {
      action: "CLARIFY",
      field: "destination_text",
      question: `Would you prefer ${destination.replace(/\s*or\s*/gi, " or ").trim()}?`,
      status: "AI_ACTIVE",
    };
  }

  if (!destination) {
    return {
      action: "ASK",
      field: "destination_text",
      question: "Which destination are you looking for?",
      status: "AI_ACTIVE",
    };
  }

  const hasTiming = Boolean(
    requirements.travel_month || requirements.travel_start_date || requirements.travel_end_date,
  );
  const essentialCoreReady = Boolean(
    destination &&
      hasTiming &&
      requirements.adults !== null &&
      requirements.children !== null &&
      requirements.departure_city &&
      requirements.approximate_budget !== null &&
      requirements.hotel_preference,
  );
  if (essentialCoreReady) {
    return {
      action: "READY",
      field: null,
      question: null,
      status: "READY",
    };
  }

  if (!hasTiming) {
    return {
      action: "ASK",
      field: "travel_month",
      question: "Which month are you planning to travel?",
      status: "AI_ACTIVE",
    };
  }

  if (requirements.adults === null) {
    return {
      action: "ASK",
      field: "adults",
      question: "How many adults are travelling?",
      status: "AI_ACTIVE",
    };
  }

  if (requirements.children === null) {
    return {
      action: "ASK",
      field: "children",
      question: "How many children are travelling?",
      status: "AI_ACTIVE",
    };
  }

  if (!requirements.departure_city) {
    return {
      action: "ASK",
      field: "departure_city",
      question: "Which city will you be travelling from?",
      status: "AI_ACTIVE",
    };
  }

  if (requirements.approximate_budget === null) {
    return {
      action: "ASK",
      field: "approximate_budget",
      question: "What is your approximate budget?",
      status: "AI_ACTIVE",
    };
  }

  if (!requirements.hotel_preference) {
    return {
      action: "ASK",
      field: "hotel_preference",
      question: "What type of hotel are you looking for?",
      status: "AI_ACTIVE",
    };
  }

  if (!requirements.special_requirements) {
    return {
      action: "ASK",
      field: "special_requirements",
      question: "Do you have any special requirements for the trip?",
      status: "AI_ACTIVE",
    };
  }

  if (!requirements.trip_type) {
    return {
      action: "ASK",
      field: "trip_type",
      question: "What kind of trip are you planning?",
      status: "AI_ACTIVE",
    };
  }

  return {
    action: "READY",
    field: null,
    question: null,
    status: "READY",
  };
}

function textFromResponse(payload: { output_text?: string; output?: Array<{ content?: Array<{ type?: string; text?: string; value?: string }> }> }): string {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) return payload.output_text;
  const firstContent = payload.output?.[0]?.content?.find((entry) => entry.type === "output_text");
  if (typeof firstContent?.text === "string" && firstContent.text.trim()) return firstContent.text;
  if (typeof firstContent?.value === "string" && firstContent.value.trim()) return firstContent.value;
  throw new Error("OpenAI returned an empty next-question response");
}

function normaliseConversationText(messages: Array<{ id: string; direction: "inbound" | "outbound"; body?: string | null; message_timestamp?: string }>): string {
  return messages
    .filter((message) => message.body?.trim())
    .map((message) => `${message.direction === "inbound" ? "customer" : "assistant"}: ${message.body?.trim()}`)
    .join("\n");
}

export function getNextQuestionProviderConfig(
  overrides?: { apiKey?: string; model?: string },
  env: NodeJS.ProcessEnv = process.env,
) {
  const apiKey = overrides?.apiKey?.trim() ?? env["OPENAI_API_KEY"]?.trim();
  const model = overrides?.model?.trim() ?? env["OPENAI_MODEL"]?.trim();

  if (!apiKey) throw new Error("Missing server-side configuration: OPENAI_API_KEY");
  if (!model) throw new Error("Missing server-side configuration: OPENAI_MODEL");

  return { apiKey, model };
}

export async function evaluateNextQuestionWithOpenAI(
  input: OpenAIQuestionProviderInput,
): Promise<NextQuestionResult> {
  const conversationText = normaliseConversationText(input.messages);
  if (!conversationText) {
    return determineNextQuestion(input.requirements, { conversationMode: "AI_ACTIVE" });
  }

  if (/\b(?:talk|speak|human|agent|consultant|someone|person)\b/i.test(conversationText)) {
    return {
      action: "READY",
      field: null,
      question: null,
      status: "AI_ACTIVE",
    };
  }

  const deterministic = determineNextQuestion(input.requirements, { conversationMode: "AI_ACTIVE" });
  if (deterministic.action === "READY") {
    return deterministic;
  }

  const configOverrides: { apiKey?: string; model?: string } = {};
  if (input.apiKey !== undefined) configOverrides.apiKey = input.apiKey;
  if (input.model !== undefined) configOverrides.model = input.model;

  const config = getNextQuestionProviderConfig(configOverrides, process.env);

  const openAIClient =
    input.client?.responses ??
    (new OpenAI({ apiKey: config.apiKey, dangerouslyAllowBrowser: false }) as unknown as {
      create: (args: Record<string, unknown>) => Promise<{
        output_text?: string;
        output?: Array<{ content?: Array<{ type?: string; text?: string; value?: string }> }>;
      }>;
    });

  let payload: { output_text?: string; output?: Array<{ content?: Array<{ type?: string; text?: string; value?: string }> }> };
  try {
    payload = await openAIClient.create({
      model: config.model,
      input: [
        {
          role: "system",
          content: "You are a travel assistant. Based on the conversation and the known requirement fields, ask exactly one short, natural WhatsApp-style question. Do not ask for already-known information. Do not invent values. Do not output employee_id, destination_id, or CRM fields.",
        },
        {
          role: "user",
          content: `Known requirements: ${JSON.stringify(input.requirements)}\n\nConversation:\n${conversationText}\n\nThe next missing question should be about: ${deterministic.field}. Ask one short question only.`,
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "next_question",
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              action: { type: "string", enum: ["ASK", "READY", "CLARIFY"] },
              field: {
                type: ["string", "null"],
                enum: [
                  null,
                  "destination_text",
                  "travel_start_date",
                  "travel_end_date",
                  "travel_month",
                  "adults",
                  "children",
                  "departure_city",
                  "approximate_budget",
                  "hotel_preference",
                  "special_requirements",
                  "trip_type",
                ],
              },
              question: { type: ["string", "null"] },
            },
            required: ["action", "field", "question"],
          },
          strict: true,
        },
      },
    });
  } catch (error) {
    throw new Error(
      `OpenAI next-question generation failed: ${error instanceof Error ? error.message : "unknown API error"}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(textFromResponse(payload));
  } catch {
    throw new Error("OpenAI returned malformed JSON for next-question generation");
  }

  const record = parsed as Record<string, unknown>;
  const action = record["action"];
  const field = record["field"];
  const question = record["question"];

  if (action !== "ASK" && action !== "READY" && action !== "CLARIFY") {
    throw new Error("Invalid next-question action");
  }
  if (field !== null && typeof field !== "string") {
    throw new Error("Invalid next-question field");
  }
  if (field !== null && !TRAVEL_REQUIREMENT_FIELDS.includes(field as never)) {
    throw new Error("Invalid next-question field");
  }

  return {
    action: action as NextQuestionAction,
    field: typeof field === "string" ? (field as SupportedNextQuestionField) : null,
    question: typeof question === "string" ? question : null,
    status: "AI_ACTIVE",
  };
}
