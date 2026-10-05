import { describe, expect, test } from "bun:test";
import { matchActivityLibraryPhotos, type ActivityPhotoLibraryRecord } from "./activity-photo-library.server";
import type { ItineraryDraft } from "./ai-itinerary-generation.server";

const draft: ItineraryDraft = {
  title: "City break",
  destination: "Lisbon",
  inclusions: [],
  exclusions: [],
  days: [{
    date: "2026-10-01",
    title: "Explore",
    items: [
      { item_type: "ACTIVITY", sequence: 1, title: "Old Town Walk", location: "Rua Augusta, Lisbon, Portugal" },
      { item_type: "SIGHTSEEING", sequence: 2, title: "Different Museum", location: "Other address" },
    ],
  }],
};

const photos: ActivityPhotoLibraryRecord[] = [
  { id: "a1", google_place_id: "place-old-town", place_name: "Old Town Walk", place_address: "Rua Augusta, Lisbon, Portugal", storage_path: "activity-photo-library/place-old-town/a.jpg", caption: "First", alt_text: "First alt", display_order: 1 },
  { id: "a2", google_place_id: "place-old-town", place_name: "Old Town Walk", place_address: "Rua Augusta, Lisbon, Portugal", storage_path: "activity-photo-library/place-old-town/b.jpg", caption: "Second", alt_text: "Second alt", display_order: 2 },
  { id: "a3", google_place_id: "place-old-town", place_name: "Old Town Walk", place_address: "Rua Augusta, Lisbon, Portugal", storage_path: "activity-photo-library/place-old-town/c.jpg", caption: "Third", alt_text: "Third alt", display_order: 3 },
  { id: "b1", google_place_id: "another-place", place_name: "Old Town Walk", place_address: "Rua Augusta, Lisbon, Portugal", storage_path: "activity-photo-library/another-place/a.jpg", caption: null, alt_text: null, display_order: 1 },
];

describe("activity photo library matching", () => {
  test("uses an exact Google Place ID hint first and attaches only one photo for the day", () => {
    const source = "Day 1 (2026-10-01) — Old Town Walk [ACTIVITY]\n  - Google Place ID: place-old-town";
    const attachments = matchActivityLibraryPhotos(draft, photos, source);
    expect(attachments).toEqual([
      { day_index: 0, item_index: 0, storage_path: photos[0]!.storage_path, caption: "First", alt_text: "First alt", sequence: 1 },
    ]);
  });

  test("matches only exact normalized place name and address when no ID is available", () => {
    const uniquePlace = photos.filter((photo) => photo.google_place_id === "place-old-town");
    const attachments = matchActivityLibraryPhotos(draft, uniquePlace);
    expect(attachments.map((photo) => photo.storage_path)).toEqual([photos[0]!.storage_path]);
  });

  test("does not repeat the same place photo on a second itinerary day", () => {
    const twoDays: ItineraryDraft = {
      ...draft,
      days: [draft.days[0]!, { ...draft.days[0]!, title: "Day 2", date: "2026-10-02" }],
    };
    const source = "Day 1 (2026-10-01) — Old Town Walk [ACTIVITY]\n  - Google Place ID: place-old-town\n\nDay 2 (2026-10-02) — Old Town Walk [ACTIVITY]\n  - Google Place ID: place-old-town";
    const attachments = matchActivityLibraryPhotos(twoDays, photos, source);

    expect(attachments).toHaveLength(1);
    expect(attachments[0]?.day_index).toBe(0);
  });

  test("skips a name/address fallback when more than one place matches", () => {
    expect(matchActivityLibraryPhotos(draft, photos)).toEqual([]);
  });

  test("skips when address is absent or does not exactly match", () => {
    const withoutAddress: ItineraryDraft = { ...draft, days: [{ ...draft.days[0]!, items: [{ ...draft.days[0]!.items[0]!, location: undefined }] }] };
    expect(matchActivityLibraryPhotos(withoutAddress, photos.slice(0, 3))).toEqual([]);
  });
});