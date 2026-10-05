import { describe, expect, test } from "bun:test";
import {
  buildContactTagSummary,
  buildQuotedReplyLabel,
  matchesContactTagIds,
  matchesConversationTagFilter,
} from "./whatsapp-inbox-adapter";

describe("WhatsApp metadata helpers", () => {
  test("builds a contact tag summary with normalized labels", () => {
    expect(
      buildContactTagSummary([
        { name: "VIP", color: "#ff0000" },
        { name: "High Value", color: "#00aa00" },
      ]),
    ).toEqual([
      { name: "VIP", color: "#ff0000", description: null },
      { name: "High Value", color: "#00aa00", description: null },
    ]);
  });

  test("matches tag filters case-insensitively", () => {
    expect(matchesConversationTagFilter(["VIP", "Travel"], "vip")).toBe(true);
    expect(matchesConversationTagFilter(["Travel"], "vip")).toBe(false);
    expect(matchesConversationTagFilter([], "vip")).toBe(false);
  });

  test("matches selected tag IDs through canonical CRM links", () => {
    const conversation = { customer_id: "customer-1", lead_id: "lead-1", enquiry_id: null };
    const assignments = [
      { tag_id: "vip", customer_id: "customer-1" },
      { tag_id: "other", lead_id: "lead-2" },
    ];
    expect(matchesContactTagIds(conversation, assignments, ["vip", "priority"])).toBe(true);
    expect(matchesContactTagIds(conversation, assignments, ["other"])).toBe(false);
    expect(matchesContactTagIds(conversation, assignments, [])).toBe(true);
  });

  test("formats quoted reply labels gracefully when the source message is missing", () => {
    expect(buildQuotedReplyLabel(null)).toContain("Replying to a previous message");
    expect(buildQuotedReplyLabel({ body: "Hi there", direction: "inbound" })).toContain("Hi there");
  });
});
