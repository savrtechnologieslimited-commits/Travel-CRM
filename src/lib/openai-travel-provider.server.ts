import OpenAI from "openai";
import {
  TRAVEL_REQUIREMENT_FIELDS,
  validateTravelExtraction,
  type ConversationMessage,
  type ExtractedTravelRequirements,
  type TravelExtraction,
} from "./ai-travel-extraction";

export type OpenAITravelProviderInput = {
  messages: ConversationMessage[];
  model?: string;
  apiKey?: string;
  client?: OpenAIClientLike;
};

export type OpenAIClientLike = {
  responses: {
    create: (args: Record<string, unknown>) => Promise<OpenAIResponsesPayloadLike>;
  };
};

export type OpenAIResponsesPayloadLike = {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: string;
      value?: string;
    }>;
  }>;
};

const TRAVEL_EXTRACTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    destination_text: { type: ["string", "null"] },
    travel_start_date: { type: ["string", "null"] },
    travel_end_date: { type: ["string", "null"] },
    travel_month: { type: ["string", "null"] },
    adults: { type: ["integer", "null"], minimum: 0 },
    children: { type: ["integer", "null"], minimum: 0 },
    departure_city: { type: ["string", "null"] },
    approximate_budget: { type: ["number", "null"], minimum: 0 },
    hotel_preference: { type: ["string", "null"] },
    special_requirements: { type: ["string", "null"] },
    trip_type: { type: ["string", "null"] },
  },
  required: [
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
} as const;

function textFromResponse(payload: OpenAIResponsesPayloadLike): string {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text;
  }

  const firstOutput = payload.output?.[0];
  const firstContent = firstOutput?.content?.find((entry) => entry.type === "output_text");
  if (typeof firstContent?.text === "string" && firstContent.text.trim()) return firstContent.text;
  if (typeof firstContent?.value === "string" && firstContent.value.trim()) return firstContent.value;

  const textFromAnyContent = payload.output
    ?.flatMap((item) => item.content ?? [])
    .map((entry) => entry.text ?? entry.value ?? "")
    .join("")
    .trim();

  if (textFromAnyContent) return textFromAnyContent;

  throw new Error("OpenAI returned an empty structured response");
}

function normaliseConversationText(messages: ConversationMessage[]): string {
  return messages
    .filter((message) => message.body?.trim())
    .map((message) => {
      const role = message.direction === "inbound" ? "customer" : "assistant";
      const timestamp = message.message_timestamp ? ` [${message.message_timestamp}]` : "";
      return `${role}${timestamp}: ${message.body?.trim()}`;
    })
    .join("\n");
}

export function getOpenAITravelProviderConfig(
  overrides?: Partial<{ apiKey: string; model: string }>,
  env: NodeJS.ProcessEnv = process.env,
) {
  const apiKey = overrides?.apiKey?.trim() ?? env["OPENAI_API_KEY"]?.trim();
  const model = overrides?.model?.trim() ?? env["OPENAI_MODEL"]?.trim();

  if (!apiKey) {
    throw new Error("Missing server-side configuration: OPENAI_API_KEY");
  }

  if (!model) {
    throw new Error("Missing server-side configuration: OPENAI_MODEL");
  }

  return { apiKey, model };
}

export function createOpenAITravelClient(apiKey?: string): OpenAIClientLike {
  const key = apiKey ?? getOpenAITravelProviderConfig().apiKey;
  const openai = new OpenAI({ apiKey: key, dangerouslyAllowBrowser: false });

  return {
    responses: {
      create: async (args) => {
        const response = await openai.responses.create(args as never);
        return response as unknown as OpenAIResponsesPayloadLike;
      },
    },
  };
}

export async function extractTravelRequirementsWithOpenAI(
  input: OpenAITravelProviderInput,
): Promise<TravelExtraction> {
  const conversationText = normaliseConversationText(input.messages);
  if (!conversationText) {
    return {
      requirements: {
        destination_text: null,
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
      },
      field_metadata: {},
      destination_resolution: {
        status: "unknown",
        destination_id: null,
        candidate_ids: [],
      },
      missing_information: TRAVEL_REQUIREMENT_FIELDS.map((field) => field),
    };
  }

  const configOverrides: Partial<{ apiKey: string; model: string }> = {};
  if (input.apiKey) configOverrides.apiKey = input.apiKey;
  if (input.model) configOverrides.model = input.model;

  const { model, apiKey } = getOpenAITravelProviderConfig(configOverrides, process.env);
  const client = input.client ?? createOpenAITravelClient(apiKey);
  const targetModel = input.model ?? model;

  let payload: OpenAIResponsesPayloadLike;
  try {
    payload = await client.responses.create({
      model: targetModel,
      input: [
        {
          role: "system",
          content:
            "You extract structured travel requirements from WhatsApp conversations. Follow the schema exactly. Output only the supported travel fields. Never output employee_id or destination_id. Use null when information is unknown or not stated. Do not guess ambiguous details.",
        },
        {
          role: "user",
          content: `Extract only the supported travel information from this conversation. Keep destination_text as the raw user wording when known.\n\n${conversationText}`,
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "travel_requirements",
          schema: TRAVEL_EXTRACTION_SCHEMA,
          strict: true,
        },
      },
    });
  } catch (error) {
    throw new Error(
      `OpenAI extraction failed: ${error instanceof Error ? error.message : "unknown API error"}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(textFromResponse(payload));
  } catch {
    throw new Error("OpenAI returned malformed JSON for travel extraction");
  }

  const validated = validateTravelExtraction(parsed) as ExtractedTravelRequirements;

  return {
    requirements: validated,
    field_metadata: {},
    destination_resolution: {
      status: "unknown",
      destination_id: null,
      candidate_ids: [],
    },
    missing_information: TRAVEL_REQUIREMENT_FIELDS.filter((field) => validated[field] === null).map(
      (field) => field,
    ),
  };
}
