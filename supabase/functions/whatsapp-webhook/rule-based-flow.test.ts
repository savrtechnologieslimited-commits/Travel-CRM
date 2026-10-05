import { describe, expect, test } from "bun:test";
import {
  processRuleBasedWhatsAppMessage,
  type RuleBasedConversation,
  type RuleBasedFlowOperations,
  type RuleBasedRequirements,
} from "./rule-based-flow";

function createHarness(documentUrl: string | null = null) {
  let conversation: RuleBasedConversation = {
    id: "conversation-1",
    customer_id: "customer-1",
    assigned_employee_id: null,
    lead_id: null,
    enquiry_id: null,
    conversation_mode: "AI_ACTIVE",
    current_flow: "WELCOME",
    current_step: "START",
  };
  let requirements: RuleBasedRequirements = {
    destination_id: null,
    destination_text: null,
    scope: null,
    name: null,
    travel_start_date: null,
    adults: null,
    children: null,
    departure_city: null,
    approximate_budget: null,
    special_requirements: null,
    document_status: "not_checked",
  };
  let enquiryCount = 0;
  let leadCount = 0;
  const notifications: { employeeId: string; conversationId: string; enquiryNumber: string }[] = [];
  const replies: { text: string; buttons?: string[]; document?: { url: string; name?: string | null } }[] = [];
  const destinations = [
    { id: "dubai", name: "Dubai", scope: "international" as const, is_active: true },
    { id: "goa", name: "Goa", scope: "domestic" as const, is_active: true },
  ];
  const operations: RuleBasedFlowOperations = {
    getConversation: async () => conversation,
    getRequirements: async () => requirements,
    saveConversation: async ({ patch }) => {
      conversation = { ...conversation, ...patch };
    },
    saveRequirements: async ({ patch }) => {
      requirements = { ...requirements, ...patch };
    },
    listDestinations: async (scope) => destinations.filter((destination) => destination.scope === scope),
    findDestinationEmployee: async () => null,
    createEnquiry: async () => {
      enquiryCount += 1;
      return { id: `enquiry-${enquiryCount}`, enquiry_number: `ENQ/2026-27/00000${enquiryCount}` };
    },
    upsertLead: async () => {
      leadCount += 1;
      return { id: "lead-1" };
    },
    updateCustomerName: async () => undefined,
    notifyAssignedEmployee: async (input) => { notifications.push(input); },
    findDestinationDocument: async () => (documentUrl ? { url: documentUrl, name: "Dubai guide.pdf" } : null),
    sendReply: async (_conversationId, reply) => {
      replies.push(reply);
    },
  };
  return {
    operations,
    get conversation() {
      return conversation;
    },
    get requirements() {
      return requirements;
    },
    get enquiryCount() {
      return enquiryCount;
    },
    get leadCount() {
      return leadCount;
    },
    replies,
    notifications,
  };
}

async function reachDubaiQuestions(harness: ReturnType<typeof createHarness>) {
  await processRuleBasedWhatsAppMessage("conversation-1", "Hi", harness.operations);
  await processRuleBasedWhatsAppMessage("conversation-1", "International", harness.operations);
  return processRuleBasedWhatsAppMessage("conversation-1", "Dubai", harness.operations);
}

