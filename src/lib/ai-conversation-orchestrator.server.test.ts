import { describe, expect, test } from "bun:test";
import { processAiConversationTurn } from "./ai-conversation-orchestrator.server";

describe("AI conversation orchestrator", () => {
  test("skips human-active conversations", async () => {
    const result = await processAiConversationTurn({
      conversation: {
        id: "c-1",
        conversation_mode: "HUMAN_ACTIVE",
        assigned_employee_id: "human-1",
        lead_id: "l-1",
        enquiry_id: null,
      },
      inboundMessages: [{
        id: "m-1",
        direction: "inbound",
        body: "I want Bali in December.",
        message_timestamp: "2026-01-01T00:00:00.000Z",
      }],
      destinations: [{ id: "d-bali", name: "Bali" }],
      activeAssignments: [],
      lead: { id: "l-1", assigned_to: "human-1", destination_id: null },
    });

    expect(result.status).toBe("skipped");
    expect(result.reason).toBe("human_active");
  });

  test("processes an AI conversation turn and returns the next question", async () => {
    const result = await processAiConversationTurn({
      conversation: {
        id: "c-2",
        conversation_mode: "AI_ACTIVE",
        assigned_employee_id: null,
        lead_id: "l-2",
        enquiry_id: null,
      },
      inboundMessages: [{
        id: "m-2",
        direction: "inbound",
        body: "Hi, I want Bali in December for 4 adults and 2 kids from Hyderabad.",
        message_timestamp: "2026-01-02T00:00:00.000Z",
      }],
      destinations: [{ id: "d-bali", name: "Bali" }],
      activeAssignments: [{ id: "a-1", destination_id: "d-bali", employee_id: "e-1", is_active: true }],
      lead: { id: "l-2", assigned_to: null, destination_id: null },
    });

    expect(result.status).toBe("processed");
    expect(result.processed_message_id).toBe("m-2");
    expect(result.requirements.destination_text).toBe("Bali");
    expect(result.requirements.travel_month).toBe("December");
    expect(result.destinationAssignment.status).toBe("ASSIGNED");
    expect(result.nextQuestion.action).toBe("ASK");
    expect(result.nextQuestion.field).toBe("approximate_budget");
  });

  test("does not process outbound-only messages", async () => {
    let extractorCalled = false;
    const result = await processAiConversationTurn({
      conversation: {
        id: "c-3",
        conversation_mode: "AI_ACTIVE",
        assigned_employee_id: null,
        lead_id: null,
        enquiry_id: null,
      },
      inboundMessages: [{
        id: "m-3",
        direction: "outbound",
        body: "Which month would you prefer?",
      }],
      destinations: [],
      activeAssignments: [],
      extractor: async () => {
        extractorCalled = true;
        throw new Error("extractor should not run");
      },
    });

    expect(result).toEqual({ status: "skipped", conversation_id: "c-3", reason: "no_inbound_messages" });
    expect(extractorCalled).toBe(false);
  });

  test("ignores outbound messages while retaining inbound context", async () => {
    const result = await processAiConversationTurn({
      conversation: {
        id: "c-4",
        conversation_mode: "AI_ACTIVE",
        assigned_employee_id: null,
        lead_id: null,
        enquiry_id: null,
      },
      inboundMessages: [
        { id: "m-4", direction: "inbound", body: "I want Bali." },
        { id: "m-5", direction: "outbound", body: "Which month are you planning?" },
      ],
      destinations: [],
      activeAssignments: [],
    });

    expect(result.status).toBe("processed");
    expect(result.processed_message_id).toBe("m-4");
  });
});
