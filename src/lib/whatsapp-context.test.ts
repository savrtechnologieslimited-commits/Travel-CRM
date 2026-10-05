import { describe, expect, test } from "bun:test";
import { findBestConversationForContext, formatConversationMode, rankWhatsAppConversationMatch } from "./whatsapp-data";

describe("whatsapp context lookup", () => {
  test("opens the existing enquiry conversation before a weaker customer match", () => {
    const matches = [
      {
        id: "c-1",
        lead_id: null,
        enquiry_id: null,
        customer_id: "customer-1",
        phone_number: "919876543210",
        unread_count: 0,
        conversation_mode: "AI_ACTIVE",
      },
      {
        id: "c-2",
        lead_id: null,
        enquiry_id: "enquiry-42",
        customer_id: "customer-1",
        phone_number: "919876543210",
        unread_count: 0,
        conversation_mode: "HUMAN_ACTIVE",
      },
    ];

    const best = findBestConversationForContext(matches, {
      leadId: null,
      enquiryId: "enquiry-42",
      customerId: "customer-1",
      phoneNumber: "9876543210",
    });

    expect(best?.id).toBe("c-2");
    expect(rankWhatsAppConversationMatch(matches[1], {
      leadId: null,
      enquiryId: "enquiry-42",
      customerId: "customer-1",
      phoneNumber: "9876543210",
    })).toBeGreaterThan(rankWhatsAppConversationMatch(matches[0], {
      leadId: null,
      enquiryId: "enquiry-42",
      customerId: "customer-1",
      phoneNumber: "9876543210",
    }));
  });

  test("labels the legacy AI_ACTIVE enum as deterministic automation and keeps human takeover", () => {
    const ai = { id: "c-ai", conversation_mode: "AI_ACTIVE" };
    const human = { id: "c-human", conversation_mode: "HUMAN_ACTIVE" };

    expect(ai.conversation_mode).toBe("AI_ACTIVE");
    expect(human.conversation_mode).toBe("HUMAN_ACTIVE");
    expect(formatConversationMode(ai.conversation_mode)).toBe("AUTOMATION ACTIVE");
    expect(formatConversationMode(human.conversation_mode)).toBe("HUMAN ACTIVE");
  });
});
