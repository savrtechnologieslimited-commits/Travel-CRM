import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { ItineraryDraft } from "./ai-itinerary-generation.server";

export type ActivityPhotoLibraryRecord = {
  id: string;
  google_place_id: string;
  place_name: string;
  place_address: string;
  storage_path: string;
  caption: string | null;
  alt_text: string | null;
  display_order: number;
};

export type ItineraryLibraryPhotoAttachment = {
  day_index: number;
  item_index: number;
  storage_path: string;
  caption: string | null;
  alt_text: string | null;
  sequence: number;
};

function normalizeMatchValue(value: unknown) {
  return typeof value === "string"
    ? value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
    : "";
}

function placeIdHints(sourceText: string) {
  const hints: Array<{ day_index: number; title: string; place_id: string }> = [];
  const blockPattern = /Day\s+(\d+)\s*\([^)]*\)\s*[—-]\s*(.+?)\s+\[(?:ACTIVITY|SIGHTSEEING)\]([\s\S]*?)(?=\n\n|$)/g;
  for (const match of sourceText.matchAll(blockPattern)) {
    const dayIndex = Number(match[1]) - 1;
    const title = normalizeMatchValue(match[2]);
    const placeId = match[3]?.match(/Google Place ID:\s*([A-Za-z0-9_-]+)/i)?.[1];
    if (Number.isInteger(dayIndex) && dayIndex >= 0 && title && placeId) hints.push({ day_index: dayIndex, title, place_id: placeId });
  }
  return hints;
}

export function matchActivityLibraryPhotos(
  draft: ItineraryDraft,
  records: ActivityPhotoLibraryRecord[],
  sourceText = "",
): ItineraryLibraryPhotoAttachment[] {
  const hints = placeIdHints(sourceText);
  const byPlaceId = new Map<string, ActivityPhotoLibraryRecord[]>();
  for (const record of records) {
    const group = byPlaceId.get(record.google_place_id) ?? [];
    group.push(record);
    byPlaceId.set(record.google_place_id, group);
  }
  for (const group of byPlaceId.values()) group.sort((left, right) => left.display_order - right.display_order || left.id.localeCompare(right.id));

  const attachments: ItineraryLibraryPhotoAttachment[] = [];
  const usedPlaceIds = new Set<string>();
  draft.days.forEach((day, dayIndex) => {
    const dayActivityCount = day.items.filter((item) => item.item_type === "ACTIVITY" || item.item_type === "SIGHTSEEING").length;
    const dayHints = hints.filter((hint) => hint.day_index === dayIndex);
    day.items.forEach((item, itemIndex) => {
    if (item.item_type !== "ACTIVITY" && item.item_type !== "SIGHTSEEING") return;
    const title = normalizeMatchValue(item.title);
    const knownPlaceId = dayHints.find((hint) => hint.title === title)?.place_id
      ?? (dayHints.length === 1 && dayActivityCount === 1 ? dayHints[0]?.place_id : undefined);
    let photoGroup = knownPlaceId ? byPlaceId.get(knownPlaceId) ?? [] : [];
    let matchedPlaceId = knownPlaceId;
    if (!knownPlaceId) {
      const activityName = title;
      const activityAddress = normalizeMatchValue(item.location);
      if (!activityName || !activityAddress) return;
      const exactPlaceIds = [...byPlaceId.entries()].filter(([, group]) =>
        normalizeMatchValue(group[0]?.place_name) === activityName
        && normalizeMatchValue(group[0]?.place_address) === activityAddress,
      ).map(([placeId]) => placeId);
      if (exactPlaceIds.length !== 1) return;
      matchedPlaceId = exactPlaceIds[0]!;
      photoGroup = byPlaceId.get(matchedPlaceId) ?? [];
    }
    if (!matchedPlaceId || usedPlaceIds.has(matchedPlaceId) || attachments.some((photo) => photo.day_index === dayIndex)) return;
    const photo = photoGroup[0];
    if (!photo) return;
    usedPlaceIds.add(matchedPlaceId);
    attachments.push({
      day_index: dayIndex,
      item_index: itemIndex,
      storage_path: photo.storage_path,
      caption: photo.caption,
      alt_text: photo.alt_text,
      sequence: 1,
    });
    });
  });
  return attachments;
}

export async function findItineraryLibraryPhotoAttachments(draft: ItineraryDraft, sourceText = "") {
  const { data, error } = await supabaseAdmin.from("activity_photo_library")
    .select("id,google_place_id,place_name,place_address,storage_path,caption,alt_text,display_order")
    .order("display_order", { ascending: true });
  if (error) {
    console.warn("[Activity photo library] Lookup failed; generating itinerary without library photos.", error);
    return [] as ItineraryLibraryPhotoAttachment[];
  }
  return matchActivityLibraryPhotos(draft, (data ?? []) as ActivityPhotoLibraryRecord[], sourceText);
}
