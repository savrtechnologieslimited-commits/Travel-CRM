import { describe, expect, test } from "bun:test";
import {
  buildConversationContextSummary,
  formatWhatsAppMessageDay,
  getWhatsAppCustomerWindow,
  matchesTravelWhatsAppConversationSearch,
  normalizeTravelWhatsAppConversation,
} from "./whatsapp-inbox-adapter";

describe("Travel WhatsApp inbox adapter", () => {
  test("normalizes one-to-one Supabase relations without changing canonical identifiers", () => {
    const conversation = normalizeTravelWhatsAppConversation({
      id: "conversation-1",
      customer_id: "customer-1",
      lead_id: "lead-1",
      enquiry_id: "enquiry-1",
      customers: [{ id: "customer-1", full_name: "Asha" }],
      profiles: null,
      leads: [{ id: "lead-1", code: "LEAD-001" }],
      enquiries: [{ id: "enquiry-1", code: "ENQ-001" }],
    });

    expect(conversation.customers).toEqual({ id: "customer-1", full_name: "Asha" });
    expect(conversation.leads).toEqual({ id: "lead-1", code: "LEAD-001" });
    expect(conversation.enquiries).toEqual({ id: "enquiry-1", code: "ENQ-001" });
    expect(conversation.customer_id).toBe("customer-1");
    expect(conversation.lead_id).toBe("lead-1");
    expect(conversation.enquiry_id).toBe("enquiry-1");
  });

  test("searches existing customer, phone, assignee, lead, and latest message fields", () => {
    const conversation = normalizeTravelWhatsAppConversation({
      customers: { full_name: "Asha Sharma" },
      phone_number: "919999999999",
      profiles: { full_name: "Travel Agent" },
      leads: { code: "LEAD-001" },
      last_message_text: "Please send the Bali options",
    });
    expect(matchesTravelWhatsAppConversationSearch(conversation, "asha")).toBe(true);
    expect(matchesTravelWhatsAppConversationSearch(conversation, "919999")).toBe(true);
    expect(matchesTravelWhatsAppConversationSearch(conversation, "agent")).toBe(true);
    expect(matchesTravelWhatsAppConversationSearch(conversation, "lead-001")).toBe(true);
    expect(matchesTravelWhatsAppConversationSearch(conversation, "Bali options")).toBe(true);
    expect(matchesTravelWhatsAppConversationSearch(conversation, "no match")).toBe(false);
  });

  test("formats WhatsApp message day separators safely", () => {
    const today = new Date();
    expect(formatWhatsAppMessageDay(today.toISOString())).toBe("Today");
    expect(formatWhatsAppMessageDay("invalid timestamp")).toBe("Unknown date");
    expect(formatWhatsAppMessageDay("2020-01-05T12:00:00.000Z")).toBe("January 5, 2020");
  });

  test("calculates the Meta free-form reply window", () => {
    const now = Date.parse("2026-10-02T12:00:00.000Z");
    expect(getWhatsAppCustomerWindow("2026-10-01T12:00:00.000Z", now)).toEqual({ isOpen: false, remainingMs: 0 });
    expect(getWhatsAppCustomerWindow("2026-10-01T12:00:01.000Z", now)).toEqual({ isOpen: true, remainingMs: 1000 });
    expect(getWhatsAppCustomerWindow(null, now)).toEqual({ isOpen: false, remainingMs: 0 });
  });

  test("builds a CRM context summary for the employee conversation panel", () => {
    const summary = buildConversationContextSummary({
      phone_number: "919999999999",
      status: "open",
      conversation_mode: "AI_ACTIVE",
      customers: { full_name: "Asha Sharma", email: "asha@example.com", mobile: "919999999999" },
      profiles: { full_name: "Travel Agent" },
      leads: { code: "LEAD-001", customer_name: "Asha Sharma" },
      enquiries: { code: "ENQ-001" },
    });

    expect(summary).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "Customer", value: "Asha Sharma" }),
      expect.objectContaining({ label: "Lead", value: "LEAD-001" }),
      expect.objectContaining({ label: "Enquiry", value: "ENQ-001" }),
      expect.objectContaining({ label: "Assignment", value: "Travel Agent" }),
    ]));
  });
});
