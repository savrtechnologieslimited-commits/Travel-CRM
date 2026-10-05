import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ImagePlus, LoaderCircle, MapPin, Star, Trash2, Upload, X } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { lookupGoogleActivityPlacesFn, type GoogleActivityPhoto, type GoogleActivityPlace } from "@/lib/google-places-activities";
import { ACTIVITY_TYPES } from "@/lib/activity";
import { Button } from "@/components/ui/button";
import { InrEquivalent, useCurrencyRates } from "@/components/currency-converter";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { convertToInr, POPULAR_CURRENCIES, type CurrencyCode } from "@/lib/currency-converter";
import {
  addActivityLibraryPhoto,
  deleteActivityLibraryPhoto,
  listActivityLibraryPhotos,
  reorderActivityLibraryPhotos,
  replaceActivityLibraryPhoto,
  updateActivityLibraryPhoto,
  type ActivityLibraryPhoto,
} from "@/lib/activity-photo-library";

type ActivityMetadata = Record<string, unknown>;
type ActivityItem = {
  id?: string;
  title: string;
  description: string;
  customer_facing_info?: string | null;
  location?: string | null;
  duration?: string | null;
  departure_time?: string | null;
  adults?: number | null;
  children?: number | null;
  notes?: string | null;
  metadata?: ActivityMetadata;
};

