import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { cleanEnvironmentValue } from "./environment-value";

export const wacrmFlowCompletionSchema = z.object({
  version: z.literal(1),
  flow_run_id: z.string().uuid(),
  flow_id: z.string().uuid(),
  wacrm_contact_id: z.string().uuid(),
  wacrm_conversation_id: z.string().uuid().nullable().optional(),
  flow_name: z.string().trim().min(1).max(200),
  completed_at: z.string().datetime(),
  is_partial: z.boolean().optional(),
  handoff_requested: z.boolean().optional(),
  contact: z.object({
    name: z.string().trim().max(200).nullable(),
    email: z.string().trim().email().max(254).nullable(),
    phone: z.string().trim().min(7).max(32).nullable(),
  }),
  destination: z
    .object({
      id: z.string().uuid(),
      name: z.string().trim().min(1).max(200),
      scope: z.enum(["domestic", "international"]),
      assignment_status: z.enum(["assigned", "unassigned", "ambiguous"]),
      assigned_employee_id: z.string().uuid().nullable().optional(),
    })
    .nullable()
    .optional(),
  answers: z.record(z.unknown()).refine((answers) => Object.keys(answers).length <= 50),
});

export const WACRM_FLOW_COMPLETION_MAX_BODY_BYTES = 64 * 1024;

export function normalizeWacrmFlowAnswers(input: Record<string, unknown>): Record<string, unknown> {
  const answers = { ...input };
  const travelDate =
    typeof answers["travel_date"] === "string" ? normalizeTravelDate(answers["travel_date"]) : null;
  const normalizedTravelDate =
    travelDate ??
    (typeof answers["__wacrm_travel_date_iso"] === "string"
      ? normalizeTravelDate(answers["__wacrm_travel_date_iso"])
      : null);
  if (normalizedTravelDate) {
    answers["__wacrm_travel_date_iso"] = normalizedTravelDate;
  } else {
    delete answers["__wacrm_travel_date_iso"];
  }

  const rawBudget =
    typeof answers["budget"] === "string" || typeof answers["budget"] === "number"
      ? String(answers["budget"])
      : null;
  const normalizedBudget =
    normalizeBudget(rawBudget) ?? normalizeBudget(answers["__wacrm_budget_amount"]);
  if (normalizedBudget) {
    const mappedCurrency = currencyCode(answers["__wacrm_budget_currency"]);
    answers["__wacrm_budget_amount"] = normalizedBudget.amount;
    answers["__wacrm_budget_currency"] = normalizedBudget.currency ?? mappedCurrency ?? "INR";
  } else {
    delete answers["__wacrm_budget_amount"];
    delete answers["__wacrm_budget_currency"];
  }
  return answers;
}

function normalizeTravelDate(value: string): string | null {
  const trimmed = value.trim();
  const iso = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const dmy = trimmed.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  const year = Number(iso?.[1] ?? dmy?.[3]);
  const month = Number(iso?.[2] ?? dmy?.[2]);
  const day = Number(iso?.[3] ?? dmy?.[1]);
  const daysInMonth =
    month === 2
      ? year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
        ? 29
        : 28
      : [4, 6, 9, 11].includes(month)
        ? 30
        : 31;
  if (
    (!iso && !dmy) ||
    year < 1 ||
    year > 9999 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth
  ) {
    return null;
  }
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function normalizeBudget(value: unknown): { amount: string; currency: string | null } | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const match = String(value).match(
    /^\s*(?:(?<prefix>[A-Z]{3}|₹|€|£|\$|Rs\.?)\s*)?(?<amount>[\d,]+(?:\.\d{1,2})?)\s*(?<suffix>[A-Z]{3}|₹|€|£|\$|Rs\.?)?\s*$/i,
  );
  if (!match?.groups) return null;
  const parsedAmount = match.groups["amount"];
  if (!parsedAmount) return null;
  const amount = parsedAmount.replaceAll(",", "");
  if (!/^\d{1,12}(?:\.\d{1,2})?$/.test(amount)) return null;

  const prefix = currencyCode(match.groups["prefix"]);
  const suffix = currencyCode(match.groups["suffix"]);
  if (prefix && suffix && prefix !== suffix) return null;
  return { amount, currency: prefix ?? suffix };
}

function currencyCode(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const normalized = value.trim().toUpperCase();
  if (/^[A-Z]{3}$/.test(normalized)) return normalized;
  if (normalized === "₹" || /^RS\.?$/.test(normalized)) return "INR";
  if (normalized === "€") return "EUR";
  if (normalized === "£") return "GBP";
  if (normalized === "$") return "USD";
  return null;
}

export function verifyWacrmFlowCompletionSignature(input: {
  body: string;
  timestamp: string;
  signature: string;
  secret: string;
  nowMilliseconds?: number;
}): boolean {
  const timestampSeconds = Number(input.timestamp);
  if (
    !/^\d{10}$/.test(input.timestamp) ||
    !Number.isSafeInteger(timestampSeconds) ||
    Math.abs(Math.floor((input.nowMilliseconds ?? Date.now()) / 1000) - timestampSeconds) >
      5 * 60 ||
    !/^[0-9a-f]{64}$/i.test(input.signature)
  ) {
    return false;
  }

  const expected = createHmac("sha256", cleanEnvironmentValue(input.secret) ?? "")
    .update(`${input.timestamp}.${input.body}`)
    .digest();
  const supplied = Buffer.from(input.signature, "hex");
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export async function readWacrmFlowCompletionBody(request: Request): Promise<string | null> {
  const lengthHeader = request.headers.get("content-length");
  if (lengthHeader && Number(lengthHeader) > WACRM_FLOW_COMPLETION_MAX_BODY_BYTES) {
    return null;
  }
  if (!request.body) return "";

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let body = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > WACRM_FLOW_COMPLETION_MAX_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    body += decoder.decode(value, { stream: true });
  }
  return body + decoder.decode();
}