describe("rule-based WhatsApp enquiry journey", () => {
  test("creates one enquiry, links the lead, and persists the full question sequence", async () => {
    const harness = createHarness("https://example.test/dubai.pdf");
    const destinationResult = await reachDubaiQuestions(harness);

    expect(destinationResult).toMatchObject({ flow: "QUESTIONS", step: "NAME", enquiryNumber: "ENQ/2026-27/000001" });
    expect(harness.conversation.enquiry_id).toBe("enquiry-1");
    expect(harness.conversation.lead_id).toBe("lead-1");
    expect(harness.requirements.document_status).toBe("sent");
    expect(harness.replies.some((reply) => reply.document?.url === "https://example.test/dubai.pdf")).toBe(true);

    for (const answer of ["Abhishek", "2026-12-10", "2", "1", "Delhi", "1.5 lakh", "Vegetarian meals"]) {
      await processRuleBasedWhatsAppMessage("conversation-1", answer, harness.operations);
    }

    expect(harness.requirements).toMatchObject({
      name: "Abhishek",
      travel_start_date: "2026-12-10",
      adults: 2,
      children: 1,
      departure_city: "Delhi",
      approximate_budget: 150000,
      special_requirements: "Vegetarian meals",
    });
    expect(harness.conversation.current_flow).toBe("COMPLETED");
    expect(harness.conversation.current_step).toBe("COMPLETED");
    expect(harness.enquiryCount).toBe(1);
    expect(harness.leadCount).toBeGreaterThan(0);
  });

  test("repeated messages reuse the active enquiry and missing PDFs do not stop the flow", async () => {
    const harness = createHarness();
    await reachDubaiQuestions(harness);
    await processRuleBasedWhatsAppMessage("conversation-1", "Abhishek", harness.operations);
    await processRuleBasedWhatsAppMessage("conversation-1", "2026-12-10", harness.operations);

    expect(harness.enquiryCount).toBe(1);
    expect(harness.requirements.document_status).toBe("unavailable");
    expect(harness.conversation.enquiry_id).toBe("enquiry-1");
  });

  test("Speak to Agent stops automation and creates the journey if needed", async () => {
    const harness = createHarness();
    await processRuleBasedWhatsAppMessage("conversation-1", "Hi", harness.operations);
    const result = await processRuleBasedWhatsAppMessage("conversation-1", "Speak to Agent", harness.operations);

    expect(result).toMatchObject({ flow: "COMPLETED", step: "COMPLETED", enquiryNumber: "ENQ/2026-27/000001" });
    expect(harness.conversation.conversation_mode).toBe("HUMAN_ACTIVE");
    expect(harness.enquiryCount).toBe(1);
    expect(harness.replies.at(-1)?.text).toContain("travel specialist");
  });

  test("persists destination employee assignment and notifies the assigned employee", async () => {
    const harness = createHarness();
    harness.operations.findDestinationEmployee = async () => "employee-1";
    await reachDubaiQuestions(harness);

    expect(harness.conversation.assigned_employee_id).toBe("employee-1");
    expect(harness.notifications).toEqual([{
      employeeId: "employee-1",
      conversationId: "conversation-1",
      enquiryNumber: "ENQ/2026-27/000001",
    }]);
    expect(harness.enquiryCount).toBe(1);
    expect(harness.leadCount).toBe(1);
  });

  test("new trip resets the state and creates a separate enquiry after destination selection", async () => {
    const harness = createHarness();
    await reachDubaiQuestions(harness);
    await processRuleBasedWhatsAppMessage("conversation-1", "Abhishek", harness.operations);
    await processRuleBasedWhatsAppMessage("conversation-1", "2026-12-10", harness.operations);
    await processRuleBasedWhatsAppMessage("conversation-1", "2", harness.operations);
    await processRuleBasedWhatsAppMessage("conversation-1", "0", harness.operations);
    await processRuleBasedWhatsAppMessage("conversation-1", "Delhi", harness.operations);
    await processRuleBasedWhatsAppMessage("conversation-1", "100000", harness.operations);
    await processRuleBasedWhatsAppMessage("conversation-1", "None", harness.operations);
    await processRuleBasedWhatsAppMessage("conversation-1", "New trip", harness.operations);
    await processRuleBasedWhatsAppMessage("conversation-1", "International", harness.operations);
    const result = await processRuleBasedWhatsAppMessage("conversation-1", "Dubai", harness.operations);

    expect(result.enquiryNumber).toBe("ENQ/2026-27/000002");
    expect(harness.enquiryCount).toBe(2);
  });
});
