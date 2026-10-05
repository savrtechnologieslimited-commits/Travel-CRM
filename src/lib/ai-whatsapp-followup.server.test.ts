import { describe, expect, test } from "bun:test";
import {
  assertSupabaseResult,
  canSendWhatsAppFollowUp,
  cancelPendingAiWhatsAppFollowUps,
  scheduleAiWhatsAppFollowUp,
  sendDueAiWhatsAppFollowUp,
  type AiFollowUpRepository,
  type AiFollowUpTask,
} from "./ai-whatsapp-followup.server";
import type { SendWhatsAppTextMessageResult } from "./whatsapp-outbound.server";

function createRepository(mode: "AI_ACTIVE" | "HUMAN_ACTIVE" = "AI_ACTIVE") {
  const tasks: AiFollowUpTask[] = [];
  let latestInbound = { id: "inbound-1", message_timestamp: "2026-01-01T00:00:00.000Z" };
  const repository: AiFollowUpRepository = {
    findConversation: async () => ({
      id: "conversation-1",
      customer_id: "customer-1",
      phone_number: "919876543210",
      assigned_employee_id: "employee-1",
      conversation_mode: mode,
      status: "open",
    }),
    listPendingTasks: async () => tasks.filter((task) => task.status === "pending"),
    createTask: async (input) => {
      const task: AiFollowUpTask = {
        id: `task-${tasks.length + 1}`,
        title: input.title,
        description: input.description,
        status: "pending",
        due_date: input.dueAt.slice(0, 10),
        due_time: input.dueAt.slice(11, 19),
        assigned_to: input.assignedTo,
        customer_id: input.customerId,
        completed_at: null,
      };
      tasks.push(task);
      return task;
    },
    findTask: async (taskId) => tasks.find((task) => task.id === taskId) ?? null,
    updateTask: async (taskId, values) => {
      const task = tasks.find((candidate) => candidate.id === taskId);
      if (task) Object.assign(task, values);
    },
    findLatestInboundMessage: async () => latestInbound,
  };
  return { repository, tasks, setLatestInbound: (message: typeof latestInbound) => { latestInbound = message; } };
}

const sentResult: SendWhatsAppTextMessageResult = {
  status: "sent",
  provider: {
    providerMessageId: "mock-follow-up-1",
    status: "sent",
    timestamp: "2026-01-02T00:00:00.000Z",
    recipient: "919876543210",
    messageType: "text",
  },
  message: {
    id: "outbound-1",
    conversation_id: "conversation-1",
    wa_message_id: "mock-follow-up-1",
    direction: "outbound",
    message_type: "text",
    body: "Just checking in on your travel plans. Would you like to continue?",
    delivery_status: "sent",
    message_timestamp: "2026-01-02T00:00:00.000Z",
  },
};

