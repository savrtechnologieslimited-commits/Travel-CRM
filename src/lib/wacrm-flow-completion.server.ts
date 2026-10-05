import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

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

  const expected = createHmac("sha256", input.secret)
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
