import { describe, expect, test } from "bun:test";
import {
  determineAssignmentOutcome,
  resolveDestinationText,
  resolveDestinationAssignment,
  type DestinationAssignmentRecord,
  type DestinationCatalogRow,
  type LeadLikeRow,
  type WhatsAppConversationRow,
} from "./destination-assignment";

describe("destination resolution", () => {
  const destinations: DestinationCatalogRow[] = [
    { id: "d-thailand", name: "Thailand" },
    { id: "d-bali", name: "Bali" },
    { id: "d-maldives", name: "Maldives" },
  ];

  test("exact destination", () => {
    expect(resolveDestinationText("Thailand", destinations)).toEqual({
      status: "resolved",
      destination_id: "d-thailand",
      candidate_ids: ["d-thailand"],
    });
  });

  test("destination with normal case variation", () => {
    expect(resolveDestinationText("thailand", destinations)).toEqual({
      status: "resolved",
      destination_id: "d-thailand",
      candidate_ids: ["d-thailand"],
    });
  });

  test("unknown destination", () => {
    expect(resolveDestinationText("Atlantis", destinations)).toEqual({
      status: "unresolved",
      destination_id: null,
      candidate_ids: [],
    });
  });

  test("ambiguous destination when multiple plausible matches exist", () => {
    const catalog: DestinationCatalogRow[] = [
      { id: "d-1", name: "Bali" },
      { id: "d-2", name: "Bali Beach" },
    ];
    expect(resolveDestinationText("Bali", catalog)).toEqual({
      status: "ambiguous",
      destination_id: null,
      candidate_ids: ["d-1", "d-2"],
    });
  });
});

describe("destination assignment outcome", () => {
  const assignments: DestinationAssignmentRecord[] = [
    { id: "a-1", destination_id: "d-thailand", employee_id: "e-1", is_active: true },
    { id: "a-2", destination_id: "d-thailand", employee_id: "e-2", is_active: true },
    { id: "a-3", destination_id: "d-maldives", employee_id: "e-3", is_active: false },
  ];

  test("destination exists but has no employee assignment", () => {
    expect(determineAssignmentOutcome("d-bali", assignments)).toBe("UNASSIGNED");
  });

  test("destination has one active employee assignment", () => {
    expect(determineAssignmentOutcome("d-maldives", assignments)).toBe("UNASSIGNED");
    expect(determineAssignmentOutcome("d-thailand", assignments)).toBe("ASSIGNED");
  });

  test("destination has multiple active employee assignments", () => {
    expect(determineAssignmentOutcome("d-thailand", assignments)).toBe("ASSIGNED");
  });

  test("HUMAN_ACTIVE conversation is protected from auto reassign", () => {
    const conversation: WhatsAppConversationRow = {
      id: "c-1",
      assigned_employee_id: "human-employee",
      conversation_mode: "HUMAN_ACTIVE",
      lead_id: "l-1",
      enquiry_id: null,
    };

    const lead: LeadLikeRow = {
      id: "l-1",
      assigned_to: "human-employee",
      destination_id: null,
    };

    const result = resolveDestinationAssignment({
      conversation,
      lead,
      targetDestinationText: "Thailand",
      destinations: [
        { id: "d-thailand", name: "Thailand" },
        { id: "d-bali", name: "Bali" },
      ],
      activeAssignments: [{ id: "a-1", destination_id: "d-thailand", employee_id: "e-1", is_active: true }],
      fallbackEmployeeId: null,
    });

    expect(result.status).toBe("ASSIGNED");
    expect(result.destination_id).toBe("d-thailand");
    expect(result.assignment_employee_ids).toEqual(["e-1"]);
    expect(result.automatic_update).toBe(false);
  });
});

describe("resolver safety and idempotency", () => {
  const destinations: DestinationCatalogRow[] = [
    { id: "d-thailand", name: "Thailand" },
    { id: "d-bali", name: "Bali" },
  ];

  const assignments: DestinationAssignmentRecord[] = [
    { id: "a-1", destination_id: "d-thailand", employee_id: "e-1", is_active: true },
  ];

  test("running the resolver twice is idempotent", () => {
    const first = resolveDestinationAssignment({
      conversation: {
        id: "c-1",
        assigned_employee_id: null,
        conversation_mode: "AI_ACTIVE",
        lead_id: "l-1",
        enquiry_id: null,
      },
      lead: { id: "l-1", assigned_to: null, destination_id: null },
      targetDestinationText: "Thailand",
      destinations,
      activeAssignments: assignments,
      fallbackEmployeeId: null,
    });

    const second = resolveDestinationAssignment({
      conversation: {
        id: "c-1",
        assigned_employee_id: null,
        conversation_mode: "AI_ACTIVE",
        lead_id: "l-1",
        enquiry_id: null,
      },
      lead: { id: "l-1", assigned_to: "e-1", destination_id: "d-thailand" },
      targetDestinationText: "Thailand",
      destinations,
      activeAssignments: assignments,
      fallbackEmployeeId: null,
    });

    expect(first.status).toBe("ASSIGNED");
    expect(second.status).toBe("ASSIGNED");
    expect(second.destination_id).toBe("d-thailand");
    expect(second.automatic_update).toBe(false);
  });

  test("existing human assignment must not be overwritten", () => {
    const result = resolveDestinationAssignment({
      conversation: {
        id: "c-2",
        assigned_employee_id: "human-e",
        conversation_mode: "AI_ACTIVE",
        lead_id: "l-2",
        enquiry_id: null,
      },
      lead: { id: "l-2", assigned_to: "human-e", destination_id: null },
      targetDestinationText: "Thailand",
      destinations,
      activeAssignments: assignments,
      fallbackEmployeeId: null,
    });

    expect(result.status).toBe("ASSIGNED");
    expect(result.automatic_update).toBe(false);
    expect(result.assignment_employee_ids).toEqual(["e-1"]);
  });

  test("destination unresolved leaves lead unassigned", () => {
    const result = resolveDestinationAssignment({
      conversation: {
        id: "c-3",
        assigned_employee_id: null,
        conversation_mode: "AI_ACTIVE",
        lead_id: "l-3",
        enquiry_id: null,
      },
      lead: { id: "l-3", assigned_to: null, destination_id: null },
      targetDestinationText: "Atlantis",
      destinations,
      activeAssignments: assignments,
      fallbackEmployeeId: null,
    });

    expect(result.status).toBe("DESTINATION_UNRESOLVED");
    expect(result.assignment_employee_ids).toEqual([]);
    expect(result.automatic_update).toBe(false);
  });
});
