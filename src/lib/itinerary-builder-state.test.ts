import { describe, expect, test } from "bun:test";
import { buildItineraryCopyTitle, buildItineraryLibrarySaveFields, buildItineraryTermsSnapshot, itineraryBuilderUrl, itineraryDayTitleWithoutPrefix, itineraryDraftLatestKey, itineraryDraftStorageScope, itineraryTermsSnapshotsEqual } from "./itinerary-builder-state";

describe("itinerary builder URL state", () => {
  test("stores the itinerary ID while preserving other query parameters", () => {
    expect(itineraryBuilderUrl("https://crm.test/itinerary-builder?leadId=lead-1#days", "itinerary-1"))
      .toBe("/itinerary-builder?leadId=lead-1&itineraryId=itinerary-1#days");
  });

  test("removes the itinerary ID when the builder is reset", () => {
    expect(itineraryBuilderUrl("https://crm.test/itinerary-builder?leadId=lead-1&itineraryId=itinerary-1", null))
      .toBe("/itinerary-builder?leadId=lead-1");
  });

  test("clears copy mode after the assigned itinerary copy has been saved", () => {
    expect(itineraryBuilderUrl("https://crm.test/itinerary-builder?copyFrom=source-1&customerId=customer-1", "copy-1"))
      .toBe("/itinerary-builder?customerId=customer-1&itineraryId=copy-1");
    expect(itineraryBuilderUrl("https://crm.test/itinerary-builder?libraryCopyFrom=source-1", "copy-2"))
      .toBe("/itinerary-builder?itineraryId=copy-2");
  });

  test("adds a copy suffix to a duplicated itinerary title", () => {
    expect(buildItineraryCopyTitle("  Baku Holiday  ")).toBe("Baku Holiday (Copy)");
    expect(buildItineraryCopyTitle("")).toBe("Untitled itinerary (Copy)");
  });

  test("isolates new draft storage by draft ID while retaining itinerary and lead scopes", () => {
    expect(itineraryDraftStorageScope({ draftId: "draft-1" })).toBe("draft-draft-1");
    expect(itineraryDraftStorageScope({ draftId: "draft-2" })).toBe("draft-draft-2");
    expect(itineraryDraftStorageScope({ itineraryId: "itinerary-1", draftId: "draft-1" })).toBe("itinerary-itinerary-1");
    expect(itineraryDraftStorageScope({ leadId: "lead-1", draftId: "draft-1" })).toBe("lead-lead-1");
    expect(itineraryDraftStorageScope({})).toBe("new");
  });

  test("keeps a stable latest-draft key for recovery across revisits", () => {
    expect(itineraryDraftLatestKey("user-1")).toBe("savr-itinerary-last-draft:user-1");
    expect(itineraryDraftLatestKey(null)).toBe("savr-itinerary-last-draft:anonymous");
  });

  test("removes an existing day-number prefix from generated day titles", () => {
    expect(itineraryDayTitleWithoutPrefix("Day 1 – Arrival in Baku")).toBe("Arrival in Baku");
    expect(itineraryDayTitleWithoutPrefix("day 2: Baku City Tour")).toBe("Baku City Tour");
    expect(itineraryDayTitleWithoutPrefix("Gobustan & Mud Volcanoes")).toBe("Gobustan & Mud Volcanoes");
  });

  test("promotes the full itinerary record to READY library status with title and duration metadata", () => {
    expect(buildItineraryLibrarySaveFields({ title: "  Sri Lanka  ", dayCount: 4, status: "READY" })).toEqual({
      name: "Sri Lanka",
      duration_days: 4,
      duration_nights: 3,
      status: "READY",
    });
  });

  test("detects additions, edits, and removals in itinerary terms fields", () => {
    const original = buildItineraryTermsSnapshot({
      inclusions: [" Breakfast "],
      exclusions: ["Flights"],
      cancellation_info: "Cancel 7 days before travel.",
      terms_conditions: "Payment is due before departure.",
    });
    const same = buildItineraryTermsSnapshot({
      inclusions: ["Breakfast"],
      exclusions: ["Flights"],
      cancellation_info: "Cancel 7 days before travel.",
      terms_conditions: "Payment is due before departure.",
    });
    const added = buildItineraryTermsSnapshot({ ...same, inclusions: [...same.inclusions, "Airport transfer"] });
    const removed = buildItineraryTermsSnapshot({ ...same, exclusions: [] });
    const edited = buildItineraryTermsSnapshot({ ...same, terms_conditions: "Full payment is due before departure." });

    expect(itineraryTermsSnapshotsEqual(original, same)).toBe(true);
    expect(itineraryTermsSnapshotsEqual(original, added)).toBe(false);
    expect(itineraryTermsSnapshotsEqual(original, removed)).toBe(false);
    expect(itineraryTermsSnapshotsEqual(original, edited)).toBe(false);
  });
});