function metadataString(metadata: ActivityMetadata, key: string) {
  const value = metadata[key];
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function readableError(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  if (error && typeof error === "object") {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
    const data = (error as { data?: { message?: unknown } }).data;
    if (typeof data?.message === "string" && data.message.trim()) return data.message;
  }
  return fallback;
}

function activityTypeFromGoogleTypes(types: string[]) {
  if (types.some((type) => /museum|church|temple|mosque|historical|cultural/i.test(type))) return "Cultural Experience";
  if (types.some((type) => /amusement|aquarium|zoo|park|tourist_attraction/i.test(type))) return "Attraction";
  return "Sightseeing";
}

export function ItineraryActivityEditor({
  item,
  dayDate,
  tripStartDate,
  tripEndDate,
  destination,
  adults,
  children,
  saving,
  onChange,
  onDelete,
  onSave,
}: {
  item: ActivityItem;
  dayDate: string;
  tripStartDate: string;
  tripEndDate: string;
  destination: string;
  adults: number;
  children: number;
  saving: boolean;
  onChange: (updates: Partial<ActivityItem>) => void;
  onDelete: () => void;
  onSave: (activityTitle?: string) => Promise<void>;
}) {
  const lookup = useServerFn(lookupGoogleActivityPlacesFn);
  const { rates } = useCurrencyRates();
  const [query, setQuery] = useState(item.title === "Activity" || item.title === "Sightseeing" ? "" : item.title);
  const [results, setResults] = useState<GoogleActivityPlace[]>([]);
  const [searching, setSearching] = useState(false);
  const [loadingPlaceId, setLoadingPlaceId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [libraryPhotos, setLibraryPhotos] = useState<ActivityLibraryPhoto[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryBusy, setLibraryBusy] = useState(false);
  const [googlePhoto, setGooglePhoto] = useState<GoogleActivityPhoto | null>(null);
  const [googlePhotoLoading, setGooglePhotoLoading] = useState(false);
  const [googlePhotoError, setGooglePhotoError] = useState("");
  const searchSequence = useRef(0);
  const photoRequestSequence = useRef(0);
  const metadata = item.metadata ?? {};
  const googlePlaceId = metadataString(metadata, "google_place_id");

  async function loadGooglePhoto(placeId: string) {
    const sequence = ++photoRequestSequence.current;
    setGooglePhoto(null);
    setGooglePhotoError("");
    if (!placeId) return;
    setGooglePhotoLoading(true);
    try {
      const result = await lookup({ data: { action: "photo", placeId } });
      if (sequence !== photoRequestSequence.current) return;
      if (result && !Array.isArray(result) && "photoUri" in result) setGooglePhoto(result as GoogleActivityPhoto);
    } catch (photoError) {
      if (sequence === photoRequestSequence.current) {
        setGooglePhotoError(readableError(photoError, "Could not load a Google Maps photo."));
      }
    } finally {
      if (sequence === photoRequestSequence.current) setGooglePhotoLoading(false);
    }
  }

  async function reloadLibraryPhotos(placeId = googlePlaceId) {
    if (!placeId) {
      setLibraryPhotos([]);
      return;
    }
    setLibraryLoading(true);
    try {
      const savedPhotos = await listActivityLibraryPhotos(placeId);
      setLibraryPhotos(savedPhotos);
      if (savedPhotos.length > 0) {
        photoRequestSequence.current += 1;
        setGooglePhoto(null);
        setGooglePhotoError("");
      } else {
        await loadGooglePhoto(placeId);
      }
    } catch (loadError) {
      setError(readableError(loadError, "Could not load saved activity photos."));
    } finally {
      setLibraryLoading(false);
    }
  }

  useEffect(() => {
    void reloadLibraryPhotos(googlePlaceId);
  }, [googlePlaceId]);

  function setMetadata(key: string, value: string | number) {
    onChange({ metadata: { ...metadata, [key]: value } });
  }

  function setActivityCost(key: "activity_cost_adult" | "activity_cost_child" | "activity_cost_total", value: number) {
    const next: ActivityMetadata = { ...metadata, [key]: value };
    const currency = typeof next["activity_cost_currency"] === "string" ? next["activity_cost_currency"] as string : "INR";
    const code = (POPULAR_CURRENCIES as readonly string[]).includes(currency) ? currency as CurrencyCode : null;
    for (const suffix of ["adult", "child", "total"] as const) {
      const amount = Number(next[`activity_cost_${suffix}`]) || 0;
      next[`activity_cost_${suffix}_inr`] = amount && code ? rates ? convertToInr(amount, code, rates.rates) : code === "INR" ? amount : null : 0;
    }
    const converted = Number(next[`${key}_inr`]);
    next["activity_cost_exchange_rate"] = value > 0 && Number.isFinite(converted) ? converted / value : 1;
    next["activity_cost_exchange_rate_updated_at"] = rates?.updatedAt ?? null;
    onChange({ metadata: next });
  }

  function setActivityCostCurrency(currency: string) {
    const next: ActivityMetadata = { ...metadata, activity_cost_currency: currency };
    const code = currency as CurrencyCode;
    for (const suffix of ["adult", "child", "total"] as const) {
      const amount = Number(next[`activity_cost_${suffix}`]) || 0;
      next[`activity_cost_${suffix}_inr`] = amount ? rates ? convertToInr(amount, code, rates.rates) : code === "INR" ? amount : null : 0;
    }
    next["activity_cost_exchange_rate_updated_at"] = rates?.updatedAt ?? null;
    onChange({ metadata: next });
  }

  async function searchActivities(searchText = query) {
    const trimmedQuery = searchText.trim();
    if (trimmedQuery.length < 3) {
      setResults([]);
      setSearching(false);
      setError("");
      return;
    }
    const requestSequence = ++searchSequence.current;
    setSearching(true);
    setError("");
    try {
      const places = await lookup({ data: { action: "search", query: trimmedQuery, destination } });
      if (requestSequence !== searchSequence.current) return;
      setResults(Array.isArray(places) ? places : []);
      if (!Array.isArray(places) || places.length === 0) setError("No matching activities found. Try another activity name or search manually.");
    } catch (searchError) {
      if (requestSequence !== searchSequence.current) return;
      setResults([]);
      setError(readableError(searchError, "Google activity search failed."));
    } finally {
      if (requestSequence === searchSequence.current) setSearching(false);
    }
  }

  useEffect(() => {
    if (googlePlaceId && query.trim() === item.title.trim()) {
      setResults([]);
      setSearching(false);
      setError("");
      return;
    }
    const timer = window.setTimeout(() => void searchActivities(), 700);
    return () => window.clearTimeout(timer);
  }, [query, destination, googlePlaceId, item.title]);

  async function choosePlace(place: GoogleActivityPlace) {
    setLoadingPlaceId(place.id);
    setError("");
    try {
      const detail = await lookup({ data: { action: "details", placeId: place.id } });
      if (Array.isArray(detail)) throw new Error("Google Places returned an invalid activity detail.");
      const selected = detail as GoogleActivityPlace;
      onChange({
        title: selected.name || place.name,
        location: selected.address || place.address,
        description: selected.description || item.description,
        customer_facing_info: selected.description || item.customer_facing_info || "",
        metadata: {
          ...metadata,
          google_place_id: selected.id,
          google_maps_url: selected.mapsUrl ?? "",
          google_website: selected.website ?? "",
          google_phone: selected.phone,
          google_rating: selected.rating ?? "",
          google_opening_hours: selected.openingHours.join("\n"),
          google_types: selected.types.join(", "),
          google_photo_url: "",
          activity_type: activityTypeFromGoogleTypes(selected.types),
          activity_date: dayDate,
        },
      });
      setQuery(selected.name || place.name);
      setResults([]);
    } catch (detailError) {
      setError(readableError(detailError, "Could not load selected Google activity details."));
    } finally {
      setLoadingPlaceId(null);
    }
  }

  function editableText(key: string, value: string) {
    return {
      value,
      onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setMetadata(key, event.target.value),
    };
  }

  async function uploadActivityPhoto(file: File | undefined) {
    if (!file) return;
    if (!googlePlaceId) {
      setError("Select a Google-matched activity before adding photos to its shared library.");
      return;
    }
    setLibraryBusy(true);
    setError("");
    try {
      const photo = await addActivityLibraryPhoto({ placeId: googlePlaceId, placeName: item.title, placeAddress: item.location ?? "", file });
      setLibraryPhotos((current) => [...current, photo]);
      photoRequestSequence.current += 1;
      setGooglePhoto(null);
    } catch (uploadError) {
      setError(readableError(uploadError, "Could not add the activity photo."));
    } finally {
      setLibraryBusy(false);
    }
  }

  async function replaceLibraryPhoto(photo: ActivityLibraryPhoto, file: File | undefined) {
    if (!file) return;
    setLibraryBusy(true);
    setError("");
    try {
      const replaced = await replaceActivityLibraryPhoto(photo, file);
      setLibraryPhotos((current) => current.map((entry) => entry.id === photo.id ? replaced : entry));
    } catch (replaceError) {
      setError(readableError(replaceError, "Could not replace the activity photo."));
    } finally {
      setLibraryBusy(false);
    }
  }

  async function deleteLibraryPhoto(photo: ActivityLibraryPhoto) {
    setLibraryBusy(true);
    setError("");
    try {
      await deleteActivityLibraryPhoto(photo);
      const remainingPhotos = libraryPhotos.filter((entry) => entry.id !== photo.id);
      setLibraryPhotos(remainingPhotos);
      if (remainingPhotos.length === 0) await loadGooglePhoto(googlePlaceId);
    } catch (deleteError) {
      setError(readableError(deleteError, "Could not delete the activity photo."));
    } finally {
      setLibraryBusy(false);
    }
  }

  async function moveLibraryPhoto(index: number, direction: -1 | 1) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= libraryPhotos.length) return;
    const next = [...libraryPhotos];
    [next[index], next[targetIndex]] = [next[targetIndex]!, next[index]!];
    const ordered = next.map((photo, order) => ({ ...photo, display_order: order + 1 }));
    setLibraryPhotos(ordered);
    try {
      await reorderActivityLibraryPhotos(ordered);
    } catch (orderError) {
      setError(readableError(orderError, "Could not save photo order."));
      void reloadLibraryPhotos();
    }
  }

  async function savePhotoDetails(photo: ActivityLibraryPhoto) {
    try {
      await updateActivityLibraryPhoto(photo);
    } catch (updateError) {
      setError(readableError(updateError, "Could not save photo details."));
    }
  }

  const costAdult = Number(metadataString(metadata, "activity_cost_adult")) || 0;
  const costChild = Number(metadataString(metadata, "activity_cost_child")) || 0;
  const totalValue = metadataString(metadata, "activity_cost_total");
  const calculatedTotal = costAdult * adults + costChild * children;
  const photoUrl = libraryPhotos[0]?.display_url ?? googlePhoto?.photoUri ?? "";

  return (
    <div className="space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-4" data-builder-type="ACTIVITY">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-slate-900">Activity Details</h3>
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" disabled={saving || !item.departure_time || !item.arrival_time} onClick={() => void onSave(item.title)}>{saving ? "Saving…" : "Save Activity"}</Button>
          <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${item.title}`} onClick={onDelete} className="text-rose-600 hover:text-rose-700">
            <X className="size-4" />
          </Button>
        </div>
      </div>

      <form onSubmit={(event) => { event.preventDefault(); void searchActivities(); }} className="space-y-2">
        <Label htmlFor={`activity-search-${item.id ?? "new"}`}>Search Activity / Activity Title</Label>
        <div className="flex gap-2">
          <Input
            id={`activity-search-${item.id ?? "new"}`}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={destination ? `Search activities in ${destination}` : "Search Google activities"}
          />
          {searching && <LoaderCircle className="mt-2 size-4 shrink-0 animate-spin text-slate-500" aria-label="Loading activity matches" />}
        </div>
      </form>

      {results.length > 0 && (
        <div className="max-h-56 overflow-y-auto rounded-md border bg-white" role="listbox" aria-label="Google activity search results">
          {results.map((place) => (
            <button
              type="button"
              key={place.id}
              className="flex w-full items-start justify-between gap-3 border-b p-3 text-left last:border-b-0 hover:bg-slate-50 disabled:opacity-60"
              onClick={() => void choosePlace(place)}
              disabled={loadingPlaceId !== null}
              role="option"
              aria-selected={false}
            >
              <span>
                <span className="block font-medium text-slate-900">{place.name}</span>
                <span className="mt-1 flex items-center gap-1 text-xs text-slate-500"><MapPin className="size-3" />{place.address || destination || "Location not listed"}</span>
              </span>
              <span className="flex shrink-0 items-center gap-1 text-xs text-slate-600">
                {loadingPlaceId === place.id ? <LoaderCircle className="size-4 animate-spin" /> : <><Star className="size-3 text-amber-500" />{place.rating ?? "—"}</>}
              </span>
            </button>
          ))}
        </div>
      )}
      {results.length > 0 && <p className="text-right text-xs font-medium text-slate-500">Powered by Google</p>}
      {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}

      <div className="space-y-2">
        <Label>Shared Activity Photo Library</Label>
        {googlePlaceId ? (
          <div className="space-y-3 rounded-md border bg-white p-3">
            <p className="text-xs text-slate-500">Saved photos are licensed/owned uploads. If none are saved, a current Google Maps photo is fetched for preview; only the Place ID is retained so it can be fetched again later.</p>
            {libraryLoading && <p className="text-sm text-slate-500">Loading saved photos…</p>}
            {!libraryLoading && libraryPhotos.map((photo, index) => (
              <div key={photo.id} className="grid gap-2 rounded-md border p-2 sm:grid-cols-[160px_1fr]">
                <img src={photo.display_url} alt={photo.alt_text || photo.caption || item.title} className="h-28 w-full rounded object-cover" />
                <div className="space-y-2">
                  <Input value={photo.caption ?? ""} placeholder="Caption" onChange={(event) => setLibraryPhotos((current) => current.map((entry) => entry.id === photo.id ? { ...entry, caption: event.target.value } : entry))} onBlur={() => void savePhotoDetails(libraryPhotos[index]!)} />
                  <Input value={photo.alt_text ?? ""} placeholder="Alt text" onChange={(event) => setLibraryPhotos((current) => current.map((entry) => entry.id === photo.id ? { ...entry, alt_text: event.target.value } : entry))} onBlur={() => void savePhotoDetails(libraryPhotos[index]!)} />
                  <div className="flex gap-2">
                    <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border px-2 py-1 text-xs">
                      <Upload className="size-3.5" /> Replace
                      <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" className="sr-only" disabled={libraryBusy} onChange={(event) => void replaceLibraryPhoto(photo, event.target.files?.[0])} />
                    </label>
                    <Button type="button" variant="outline" size="icon" className="size-8" disabled={libraryBusy || index === 0} onClick={() => void moveLibraryPhoto(index, -1)} aria-label="Move photo up"><ArrowUp className="size-4" /></Button>
                    <Button type="button" variant="outline" size="icon" className="size-8" disabled={libraryBusy || index === libraryPhotos.length - 1} onClick={() => void moveLibraryPhoto(index, 1)} aria-label="Move photo down"><ArrowDown className="size-4" /></Button>
                    <Button type="button" variant="ghost" size="icon" className="size-8 text-rose-600" disabled={libraryBusy} onClick={() => void deleteLibraryPhoto(photo)} aria-label="Delete photo"><Trash2 className="size-4" /></Button>
                  </div>
                </div>
              </div>
            ))}
            {!libraryLoading && libraryPhotos.length === 0 && googlePhotoLoading && <p className="text-sm text-slate-500">Fetching a current Google Maps photo…</p>}
            {!libraryLoading && libraryPhotos.length === 0 && googlePhoto && (
              <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-2">
                <img src={googlePhoto.photoUri} alt={item.title || "Google Maps activity photo"} className="h-56 w-full rounded object-cover" />
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                  <span>
                    {googlePhoto.authorAttributions.length > 0
                      ? googlePhoto.authorAttributions.map((author, index) => <span key={`${author.displayName}-${index}`} className="mr-2 inline-flex items-center gap-1">{author.photoUri && <img src={author.photoUri} alt="" className="size-5 rounded-full" />}{author.uri ? <a href={author.uri} target="_blank" rel="noreferrer noopener" className="underline">Photo by {author.displayName}</a> : `Photo by ${author.displayName}`}</span>)
                      : "Google Maps photo"}
                  </span>
                  {googlePhoto.googleMapsUri && <a href={googlePhoto.googleMapsUri} target="_blank" rel="noreferrer noopener" className="font-medium underline">View on Google Maps</a>}
                </div>
              </div>
            )}
            {!libraryLoading && libraryPhotos.length === 0 && googlePhotoError && <div className="flex items-center justify-between gap-2"><p className="text-xs text-amber-800">{googlePhotoError}</p><Button type="button" variant="outline" size="sm" onClick={() => void loadGooglePhoto(googlePlaceId)}>Try again</Button></div>}
            {!libraryLoading && libraryPhotos.length === 0 && !googlePhoto && !googlePhotoLoading && <p className="text-sm text-slate-500">No Google Maps photo is available for this activity. You can upload a licensed or owned photo below.</p>}
            <label className="flex h-16 cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed text-sm text-slate-600 hover:border-slate-400">
              {libraryBusy ? <LoaderCircle className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
              Add licensed/owned photo
              <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" className="sr-only" disabled={libraryBusy} onChange={(event) => void uploadActivityPhoto(event.target.files?.[0])} />
            </label>
          </div>
        ) : photoUrl ? (
          <img src={photoUrl} alt={item.title || "Existing activity photo"} className="h-56 w-full rounded-md object-cover" />
        ) : (
          <p className="rounded-md border border-dashed p-4 text-sm text-slate-500">Select a Google-matched activity to manage its reusable photo library.</p>
        )}
      </div>

      <div className="space-y-2">
        <Label>Activity Details</Label>
        <Textarea
          rows={4}
          value={item.customer_facing_info ?? item.description}
          onChange={(event) => onChange({ customer_facing_info: event.target.value, description: event.target.value })}
          placeholder="Activity description"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2"><Label>Location / Address</Label><Input value={item.location ?? ""} onChange={(event) => onChange({ location: event.target.value })} /></div>
        <div className="space-y-2"><Label>Activity date</Label><Input type="date" min={tripStartDate || undefined} max={tripEndDate || undefined} value={metadataString(metadata, "activity_date") || dayDate} onChange={(event) => setMetadata("activity_date", event.target.value)} /></div>
        <div className="space-y-2"><Label>Start Time</Label><Input required type="time" value={item.departure_time ?? ""} onChange={(event) => onChange({ departure_time: event.target.value })} /></div>
        <div className="space-y-2"><Label>End Time</Label><Input required type="time" value={item.arrival_time ?? ""} onChange={(event) => onChange({ arrival_time: event.target.value })} /></div>
        <div className="space-y-2"><Label>Duration</Label><Input value={item.duration ?? ""} onChange={(event) => onChange({ duration: event.target.value })} placeholder="e.g. 3 hours" /></div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-2 sm:col-span-3"><Label>Activity price currency</Label><Select value={metadataString(metadata, "activity_cost_currency") || "INR"} onValueChange={setActivityCostCurrency}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{POPULAR_CURRENCIES.map((currency) => <SelectItem key={currency} value={currency}>{currency}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-2"><Label>Cost per Adult ({adults} Adults)</Label><Input type="number" min="0" step="0.01" value={metadataString(metadata, "activity_cost_adult")} onChange={(event) => setActivityCost("activity_cost_adult", Number(event.target.value) || 0)} /><InrEquivalent amount={metadataString(metadata, "activity_cost_adult")} currency={metadataString(metadata, "activity_cost_currency") || "INR"} /></div>
        <div className="space-y-2"><Label>Cost per Child ({children} Children)</Label><Input type="number" min="0" step="0.01" value={metadataString(metadata, "activity_cost_child")} onChange={(event) => setActivityCost("activity_cost_child", Number(event.target.value) || 0)} /><InrEquivalent amount={metadataString(metadata, "activity_cost_child")} currency={metadataString(metadata, "activity_cost_currency") || "INR"} /></div>
        <div className="space-y-2"><Label>Cost for All</Label><Input type="number" min="0" step="0.01" value={totalValue || String(calculatedTotal)} onChange={(event) => setActivityCost("activity_cost_total", Number(event.target.value) || 0)} /><InrEquivalent amount={totalValue || String(calculatedTotal)} currency={metadataString(metadata, "activity_cost_currency") || "INR"} /></div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2"><Label>Activity Type</Label><Select value={metadataString(metadata, "activity_type") || "Sightseeing"} onValueChange={(value) => setMetadata("activity_type", value)}><SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger><SelectContent>{ACTIVITY_TYPES.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-2"><Label>Rating</Label><Input {...editableText("google_rating", metadataString(metadata, "google_rating"))} type="number" min="0" max="5" step="0.1" /></div>
        <div className="space-y-2"><Label>Website</Label><Input {...editableText("google_website", metadataString(metadata, "google_website"))} type="url" /></div>
        <div className="space-y-2"><Label>Phone</Label><Input {...editableText("google_phone", metadataString(metadata, "google_phone"))} type="tel" /></div>
        <div className="space-y-2 sm:col-span-2"><Label>Opening Hours</Label><Textarea rows={3} {...editableText("google_opening_hours", metadataString(metadata, "google_opening_hours"))} /></div>
        <div className="space-y-2 sm:col-span-2"><Label>Google Maps URL</Label><Input {...editableText("google_maps_url", metadataString(metadata, "google_maps_url"))} type="url" /></div>
        <div className="space-y-2 sm:col-span-2"><Label>Note</Label><Textarea rows={2} value={item.notes ?? ""} onChange={(event) => onChange({ notes: event.target.value })} /></div>
      </div>
      <p className="text-xs text-slate-500">Google supplies place details, ratings, hours and links when available. Time, duration and activity prices must be reviewed and entered manually.</p>
    </div>
  );
}
