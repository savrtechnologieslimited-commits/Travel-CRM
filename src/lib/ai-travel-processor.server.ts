import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { filterAssignmentsToBusinessVisibleUsers } from "./business-visible-users";
import { getBusinessVisibleEmployeeIds } from "./business-visible-users.server";
import {
  processAiConversationTurn,
  type ProcessAiConversationTurnResult,
} from "./ai-conversation-orchestrator.server";
import type { ConversationMessage, ExtractionFieldMetadata } from "./ai-travel-extraction";
import {
  generateAndSendAiResponse,
  type AiConversationResponseDependencies,
  type AiConversationResponseResult,
} from "./ai-conversation-response.server";
import {
  cancelPendingAiWhatsAppFollowUps,
  scheduleAiWhatsAppFollowUp,
  type AiFollowUpRepository,
  type ScheduleFollowUpResult,
} from "./ai-whatsapp-followup.server";

export type ProcessAIWhatsAppDependencies = AiConversationResponseDependencies & {
  followUpRepository?: AiFollowUpRepository;
};

export type ProcessConversationResult =
  | {
      status: "processed";
      conversation_id: string;
      processed_message_id: string;
      missing_information: string[];
      requirements: Extract<
        ProcessAiConversationTurnResult,
        { status: "processed" }
      >["requirements"];
      destination_assignment: Extract<
        ProcessAiConversationTurnResult,
        { status: "processed" }
      >["destinationAssignment"];
      next_question: Extract<
        ProcessAiConversationTurnResult,
        { status: "processed" }
      >["nextQuestion"];
      response: AiConversationResponseResult;
      follow_up: ScheduleFollowUpResult | null;
    }
  | {
      status: "skipped";
      conversation_id: string;
      reason: "human_active" | "already_processed" | "no_inbound_messages";
    };

type ConversationRow = {
  id: string;
  conversation_mode: string;
  ai_processing_status: string;
  ai_last_processed_message_id: string | null;
  assigned_employee_id: string | null;
  customer_id: string | null;
  lead_id: string | null;
  enquiry_id: string | null;
  phone_number: string;
};

type ProcessingMetadata = {
  extraction_version: 1;
  extracted_at: string;
  source_message_id: string;
  fields: Partial<Record<string, ExtractionFieldMetadata>>;
  destination_resolution: {
    status: "resolved" | "ambiguous" | "unresolved" | "unknown";
    destination_id: string | null;
    candidate_ids: string[];
  };
};

