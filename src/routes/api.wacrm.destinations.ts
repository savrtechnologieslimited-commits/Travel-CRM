import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { filterAssignmentsToBusinessVisibleUsers } from "@/lib/business-visible-users";
import { getBusinessVisibleEmployeeIds } from "@/lib/business-visible-users.server";
import { cleanEnvironmentValue } from "@/lib/environment-value";
import {
  readWacrmFlowCompletionBody,
  verifyWacrmFlowCompletionSignature,
} from "@/lib/wacrm-flow-completion.server";

const destinationLookupSchema = z.object({
  scope: z.enum(["domestic", "international"]),
});

async function lookupDestinations(request: Request): Promise<Response> {
  const secret = cleanEnvironmentValue(process.env["WACRM_BRIDGE_SECRET"]);
  if (!secret || Buffer.byteLength(secret) < 32) {
    console.error("[wacrm-destinations] WACRM_BRIDGE_SECRET is not configured.");
    return Response.json({ error: "Integration is not configured." }, { status: 503 });
  }

  const body = await readWacrmFlowCompletionBody(request);
  if (body === null) {
    return Response.json({ error: "Request body is too large." }, { status: 413 });
  }
  if (
    !verifyWacrmFlowCompletionSignature({
      body,
      timestamp: request.headers.get("x-wacrm-timestamp") ?? "",
      signature: request.headers.get("x-wacrm-signature") ?? "",
      secret,
    })
  ) {
    return Response.json({ error: "Request signature is invalid." }, { status: 401 });
  }

  let requestBody: unknown;
  try {
    requestBody = JSON.parse(body);
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  const parsed = destinationLookupSchema.safeParse(requestBody);
  if (!parsed.success) {
    return Response.json({ error: "Destination lookup scope is invalid." }, { status: 400 });
  }

  const { data: destinations, error: destinationError } = await supabaseAdmin
    .from("destinations")
    .select("id,name,scope")
    .eq("is_active", true)
    .eq("scope", parsed.data.scope)
    .order("name", { ascending: true });
  if (destinationError) {
    console.error("[wacrm-destinations] Destination lookup failed:", destinationError.message);
    return Response.json({ error: "Destinations could not be loaded." }, { status: 500 });
  }

  if (!destinations?.length) {
    return Response.json({ version: 1, scope: parsed.data.scope, destinations: [] });
  }

  const destinationIds = destinations.map(({ id }) => id);
  const [
    { data: assignments, error: assignmentError },
    { data: itineraries, error: itineraryError },
  ] = await Promise.all([
    supabaseAdmin
      .from("destination_employee_assignments")
      .select("destination_id,employee_id")
      .eq("is_active", true)
      .in("destination_id", destinationIds),
    supabaseAdmin
      .from("itineraries")
      .select("id,destination_id,document_name,document_path,document_mime_type,created_at")
      .eq("is_active", true)
      .not("document_path", "is", null)
      .in("destination_id", destinationIds)
      .order("created_at", { ascending: false }),
  ]);

  if (assignmentError || itineraryError) {
    console.error("[wacrm-destinations] Destination metadata lookup failed:", {
      assignments: assignmentError?.message,
      itineraries: itineraryError?.message,
    });
    return Response.json({ error: "Destination details could not be loaded." }, { status: 500 });
  }

  const employeeIds = [...new Set((assignments ?? []).map(({ employee_id }) => employee_id))];
  let businessVisibleEmployeeIds: Set<string>;
  try {
    businessVisibleEmployeeIds = await getBusinessVisibleEmployeeIds(employeeIds);
  } catch (error) {
    console.error("[wacrm-destinations] Employee assignments could not be verified:", {
      message: error instanceof Error ? error.message : String(error),
    });
    return Response.json(
      { error: "Destination assignments could not be verified." },
      { status: 500 },
    );
  }
  const businessVisibleAssignments = filterAssignmentsToBusinessVisibleUsers(
    assignments ?? [],
    businessVisibleEmployeeIds,
  );
  const employeesByDestination = new Map<string, Set<string>>();
  for (const assignment of businessVisibleAssignments) {
    const employeeIds = employeesByDestination.get(assignment.destination_id) ?? new Set<string>();
    employeeIds.add(assignment.employee_id);
    employeesByDestination.set(assignment.destination_id, employeeIds);
  }

  const latestPdfByDestination = new Map<string, NonNullable<typeof itineraries>[number]>();
  for (const itinerary of itineraries ?? []) {
    const isPdf =
      itinerary.document_mime_type === "application/pdf" ||
      /\.pdf$/i.test(itinerary.document_name ?? itinerary.document_path ?? "");
    if (
      itinerary.destination_id &&
      isPdf &&
      !latestPdfByDestination.has(itinerary.destination_id)
    ) {
      latestPdfByDestination.set(itinerary.destination_id, itinerary);
    }
  }

  const results = [];
  for (const destination of destinations) {
    const employeeIdsForDestination = employeesByDestination.get(destination.id);
    const employeeCount = employeeIdsForDestination?.size ?? 0;
    if (employeeCount !== 1) continue;
    const assignedEmployeeId = employeeIdsForDestination?.values().next().value;
    if (!assignedEmployeeId) continue;

    const itinerary = latestPdfByDestination.get(destination.id);
    let pdf: { name: string; url: string } | null = null;
    if (itinerary?.document_path) {
      const { data, error } = await supabaseAdmin.storage
        .from("itineraries")
        .createSignedUrl(itinerary.document_path, 300);
      if (error) {
        console.error("[wacrm-destinations] Could not sign destination PDF:", {
          destinationId: destination.id,
          error: error.message,
        });
        return Response.json(
          { error: "A destination PDF could not be prepared." },
          { status: 500 },
        );
      }
      pdf = {
        name: itinerary.document_name || "Destination information.pdf",
        url: data.signedUrl,
      };
    }

    results.push({
      id: destination.id,
      name: destination.name,
      scope: destination.scope,
      pdf,
      assigned_employee_id: assignedEmployeeId,
      assignment_status: "assigned",
    });
  }

  return Response.json({ version: 1, scope: parsed.data.scope, destinations: results });
}

export const Route = createFileRoute("/api/wacrm/destinations")({
  server: {
    handlers: {
      POST: ({ request }) => lookupDestinations(request),
    },
  },
});
