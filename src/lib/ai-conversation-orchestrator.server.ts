import {
  extractTravelRequirements,
  type ConversationMessage,
  type ExtractedTravelRequirements,
  type TravelExtraction,
} from "./ai-travel-extraction";
import { determineNextQuestion, type NextQuestionResult } from "./ai-next-question.server";
import { extractTravelRequirementsWithOpenAI } from "./openai-travel-provider.server";
import {
  resolveDestinationAssignment,
  type DestinationAssignmentRecord,
  type DestinationCatalogRow,
  type DestinationAssignmentResult,
  type LeadLikeRow,
  type WhatsAppConversationRow,
} from "./destination-assignment";

export type OrchestratorConversation = {
  id: string;
  conversation_mode: "AI_ACTIVE" | "HUMAN_ACTIVE";
  assigned_employee_id: string | null;
  lead_id: string | null;
  enquiry_id: string | null;
};

export type OrchestratorLead = LeadLikeRow;

export type ProcessAiConversationTurnInput = {
  conversation: OrchestratorConversation;
  inboundMessages: ConversationMessage[];
  destinations: DestinationCatalogRow[];
  activeAssignments: DestinationAssignmentRecord[];
  lead?: OrchestratorLead | null;
  fallbackEmployeeId?: string | null;
  extractor?: (messages: ConversationMessage[]) => TravelExtraction | Promise<TravelExtraction>;
};

export type ProcessAiConversationTurnResult =
  | {
      status: "processed";
      conversation_id: string;
      processed_message_id: string;
      requirements: ExtractedTravelRequirements;
      field_metadata: TravelExtraction["field_metadata"];
      destination_resolution: TravelExtraction["destination_resolution"];
      missing_information: string[];
      destinationAssignment: DestinationAssignmentResult;
      nextQuestion: NextQuestionResult;
    }
  | {
      status: "skipped";
      conversation_id: string;
      reason: "human_active" | "no_inbound_messages";
    };

export async function processAiConversationTurn(
  input: ProcessAiConversationTurnInput,
): Promise<ProcessAiConversationTurnResult> {
  const conversation = input.conversation;

  if (conversation.conversation_mode === "HUMAN_ACTIVE") {
    return {
      status: "skipped",
      conversation_id: conversation.id,
      reason: "human_active",
    };
  }

  const inboundMessages = (input.inboundMessages ?? []).filter(
    (message) => message.direction === "inbound" && message.body?.trim(),
  );
  const latestInbound = inboundMessages.at(-1);

  if (!latestInbound) {
    return {
      status: "skipped",
      conversation_id: conversation.id,
      reason: "no_inbound_messages",
    };
  }

  const extractionResult =
    input.extractor ??
    ((messages: ConversationMessage[]) =>
      conversation.conversation_mode === "AI_ACTIVE"
        ? extractTravelRequirementsWithOpenAI({ messages })
        : extractTravelRequirements(messages));

  const resolvedExtraction = await extractionResult(inboundMessages);

  const destinationAssignment = resolveDestinationAssignment({
    conversation: {
      id: conversation.id,
      assigned_employee_id: conversation.assigned_employee_id,
      conversation_mode: conversation.conversation_mode,
      lead_id: conversation.lead_id,
      enquiry_id: conversation.enquiry_id,
    } satisfies WhatsAppConversationRow,
    lead:
      input.lead ??
      (conversation.lead_id
        ? {
            id: conversation.lead_id,
            assigned_to: conversation.assigned_employee_id,
            destination_id: null,
          }
        : null),
    targetDestinationText: resolvedExtraction.requirements.destination_text,
    destinations: input.destinations,
    activeAssignments: input.activeAssignments,
    fallbackEmployeeId: input.fallbackEmployeeId ?? null,
  });

  const nextQuestion = determineNextQuestion(resolvedExtraction.requirements, {
    conversationMode: conversation.conversation_mode,
  });

  return {
    status: "processed",
    conversation_id: conversation.id,
    processed_message_id: latestInbound.id,
    requirements: resolvedExtraction.requirements,
    field_metadata: resolvedExtraction.field_metadata,
    destination_resolution: resolvedExtraction.destination_resolution,
    missing_information: resolvedExtraction.missing_information,
    destinationAssignment,
    nextQuestion,
  };
}
