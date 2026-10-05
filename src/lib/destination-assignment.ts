export type DestinationCatalogRow = { id: string; name: string; is_active?: boolean };
export type DestinationAssignmentRecord = {
  id: string;
  destination_id: string;
  employee_id: string;
  is_active: boolean;
};

export type WhatsAppConversationRow = {
  id: string;
  assigned_employee_id: string | null;
  conversation_mode: "AI_ACTIVE" | "HUMAN_ACTIVE";
  lead_id: string | null;
  enquiry_id: string | null;
};

export type LeadLikeRow = {
  id: string;
  assigned_to: string | null;
  destination_id: string | null;
};

export type DestinationResolutionStatus = "resolved" | "ambiguous" | "unresolved" | "unknown";
export type AssignmentOutcome =
  | "ASSIGNED"
  | "UNASSIGNED"
  | "DESTINATION_UNRESOLVED"
  | "DESTINATION_AMBIGUOUS";

export type DestinationResolution = {
  status: DestinationResolutionStatus;
  destination_id: string | null;
  candidate_ids: string[];
};

export type DestinationAssignmentResult = {
  status: AssignmentOutcome;
  destination_id: string | null;
  destination_text: string | null;
  assignment_employee_ids: string[];
  automatic_update: boolean;
  reason: string;
};

export function normaliseDestinationName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function resolveDestinationText(
  destinationText: string | null,
  destinations: DestinationCatalogRow[],
): DestinationResolution {
  if (!destinationText || !destinationText.trim()) {
    return { status: "unknown", destination_id: null, candidate_ids: [] };
  }

  const target = normaliseDestinationName(destinationText);
  const activeDestinations = destinations.filter((destination) => destination.is_active !== false);
  const matches = activeDestinations.filter((destination) => {
    const name = normaliseDestinationName(destination.name);
    return name === target || name.includes(target) || target.includes(name);
  });

  if (matches.length === 1) {
    const match = matches[0]!;
    return {
      status: "resolved",
      destination_id: match.id,
      candidate_ids: [match.id],
    };
  }

  if (matches.length > 1) {
    return {
      status: "ambiguous",
      destination_id: null,
      candidate_ids: matches.map((item) => item.id),
    };
  }

  return {
    status: "unresolved",
    destination_id: null,
    candidate_ids: [],
  };
}

export function determineAssignmentOutcome(
  destinationId: string | null,
  activeAssignments: DestinationAssignmentRecord[],
): AssignmentOutcome {
  if (!destinationId) return "DESTINATION_UNRESOLVED";

  const activeForDestination = activeAssignments.filter(
    (assignment) => assignment.destination_id === destinationId && assignment.is_active,
  );

  if (activeForDestination.length > 0) {
    return "ASSIGNED";
  }

  return "UNASSIGNED";
}

export function resolveDestinationAssignment(input: {
  conversation: WhatsAppConversationRow;
  lead: LeadLikeRow | null;
  targetDestinationText: string | null;
  destinations: DestinationCatalogRow[];
  activeAssignments: DestinationAssignmentRecord[];
  fallbackEmployeeId: string | null;
}): DestinationAssignmentResult {
  const destinationResolution = resolveDestinationText(input.targetDestinationText, input.destinations);

  const ignoredFallbackEmployeeId = input.fallbackEmployeeId;

  if (destinationResolution.status === "ambiguous") {
    return {
      status: "DESTINATION_AMBIGUOUS",
      destination_id: null,
      destination_text: input.targetDestinationText,
      assignment_employee_ids: [],
      automatic_update: false,
      reason: `Multiple plausible destinations; explicit fallback ignored: ${ignoredFallbackEmployeeId ?? "none"}`,
    };
  }

  if (destinationResolution.status === "unresolved" || destinationResolution.status === "unknown") {
    return {
      status: "DESTINATION_UNRESOLVED",
      destination_id: null,
      destination_text: input.targetDestinationText,
      assignment_employee_ids: [],
      automatic_update: false,
      reason: "No safe destination match found",
    };
  }

  const destinationId = destinationResolution.destination_id;
  const activeEmployeeIds = input.activeAssignments
    .filter((assignment) => assignment.destination_id === destinationId && assignment.is_active)
    .map((assignment) => assignment.employee_id);

  const hasHumanOwnership = Boolean(
    input.conversation.assigned_employee_id ||
      (input.lead && input.lead.assigned_to) ||
      input.conversation.conversation_mode === "HUMAN_ACTIVE" ||
      ignoredFallbackEmployeeId,
  );

  if (hasHumanOwnership) {
    return {
      status: "ASSIGNED",
      destination_id: destinationId,
      destination_text: input.targetDestinationText,
      assignment_employee_ids: activeEmployeeIds,
      automatic_update: false,
      reason: "Human ownership is active; no automatic reassignment",
    };
  }

  const outcome = determineAssignmentOutcome(destinationId, input.activeAssignments);

  if (outcome === "UNASSIGNED") {
    return {
      status: "UNASSIGNED",
      destination_id: destinationId,
      destination_text: input.targetDestinationText,
      assignment_employee_ids: [],
      automatic_update: false,
      reason: "Destination exists but there are no active employee assignments",
    };
  }

  if (outcome === "DESTINATION_UNRESOLVED") {
    return {
      status: "DESTINATION_UNRESOLVED",
      destination_id: null,
      destination_text: input.targetDestinationText,
      assignment_employee_ids: [],
      automatic_update: false,
      reason: "Destination cannot be safely resolved",
    };
  }

  return {
    status: "ASSIGNED",
    destination_id: destinationId,
    destination_text: input.targetDestinationText,
    assignment_employee_ids: activeEmployeeIds,
    automatic_update: false,
    reason: "One or more active assignments found",
  };
}
