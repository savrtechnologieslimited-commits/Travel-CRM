export function itineraryBuilderUrl(currentUrl: string, itineraryId: string | null) {
  const url = new URL(currentUrl);
  if (itineraryId) url.searchParams.set("itineraryId", itineraryId);
  else url.searchParams.delete("itineraryId");
  url.searchParams.delete("copyFrom");
  url.searchParams.delete("libraryCopyFrom");
  return `${url.pathname}${url.search}${url.hash}`;
}

export function buildItineraryCopyTitle(title: string) {
  return `${title.trim() || "Untitled itinerary"} (Copy)`;
}

export function itineraryDraftStorageScope(input: { itineraryId?: string | null; leadId?: string | null; draftId?: string | null }) {
  if (input.itineraryId) return `itinerary-${input.itineraryId}`;
  if (input.leadId) return `lead-${input.leadId}`;
  if (input.draftId) return `draft-${input.draftId}`;
  return "new";
}

export function itineraryDraftLatestKey(userId?: string | null) {
  return `savr-itinerary-last-draft:${userId || "anonymous"}`;
}

export function hasPendingItineraryGeneration(
  params: URLSearchParams,
  pendingStorageKeys: ReadonlySet<string>,
) {
  const generationDrafts: Array<[string, string]> = [
    ["aiDraft", "itinerary-ai-draft"],
    ["bookingDraft", "itinerary-booking-draft"],
    ["supplierDraft", "itinerary-supplier-draft"],
  ];
  return generationDrafts.some(
    ([queryKey, storageKey]) => params.has(queryKey) && pendingStorageKeys.has(storageKey),
  );
}

export function itineraryDayTitleWithoutPrefix(title: string) {
  const trimmed = title.trim();
  return trimmed.replace(/^day\s+\d+\s*(?:[-–—:.)]\s*)/i, "").trim() || trimmed;
}

export function buildItineraryLibrarySaveFields(input: { title: string; dayCount: number; status: "DRAFT" | "READY" }) {
  const durationDays = Math.max(0, Math.floor(Number(input.dayCount) || 0));
  return {
    name: input.title.trim() || "Untitled itinerary",
    duration_days: durationDays,
    duration_nights: Math.max(0, durationDays - 1),
    status: input.status,
  } as const;
}

export type ItineraryTermsSnapshot = {
  inclusions: string[];
  exclusions: string[];
  cancellation_info: string;
  terms_conditions: string;
};

export function buildItineraryTermsSnapshot(input?: Partial<ItineraryTermsSnapshot> | null): ItineraryTermsSnapshot {
  const normalizeList = (values: unknown) => Array.isArray(values)
    ? values.filter((value): value is string => typeof value === "string").map((value) => value.trim()).filter(Boolean)
    : [];
  const normalizeText = (value: unknown) => typeof value === "string" ? value.trim() : "";

  return {
    inclusions: normalizeList(input?.inclusions),
    exclusions: normalizeList(input?.exclusions),
    cancellation_info: normalizeText(input?.cancellation_info),
    terms_conditions: normalizeText(input?.terms_conditions),
  };
}

export function itineraryTermsSnapshotsEqual(left: ItineraryTermsSnapshot, right: ItineraryTermsSnapshot) {
  return JSON.stringify(left) === JSON.stringify(right);
}
