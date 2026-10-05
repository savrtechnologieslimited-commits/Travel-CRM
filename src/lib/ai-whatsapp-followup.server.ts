import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendWhatsAppTextMessage, type SendWhatsAppTextMessageResult } from "./whatsapp-outbound.server";

export const AI_WHATSAPP_FOLLOWUP_TASK_TYPE = "whatsapp_ai_follow_up";
const FOLLOWUP_MARKER = "AI_WHATSAPP_FOLLOWUP_V1";
const DEFAULT_DELAY_HOURS = 24;

export type AiFollowUpConversation = {
  id: string;
  customer_id: string | null;
  phone_number: string;
  assigned_employee_id: string | null;
  conversation_mode: "AI_ACTIVE" | "HUMAN_ACTIVE";
  status: string;
};

export type AiFollowUpTask = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  due_date: string | null;
  due_time: string | null;
  assigned_to: string | null;
  customer_id: string | null;
  completed_at: string | null;
};

export type AiFollowUpMetadata = {
  conversationId: string;
  sourceInboundMessageId: string;
  sourceOutboundMessageId: string;
  idempotencyKey: string;
};

export type AiFollowUpRepository = {
  findConversation: (conversationId: string) => Promise<AiFollowUpConversation | null>;
  listPendingTasks: (taskType: string) => Promise<AiFollowUpTask[]>;
  createTask: (input: {
    title: string;
    description: string;
    dueAt: string;
    assignedTo: string | null;
    customerId: string | null;
  }) => Promise<AiFollowUpTask>;
  findTask: (taskId: string) => Promise<AiFollowUpTask | null>;
  updateTask: (taskId: string, values: Record<string, unknown>) => Promise<void>;
  findLatestInboundMessage: (conversationId: string) => Promise<{ id: string; message_timestamp: string } | null>;
};

export type FollowUpEligibility = {
  eligible: boolean;
  provisional: true;
  reason: string;
};

export type ScheduleFollowUpResult =
  | { status: "scheduled"; task: AiFollowUpTask; dueAt: string }
  | { status: "duplicate"; task: AiFollowUpTask }
  | { status: "skipped"; reason: "human_active" | "conversation_closed" };

function readDelayHours(env: NodeJS.ProcessEnv = process.env): number {
  const configured = Number(env["AI_WHATSAPP_FOLLOWUP_DELAY_HOURS"]);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_DELAY_HOURS;
}

function isClosedConversation(status: string): boolean {
  return ["closed", "completed", "resolved", "lost", "cancelled"].includes(status.toLowerCase());
}

function metadataFromTask(task: AiFollowUpTask): AiFollowUpMetadata | null {
  if (!task.description?.startsWith(FOLLOWUP_MARKER)) return null;
  try {
    return JSON.parse(task.description.slice(FOLLOWUP_MARKER.length).trim()) as AiFollowUpMetadata;
  } catch {
    return null;
  }
}

export function assertSupabaseResult<T>(
  result: unknown,
  context: string,
): T | null {
  if (!result || typeof result !== "object") {
    throw new Error(`Supabase ${context} returned an undefined result`);
  }

  const typed = result as { data?: T | null; error?: unknown };
  if (typed.error) {
    throw typed.error;
  }

  return typed.data ?? null;
}

function taskDescription(metadata: AiFollowUpMetadata): string {
  return `${FOLLOWUP_MARKER} ${JSON.stringify(metadata)}`;
}

export function canSendWhatsAppFollowUp(input: {
  conversationMode: "AI_ACTIVE" | "HUMAN_ACTIVE";
  conversationStatus: string;
  lastInboundAt: string | null;
  now?: string;
}): FollowUpEligibility {
  if (input.conversationMode === "HUMAN_ACTIVE") {
    return { eligible: false, provisional: true, reason: "Conversation is HUMAN_ACTIVE" };
  }
  if (isClosedConversation(input.conversationStatus)) {
    return { eligible: false, provisional: true, reason: "Conversation is closed" };
  }
  if (!input.lastInboundAt) {
    return { eligible: false, provisional: true, reason: "No inbound message timestamp is available" };
  }
  return {
    eligible: true,
    provisional: true,
    reason: "Provisional CRM timestamp check; Meta messaging-window rules are not enforced",
  };
}

