import { describe, expect, test } from "bun:test";

import {
  ITINERARY_WORKSPACE_COLUMNS,
  PROPOSAL_TABS,
  CREATE_ITINERARY_HREF,
  getDraftDisplayDetails,
  getItineraryDisplayTitle,
  getItineraryTravelDates,
} from "./itinerary-proposals";
import { dedupeItineraryDraftRows, filterUnsavedItineraryDraftRows } from "@/lib/data";

describe("itinerary creation workspace", () => {
  test("Create New opens the original structured builder", () => {
    expect(CREATE_ITINERARY_HREF).toBe("/itinerary-builder");
  });

  test("exposes the reference columns in order", () => {
    expect(ITINERARY_WORKSPACE_COLUMNS).toEqual([
      "Itinerary ID",
      "Destination/Title",
      "Travel Dates",
      "Adults",
      "Children",
      "Created By",
      "Created At",
      "Customer/Lead",
      "Actions",
    ]);
  });

  test("supports package and flight/visa proposal tabs", () => {
    expect(PROPOSAL_TABS.map((tab) => tab.label)).toEqual([
      "Package Itinerary",
      "Flight/Visa/Other Proposal",
    ]);
    expect(PROPOSAL_TABS[0].disabled).toBe(false);
    expect(PROPOSAL_TABS[1].disabled).toBe(false);
  });

  test("maps existing itinerary relationships and dates without inventing values", () => {
    const itinerary = {
      id: "itinerary-1",
      title: "New",
      name: null,
      created_at: "2026-09-17T00:00:00.000Z",
      travel_start_date: "2026-10-01",
      travel_end_date: "2026-10-05",
      destinations: { name: "Kerala" },
      leads: { customer_name: "Shankar" },
    };

    expect(getItineraryDisplayTitle(itinerary)).toBe("Kerala - New");
    expect(getItineraryTravelDates(itinerary)).toContain("-");
    expect(getItineraryDisplayTitle({ ...itinerary, destinations: null, title: null, name: null })).toBe(
      "Untitled itinerary",
    );
    expect(getItineraryTravelDates({ ...itinerary, travel_start_date: null, travel_end_date: null })).toBe("-");
  });

  test("summarizes an autosaved draft for the Drafts list", () => {
    expect(getDraftDisplayDetails({
      id: "draft-1",
      itinerary_id: null,
      lead_id: "lead-1",
      updated_at: "2026-09-28T12:00:00.000Z",
      draft_data: {
        form: { title: "Kerala escape", travel_start_date: "2026-10-01", travel_end_date: "2026-10-03", adults: "2", children: "1" },
        days: [{ day_number: 1 }, { day_number: 2 }, { day_number: 3 }],
      },
    })).toEqual({ title: "Kerala escape", travelDates: "2026-10-01 – 2026-10-03", dayCount: 3, adults: "2", children: "1" });
  });

  test("uses safe defaults when a draft snapshot has no itinerary form yet", () => {
    expect(getDraftDisplayDetails({
      id: "draft-empty",
      itinerary_id: null,
      lead_id: null,
      updated_at: "2026-09-28T12:00:00.000Z",
      draft_data: {},
    })).toMatchObject({ title: "Untitled itinerary draft", travelDates: "Dates not set", dayCount: 0 });
  });

  test("shows only the latest autosave for the same lead or itinerary", () => {
    const drafts = [
      { id: "old", itinerary_id: null, lead_id: "lead-1", updated_at: "2026-09-28T09:00:00.000Z", draft_data: {} },
      { id: "new", itinerary_id: null, lead_id: "lead-1", updated_at: "2026-09-28T10:00:00.000Z", draft_data: {} },
      { id: "independent", itinerary_id: null, lead_id: null, updated_at: "2026-09-28T08:00:00.000Z", draft_data: {} },
    ];

    expect(dedupeItineraryDraftRows(drafts).map((draft) => draft.id)).toEqual(["new", "independent"]);
  });

  test("excludes drafts linked to itineraries already saved in the library", () => {
    const drafts = [
      {
        id: "saved-draft",
        itinerary_id: "saved-itinerary",
        lead_id: null,
        updated_at: "2026-10-04T10:00:00.000Z",
        draft_data: {},
      },
      {
        id: "saved-local-draft",
        itinerary_id: null,
        lead_id: null,
        updated_at: "2026-10-04T10:01:00.000Z",
        draft_data: { itineraryId: "saved-itinerary" },
      },
      {
        id: "unfinished-draft",
        itinerary_id: null,
        lead_id: null,
        updated_at: "2026-10-04T10:02:00.000Z",
        draft_data: {},
      },
    ];

    expect(filterUnsavedItineraryDraftRows(drafts, new Set(["saved-itinerary"])).map((draft) => draft.id))
      .toEqual(["unfinished-draft"]);
  });
});