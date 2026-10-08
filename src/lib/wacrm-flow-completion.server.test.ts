import { createHmac } from "node:crypto";
import { describe, expect, it } from "bun:test";
import {
  normalizeWacrmFlowAnswers,
  verifyWacrmFlowCompletionSignature,
  wacrmFlowCompletionSchema,
} from "./wacrm-flow-completion.server";

const secret = "a-private-bridge-secret-with-at-least-32-bytes";
const body = JSON.stringify({
  version: 1,
  flow_run_id: "a2df8802-2d65-4a2e-b8ef-5164f4e5fc0f",
  flow_id: "c5a0f68e-2852-4721-aaeb-067e8e37679c",
  wacrm_contact_id: "0b4d2a37-2c63-4fc6-b3c9-3d60c8a3b048",
  flow_name: "Holiday enquiry",
  completed_at: "2026-10-04T04:30:00.000Z",
  contact: { name: "A Traveller", email: null, phone: "+919876543210" },
  destination: {
    id: "f2f01530-6aeb-4424-b8e9-1b88b6d96927",
    name: "Goa",
    scope: "domestic",
    assignment_status: "assigned",
  },
  answers: { destination: "Goa", adults: "2" },
});
const timestamp = "1791088200";
const signature = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");

describe("WACRM flow completion request", () => {
  it("normalizes legacy raw date and budget answers before saving", () => {
    expect(
      normalizeWacrmFlowAnswers({
        travel_date: "22-11-2026",
        budget: "100000",
        adults: "3",
      }),
    ).toEqual({
      travel_date: "22-11-2026",
      budget: "100000",
      adults: "3",
      __wacrm_travel_date_iso: "2026-11-22",
      __wacrm_budget_amount: "100000",
      __wacrm_budget_currency: "INR",
    });
  });

  it("preserves explicit currency and rejects invalid values", () => {
    expect(
      normalizeWacrmFlowAnswers({
        travel_date: "31-02-2026",
        budget: "₹1,00,000",
      }),
    ).toEqual({
      travel_date: "31-02-2026",
      budget: "₹1,00,000",
      __wacrm_budget_amount: "100000",
      __wacrm_budget_currency: "INR",
    });
    expect(
      normalizeWacrmFlowAnswers({
        travel_date: "2026-11-22",
        budget: "100000 USD",
      }),
    ).toMatchObject({
      __wacrm_travel_date_iso: "2026-11-22",
      __wacrm_budget_amount: "100000",
      __wacrm_budget_currency: "USD",
    });
  });

  it("accepts a signed, current payload", () => {
    expect(
      verifyWacrmFlowCompletionSignature({
        body,
        timestamp,
        signature,
        secret,
        nowMilliseconds: Number(timestamp) * 1000,
      }),
    ).toBe(true);
  });

  it("ignores surrounding whitespace on the configured bridge secret", () => {
    expect(
      verifyWacrmFlowCompletionSignature({
        body,
        timestamp,
        signature,
        secret: ` \r\n${secret}\r\n `,
        nowMilliseconds: Number(timestamp) * 1000,
      }),
    ).toBe(true);
  });

  it("ignores escaped newline suffixes on the configured bridge secret", () => {
    expect(
      verifyWacrmFlowCompletionSignature({
        body,
        timestamp,
        signature,
        secret: `${secret}\\r\\n`,
        nowMilliseconds: Number(timestamp) * 1000,
      }),
    ).toBe(true);
  });

  it("rejects changed payloads, invalid signatures, and expired timestamps", () => {
    expect(
      verifyWacrmFlowCompletionSignature({
        body: `${body} `,
        timestamp,
        signature,
        secret,
        nowMilliseconds: Number(timestamp) * 1000,
      }),
    ).toBe(false);
    expect(
      verifyWacrmFlowCompletionSignature({
        body,
        timestamp,
        signature: "0".repeat(64),
        secret,
        nowMilliseconds: Number(timestamp) * 1000,
      }),
    ).toBe(false);
    expect(
      verifyWacrmFlowCompletionSignature({
        body,
        timestamp,
        signature,
        secret,
        nowMilliseconds: (Number(timestamp) + 301) * 1000,
      }),
    ).toBe(false);
  });

  it("validates flow details and enforces the answer-field limit", () => {
    const validPayload = JSON.parse(body) as unknown;
    expect(wacrmFlowCompletionSchema.safeParse(validPayload).success).toBe(true);

    if (!validPayload || typeof validPayload !== "object" || !("answers" in validPayload)) {
      throw new Error("Test payload is malformed.");
    }
    expect(
      wacrmFlowCompletionSchema.safeParse({
        ...validPayload,
        destination: {
          id: "not-a-uuid",
          name: "Goa",
          scope: "domestic",
          assignment_status: "assigned",
        },
      }).success,
    ).toBe(false);
    const answers = Object.fromEntries(
      Array.from({ length: 51 }, (_, index) => [`answer_${index}`, "value"]),
    );
    expect(wacrmFlowCompletionSchema.safeParse({ ...validPayload, answers }).success).toBe(false);
  });
});