export async function scheduleAiWhatsAppFollowUp(input: {
  conversationId: string;
  sourceInboundMessageId: string;
  sourceOutboundMessageId: string;
  delayHours?: number;
  now?: string;
}, repository: AiFollowUpRepository = createSupabaseFollowUpRepository()): Promise<ScheduleFollowUpResult> {
  const conversation = await repository.findConversation(input.conversationId);
  if (!conversation) throw new Error("WhatsApp conversation not found");
  if (conversation.conversation_mode === "HUMAN_ACTIVE") return { status: "skipped", reason: "human_active" };
  if (isClosedConversation(conversation.status)) return { status: "skipped", reason: "conversation_closed" };

  const metadata: AiFollowUpMetadata = {
    conversationId: input.conversationId,
    sourceInboundMessageId: input.sourceInboundMessageId,
    sourceOutboundMessageId: input.sourceOutboundMessageId,
    idempotencyKey: `ai-followup:${input.sourceOutboundMessageId}`,
  };
  const existing = (await repository.listPendingTasks(AI_WHATSAPP_FOLLOWUP_TASK_TYPE))
    .find((task) => metadataFromTask(task)?.idempotencyKey === metadata.idempotencyKey);
  if (existing) return { status: "duplicate", task: existing };

  const now = input.now ? new Date(input.now) : new Date();
  const delayHours = input.delayHours ?? readDelayHours();
  const dueAt = new Date(now.getTime() + delayHours * 60 * 60 * 1000).toISOString();
  const task = await repository.createTask({
    title: "WhatsApp AI follow-up",
    description: taskDescription(metadata),
    dueAt,
    assignedTo: conversation.assigned_employee_id,
    customerId: conversation.customer_id,
  });
  return { status: "scheduled", task, dueAt };
}

export async function cancelPendingAiWhatsAppFollowUps(
  conversationId: string,
  reason: string,
  repository: AiFollowUpRepository = createSupabaseFollowUpRepository(),
): Promise<number> {
  const tasks = await repository.listPendingTasks(AI_WHATSAPP_FOLLOWUP_TASK_TYPE);
  const matching = tasks.filter((task) => metadataFromTask(task)?.conversationId === conversationId);
  const completedAt = new Date().toISOString();
  for (const task of matching) {
    await repository.updateTask(task.id, {
      status: "completed",
      completed_at: completedAt,
      progress_note: `AI WhatsApp follow-up cancelled: ${reason}`,
    });
  }
  return matching.length;
}