export async function processAIWhatsAppConversation(
  conversationId: string,
  dependencies: ProcessAIWhatsAppDependencies = {},
): Promise<ProcessConversationResult> {
  const { data: conversation, error: conversationError } = await supabaseAdmin
    .from("whatsapp_conversations")
    .select(
      "id,conversation_mode,ai_processing_status,ai_last_processed_message_id,assigned_employee_id,customer_id,lead_id,enquiry_id,phone_number",
    )
    .eq("id", conversationId)
    .single();
  if (conversationError) throw conversationError;

  const current = conversation as ConversationRow;
  if (current.conversation_mode === "HUMAN_ACTIVE") {
    await cancelPendingAiWhatsAppFollowUps(
      conversationId,
      "conversation became HUMAN_ACTIVE",
      dependencies.followUpRepository,
    );
    return { status: "skipped", conversation_id: conversationId, reason: "human_active" };
  }

  const { data: messages, error: messagesError } = await supabaseAdmin
    .from("whatsapp_messages")
    .select("id,direction,body,message_timestamp")
    .eq("conversation_id", conversationId)
    .order("message_timestamp", { ascending: true });
  if (messagesError) throw messagesError;

  const latestMessage = messages?.at(-1);
  if (!latestMessage || latestMessage.direction !== "inbound" || !latestMessage.body?.trim()) {
    return { status: "skipped", conversation_id: conversationId, reason: "no_inbound_messages" };
  }

  const inboundMessages = messages.filter(
    (message) => message.direction === "inbound" && message.body?.trim(),
  ) as ConversationMessage[];
  const latestInbound = inboundMessages.at(-1);
  if (!latestInbound) {
    return { status: "skipped", conversation_id: conversationId, reason: "no_inbound_messages" };
  }
  await cancelPendingAiWhatsAppFollowUps(
    conversationId,
    "customer replied",
    dependencies.followUpRepository,
  );
  if (
    current.ai_processing_status === "completed" &&
    current.ai_last_processed_message_id === latestInbound.id
  ) {
    return { status: "skipped", conversation_id: conversationId, reason: "already_processed" };
  }

  const { data: claim, error: claimError } = await supabaseAdmin
    .from("whatsapp_conversations")
    .update({ ai_processing_status: "processing", ai_processing_error: null })
    .eq("id", conversationId)
    .neq("ai_processing_status", "processing")
    .select("id")
    .maybeSingle();
  if (claimError) throw claimError;
  if (!claim) {
    return { status: "skipped", conversation_id: conversationId, reason: "already_processed" };
  }

  try {
    const { data: destinations, error: destinationsError } = await supabaseAdmin
      .from("destinations")
      .select("id,name")
      .eq("is_active", true);
    if (destinationsError) throw destinationsError;

    const { data: activeAssignments, error: assignmentsError } = await supabaseAdmin
      .from("destination_employee_assignments")
      .select("id,destination_id,employee_id,is_active")
      .eq("is_active", true);
    if (assignmentsError) throw assignmentsError;
    const businessVisibleEmployeeIds = await getBusinessVisibleEmployeeIds([
      ...new Set((activeAssignments ?? []).map(({ employee_id }) => employee_id)),
    ]);
    const businessVisibleAssignments = filterAssignmentsToBusinessVisibleUsers(
      activeAssignments ?? [],
      businessVisibleEmployeeIds,
    );

    let lead = null;
    if (current.lead_id) {
      const { data: leadRow, error: leadError } = await supabaseAdmin
        .from("leads")
        .select("id,assigned_to,destination_id")
        .eq("id", current.lead_id)
        .maybeSingle();
      if (leadError) throw leadError;
      lead = leadRow;
    }

    const orchestration = await processAiConversationTurn({
      conversation: {
        id: current.id,
        conversation_mode: current.conversation_mode as "AI_ACTIVE" | "HUMAN_ACTIVE",
        assigned_employee_id: current.assigned_employee_id,
        lead_id: current.lead_id,
        enquiry_id: current.enquiry_id,
      },
      inboundMessages,
      destinations: destinations ?? [],
      activeAssignments: businessVisibleAssignments,
      lead,
    });

    if (orchestration.status === "skipped") {
      return {
        status: "skipped",
        conversation_id: conversationId,
        reason: orchestration.reason === "human_active" ? "human_active" : "no_inbound_messages",
      };
    }

    const extractedAt = new Date().toISOString();
    const metadata: ProcessingMetadata = {
      extraction_version: 1,
      extracted_at: extractedAt,
      source_message_id: orchestration.processed_message_id,
      fields: orchestration.field_metadata,
      destination_resolution: orchestration.destination_resolution,
    };

    const { error: requirementsError } = await supabaseAdmin
      .from("whatsapp_travel_requirements")
      .upsert(
        {
          conversation_id: conversationId,
          customer_id: current.customer_id,
          lead_id: current.lead_id,
          enquiry_id: current.enquiry_id,
          ...orchestration.requirements,
          destination_id: orchestration.destinationAssignment.destination_id,
          extraction_metadata: metadata,
        },
        { onConflict: "conversation_id" },
      );
    if (requirementsError) throw requirementsError;

    const response = await generateAndSendAiResponse(
      {
        conversationId,
        recipientPhone: current.phone_number,
        sourceMessageId: orchestration.processed_message_id,
        conversationMode: current.conversation_mode as "AI_ACTIVE" | "HUMAN_ACTIVE",
        messages: inboundMessages,
        requirements: orchestration.requirements,
        nextQuestion: orchestration.nextQuestion,
      },
      dependencies,
    );
    if (response.status === "failed") throw new Error(response.error);

    const followUp =
      response.status === "sent"
        ? await scheduleAiWhatsAppFollowUp(
            {
              conversationId,
              sourceInboundMessageId: orchestration.processed_message_id,
              sourceOutboundMessageId: response.outbound.message.id,
            },
            dependencies.followUpRepository,
          )
        : null;

    const { error: completedError } = await supabaseAdmin
      .from("whatsapp_conversations")
      .update({
        ai_processing_status: "completed",
        ai_last_processed_message_id: orchestration.processed_message_id,
        ai_last_processed_at: extractedAt,
        ai_processing_error: null,
      })
      .eq("id", conversationId);
    if (completedError) throw completedError;

    return {
      status: "processed",
      conversation_id: conversationId,
      processed_message_id: latestInbound.id,
      missing_information: orchestration.missing_information,
      requirements: orchestration.requirements,
      destination_assignment: orchestration.destinationAssignment,
      next_question: orchestration.nextQuestion,
      response,
      follow_up: followUp,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Travel extraction failed";
    await supabaseAdmin
      .from("whatsapp_conversations")
      .update({ ai_processing_status: "failed", ai_processing_error: message })
      .eq("id", conversationId);
    throw error;
  }
}

export const processWhatsAppConversation = processAIWhatsAppConversation;
