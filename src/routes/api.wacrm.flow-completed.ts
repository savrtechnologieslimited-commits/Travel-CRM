import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json } from "@/integrations/supabase/types";
import {
  readWacrmFlowCompletionBody,
  verifyWacrmFlowCompletionSignature,
  wacrmFlowCompletionSchema,
} from "@/lib/wacrm-flow-completion.server";

async function receiveFlowCompletion(request: Request): Promise<Response> {
  const secret = process.env["WACRM_BRIDGE_SECRET"];
  if (!secret || Buffer.byteLength(secret) < 32) {
    console.error("[wacrm-flow-completed] WACRM_BRIDGE_SECRET is not configured.");
    return Response.json({ error: "Integration is not configured." }, { status: 503 });
  }

  const timestamp = request.headers.get("x-wacrm-timestamp") ?? "";
  const signature = request.headers.get("x-wacrm-signature") ?? "";
  const body = await readWacrmFlowCompletionBody(request);
  if (body === null) {
    return Response.json({ error: "Request body is too large." }, { status: 413 });
  }
  if (
    !verifyWacrmFlowCompletionSignature({
      body,
      timestamp,
      signature,
      secret,
    })
  ) {
    return Response.json({ error: "Request signature is invalid." }, { status: 401 });
  }

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(body);
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  const parsed = wacrmFlowCompletionSchema.safeParse(parsedBody);
  if (!parsed.success) {
    return Response.json({ error: "Completed flow data is invalid." }, { status: 400 });
  }
  const completion = parsed.data;
  if (!completion.contact.phone && !completion.contact.email) {
    return Response.json(
      { error: "A phone number or email is required to link this customer." },
      { status: 422 },
    );
  }

  const { data, error } = await supabaseAdmin.rpc("record_wacrm_flow_enquiry", {
    p_wacrm_run_id: completion.flow_run_id,
    p_wacrm_flow_id: completion.flow_id,
    p_wacrm_contact_id: completion.wacrm_contact_id,
    p_wacrm_conversation_id: completion.wacrm_conversation_id ?? null,
    p_flow_name: completion.flow_name,
    p_contact_name: completion.contact.name,
    p_contact_email: completion.contact.email,
    p_contact_phone: completion.contact.phone,
    p_completed_at: completion.completed_at,
    p_is_partial: completion.is_partial ?? false,
    p_handoff_requested: completion.handoff_requested ?? false,
    p_answers: JSON.parse(JSON.stringify(completion.answers)) as Json,
    p_destination_id: completion.destination?.id ?? null,
    p_assigned_employee_id: completion.destination?.assigned_employee_id ?? null,
  });
  if (error) {
    if (error.code === "23505") {
      return Response.json(
        { error: "The contact's phone and email match different CRM customers." },
        { status: 409 },
      );
    }
    console.error("[wacrm-flow-completed] CRM write failed:", {
      code: error.code,
      message: error.message,
    });
    return Response.json({ error: "The completed flow could not be saved." }, { status: 500 });
  }

  const result = data?.[0];
  if (!result) {
    console.error("[wacrm-flow-completed] CRM procedure returned no result.");
    return Response.json({ error: "The completed flow could not be saved." }, { status: 500 });
  }
  return Response.json({
    customer_id: result.customer_id,
    requirement_id: result.requirement_id,
    lead_id: result.lead_id,
    enquiry_id: result.enquiry_id,
    enquiry_number: result.enquiry_number,
    created_customer: result.created_customer,
  });
}

export const Route = createFileRoute("/api/wacrm/flow-completed")({
  server: {
    handlers: {
      POST: ({ request }) => receiveFlowCompletion(request),
    },
  },
});