export async function sendDueAiWhatsAppFollowUp(input: {
  taskId: string;
  now?: string;
  sendText?: (input: {
    conversationId: string;
    recipientPhone: string;
    text: string;
    clientMessageId: string;
  }) => Promise<SendWhatsAppTextMessageResult>;
}, repository: AiFollowUpRepository = createSupabaseFollowUpRepository()) {
  const task = await repository.findTask(input.taskId);
  if (!task || task.status !== "pending") return { status: "skipped" as const, reason: "not_pending" };
  const metadata = metadataFromTask(task);
  if (!metadata) return { status: "skipped" as const, reason: "invalid_task" };

  const conversation = await repository.findConversation(metadata.conversationId);
  const latestInbound = await repository.findLatestInboundMessage(metadata.conversationId);
  if (!conversation) return { status: "skipped" as const, reason: "conversation_missing" };
  const eligibilityInput: {
    conversationMode: "AI_ACTIVE" | "HUMAN_ACTIVE";
    conversationStatus: string;
    lastInboundAt: string | null;
    now?: string;
  } = {
    conversationMode: conversation.conversation_mode,
    conversationStatus: conversation.status,
    lastInboundAt: latestInbound?.message_timestamp ?? null,
  };
  if (input.now !== undefined) eligibilityInput.now = input.now;
  const eligibility = canSendWhatsAppFollowUp(eligibilityInput);
  if (!eligibility.eligible) {
    await repository.updateTask(task.id, {
      status: "completed",
      completed_at: new Date().toISOString(),
      progress_note: `AI WhatsApp follow-up skipped: ${eligibility.reason}`,
    });
    return { status: "skipped" as const, reason: eligibility.reason };
  }
  if (latestInbound && latestInbound.id !== metadata.sourceInboundMessageId) {
    await repository.updateTask(task.id, {
      status: "completed",
      completed_at: new Date().toISOString(),
      progress_note: "AI WhatsApp follow-up cancelled: customer replied",
    });
    return { status: "skipped" as const, reason: "customer_replied" };
  }

  const sendText = input.sendText ?? ((message) => sendWhatsAppTextMessage(message));
  const outbound = await sendText({
    conversationId: conversation.id,
    recipientPhone: conversation.phone_number,
    text: "Just checking in on your travel plans. Would you like to continue?",
    clientMessageId: metadata.idempotencyKey,
  });
  await repository.updateTask(task.id, {
    status: "completed",
    completed_at: new Date().toISOString(),
    progress_note: `AI WhatsApp follow-up sent: ${outbound.provider.providerMessageId}`,
  });
  return { status: "sent" as const, outbound };
}

function createSupabaseFollowUpRepository(): AiFollowUpRepository {
  return {
    async findConversation(conversationId) {
      const result = await supabaseAdmin
        .from("whatsapp_conversations")
        .select("id,customer_id,phone_number,assigned_employee_id,conversation_mode,status")
        .eq("id", conversationId)
        .maybeSingle();
      return assertSupabaseResult<AiFollowUpConversation>(result, "findConversation");
    },
    async listPendingTasks(taskType) {
      const result = await supabaseAdmin
        .from("tasks")
        .select("id,title,description,status,due_date,due_time,assigned_to,customer_id,completed_at")
        .eq("task_type", taskType)
        .eq("status", "pending");
      return (assertSupabaseResult<AiFollowUpTask[]>(result, "listPendingTasks") ?? []) as AiFollowUpTask[];
    },
    async createTask({ title, description, dueAt, assignedTo, customerId }) {
      const due = new Date(dueAt);
      const result = await supabaseAdmin
        .from("tasks")
        .insert({
          title,
          description,
          task_type: AI_WHATSAPP_FOLLOWUP_TASK_TYPE,
          status: "pending",
          priority: "medium",
          due_date: due.toISOString().slice(0, 10),
          due_time: due.toISOString().slice(11, 19),
          assigned_to: assignedTo,
          customer_id: customerId,
        } as never)
        .select("id,title,description,status,due_date,due_time,assigned_to,customer_id,completed_at")
        .single();
      return assertSupabaseResult<AiFollowUpTask>(result, "createTask") as AiFollowUpTask;
    },
    async findTask(taskId) {
      const result = await supabaseAdmin
        .from("tasks")
        .select("id,title,description,status,due_date,due_time,assigned_to,customer_id,completed_at")
        .eq("id", taskId)
        .maybeSingle();
      return assertSupabaseResult<AiFollowUpTask>(result, "findTask");
    },
    async updateTask(taskId, values) {
      const result = await supabaseAdmin.from("tasks").update(values as never).eq("id", taskId);
      assertSupabaseResult(result, "updateTask");
    },
    async findLatestInboundMessage(conversationId) {
      const result = await supabaseAdmin
        .from("whatsapp_messages")
        .select("id,message_timestamp")
        .eq("conversation_id", conversationId)
        .eq("direction", "inbound")
        .order("message_timestamp", { ascending: false })
        .limit(1)
        .maybeSingle();
      return assertSupabaseResult<{ id: string; message_timestamp: string }>(result, "findLatestInboundMessage");
    },
  };
}