describe("AI WhatsApp follow-up engine", () => {
  test("schedules a follow-up after an AI question", async () => {
    const { repository, tasks } = createRepository();
    const result = await scheduleAiWhatsAppFollowUp({
      conversationId: "conversation-1",
      sourceInboundMessageId: "inbound-1",
      sourceOutboundMessageId: "outbound-1",
      delayHours: 12,
      now: "2026-01-01T00:00:00.000Z",
    }, repository);
    expect(result.status).toBe("scheduled");
    expect(result.dueAt).toBe("2026-01-01T12:00:00.000Z");
    expect(tasks[0]?.assigned_to).toBe("employee-1");
  });

  test("duplicate scheduling returns the existing pending task", async () => {
    const { repository, tasks } = createRepository();
    const input = { conversationId: "conversation-1", sourceInboundMessageId: "inbound-1", sourceOutboundMessageId: "outbound-1" };
    const first = await scheduleAiWhatsAppFollowUp(input, repository);
    const second = await scheduleAiWhatsAppFollowUp(input, repository);
    expect(first.status).toBe("scheduled");
    expect(second.status).toBe("duplicate");
    expect(tasks).toHaveLength(1);
  });

  test("customer reply cancels the pending follow-up", async () => {
    const { repository, tasks } = createRepository();
    await scheduleAiWhatsAppFollowUp({ conversationId: "conversation-1", sourceInboundMessageId: "inbound-1", sourceOutboundMessageId: "outbound-1" }, repository);
    const cancelled = await cancelPendingAiWhatsAppFollowUps("conversation-1", "customer replied", repository);
    expect(cancelled).toBe(1);
    expect(tasks[0]?.status).toBe("completed");
    expect(tasks[0]?.completed_at).toBeTruthy();
  });

  test("next AI question gets a distinct follow-up", async () => {
    const { repository, tasks } = createRepository();
    await scheduleAiWhatsAppFollowUp({ conversationId: "conversation-1", sourceInboundMessageId: "inbound-1", sourceOutboundMessageId: "outbound-1" }, repository);
    await cancelPendingAiWhatsAppFollowUps("conversation-1", "customer replied", repository);
    const result = await scheduleAiWhatsAppFollowUp({ conversationId: "conversation-1", sourceInboundMessageId: "inbound-2", sourceOutboundMessageId: "outbound-2" }, repository);
    expect(result.status).toBe("scheduled");
    expect(tasks).toHaveLength(2);
  });

  test("HUMAN_ACTIVE cancels and skips follow-up scheduling", async () => {
    const { repository } = createRepository("HUMAN_ACTIVE");
    const result = await scheduleAiWhatsAppFollowUp({ conversationId: "conversation-1", sourceInboundMessageId: "inbound-1", sourceOutboundMessageId: "outbound-1" }, repository);
    expect(result).toEqual({ status: "skipped", reason: "human_active" });
  });

  test("closed conversations do not schedule follow-ups", async () => {
    const { repository } = createRepository();
    repository.findConversation = async () => ({
      id: "conversation-1", customer_id: "customer-1", phone_number: "919876543210", assigned_employee_id: "employee-1", conversation_mode: "AI_ACTIVE", status: "closed",
    });
    const result = await scheduleAiWhatsAppFollowUp({ conversationId: "conversation-1", sourceInboundMessageId: "inbound-1", sourceOutboundMessageId: "outbound-1" }, repository);
    expect(result).toEqual({ status: "skipped", reason: "conversation_closed" });
  });

  test("provisional WhatsApp eligibility is explicit", () => {
    const result = canSendWhatsAppFollowUp({
      conversationMode: "AI_ACTIVE",
      conversationStatus: "open",
      lastInboundAt: "2026-01-01T00:00:00.000Z",
    });
    expect(result.eligible).toBe(true);
    expect(result.provisional).toBe(true);
    expect(result.reason).toContain("Meta messaging-window rules");
  });

  test("human takeover makes due follow-up skip and complete the task", async () => {
    const { repository, tasks } = createRepository();
    await scheduleAiWhatsAppFollowUp({ conversationId: "conversation-1", sourceInboundMessageId: "inbound-1", sourceOutboundMessageId: "outbound-1" }, repository);
    repository.findConversation = async () => ({
      id: "conversation-1", customer_id: "customer-1", phone_number: "919876543210", assigned_employee_id: "employee-1", conversation_mode: "HUMAN_ACTIVE", status: "open",
    });
    const result = await sendDueAiWhatsAppFollowUp({ taskId: tasks[0]!.id }, repository);
    expect(result.status).toBe("skipped");
    expect(tasks[0]?.status).toBe("completed");
  });

  test("due follow-up uses the outbound service contract and mock result", async () => {
    const { repository, tasks } = createRepository();
    await scheduleAiWhatsAppFollowUp({ conversationId: "conversation-1", sourceInboundMessageId: "inbound-1", sourceOutboundMessageId: "outbound-1" }, repository);
    let call: { conversationId: string; recipientPhone: string; clientMessageId: string } | null = null;
    const result = await sendDueAiWhatsAppFollowUp({
      taskId: tasks[0]!.id,
      sendText: async (input) => {
        call = input;
        return sentResult;
      },
    }, repository);
    expect(result.status).toBe("sent");
    expect(call).toMatchObject({ conversationId: "conversation-1", recipientPhone: "919876543210", clientMessageId: "ai-followup:outbound-1" });
    expect(tasks[0]?.status).toBe("completed");
  });

  test("customer reply before due time cancels without sending", async () => {
    const { repository, tasks, setLatestInbound } = createRepository();
    await scheduleAiWhatsAppFollowUp({ conversationId: "conversation-1", sourceInboundMessageId: "inbound-1", sourceOutboundMessageId: "outbound-1" }, repository);
    setLatestInbound({ id: "inbound-2", message_timestamp: "2026-01-01T01:00:00.000Z" });
    let sent = false;
    const result = await sendDueAiWhatsAppFollowUp({ taskId: tasks[0]!.id, sendText: async () => { sent = true; return sentResult; } }, repository);
    expect(result).toEqual({ status: "skipped", reason: "customer_replied" });
    expect(sent).toBe(false);
  });

  test("provider failure leaves the task pending for retry", async () => {
    const { repository, tasks } = createRepository();
    await scheduleAiWhatsAppFollowUp({ conversationId: "conversation-1", sourceInboundMessageId: "inbound-1", sourceOutboundMessageId: "outbound-1" }, repository);
    await expect(sendDueAiWhatsAppFollowUp({ taskId: tasks[0]!.id, sendText: async () => { throw new Error("provider unavailable"); } }, repository)).rejects.toThrow("provider unavailable");
    expect(tasks[0]?.status).toBe("pending");
  });

  test("undefined Supabase result throws before any .error access", () => {
    expect(() => assertSupabaseResult(undefined, "findTask")).toThrow("Supabase findTask returned an undefined result");
  });
});
