import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { AlertCircle, Check, Eye, LoaderCircle, Maximize2, Minus, Move, X } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { dedupeItineraryDraftRows, type ItineraryDraftWorkspaceRow } from "@/lib/data";
import { addImagesToItineraryFn } from "@/lib/itinerary-images";
import {
  extractItineraryFromSupplierDocumentFn,
  extractSupplierDocumentTextFn,
} from "@/lib/ai-supplier-itinerary-import";
import {
  createQuickItineraryDraftSnapshot,
  createQuickItineraryPreview,
  QUICK_ITINERARY_REQUEST_EVENT,
  type QuickItineraryRequest,
} from "@/lib/quick-itinerary";
import { buildItineraryPdfHtml } from "@/lib/itinerary-pdf";
import type { SupplierImportResult } from "@/lib/ai-supplier-itinerary-import.server";
import type { ItineraryImageEnrichmentResult } from "@/lib/itinerary-image-service.server";

type QuickImageResult = ItineraryImageEnrichmentResult;

type QuickItineraryPhase =
  "preparing" | "extracting" | "drafting" | "enriching" | "images" | "complete" | "error";

const PHASE_DETAILS: Record<QuickItineraryPhase, { label: string; target: number }> = {
  preparing: { label: "Preparing your itinerary", target: 12 },
  extracting: { label: "Reading the supplied content", target: 34 },
  drafting: { label: "Building itinerary days and hotels", target: 72 },
  enriching: { label: "Preparing hotel summary cards", target: 82 },
  images: { label: "Finding itinerary images", target: 96 },
  complete: { label: "Preview is ready", target: 100 },
  error: { label: "Preparation stopped", target: 100 },
};

export function QuickItineraryManager() {
  const queryClient = useQueryClient();
  const extractText = useServerFn(extractSupplierDocumentTextFn);
  const extractItinerary = useServerFn(extractItineraryFromSupplierDocumentFn);
  const addImages = useServerFn(addImagesToItineraryFn);
  const [phase, setPhase] = useState<QuickItineraryPhase | null>(null);
  const [progress, setProgress] = useState(0);
  const [request, setRequest] = useState<QuickItineraryRequest | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [imageMessage, setImageMessage] = useState("");
  const [previewHtml, setPreviewHtml] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const [dragging, setDragging] = useState(false);
  const serverFunctions = useRef({ extractText, extractItinerary, addImages });
  serverFunctions.current = { extractText, extractItinerary, addImages };
  const cancelPreparationRef = useRef<(() => void) | null>(null);
  const dragOrigin = useRef<{
    pointerX: number;
    pointerY: number;
    left: number;
    top: number;
  } | null>(null);

  useEffect(() => {
    const handleRequest = (event: Event) => {
      const detail = (event as CustomEvent<QuickItineraryRequest>).detail;
      if (!detail || (!detail.sourceText && !(detail.fileName && detail.fileBase64))) {
        toast.error("Enter itinerary details or select a supported document.");
        return;
      }
      setRequest(detail);
      setErrorMessage("");
      setImageMessage("");
      setPreviewHtml("");
      setPreviewOpen(false);
      setMinimized(false);
      setPosition({
        left: Math.max(16, window.innerWidth - 392),
        top: Math.max(16, window.innerHeight - 172),
      });
      setProgress(3);
      setPhase("preparing");
    };
    window.addEventListener(QUICK_ITINERARY_REQUEST_EVENT, handleRequest);
    return () => window.removeEventListener(QUICK_ITINERARY_REQUEST_EVENT, handleRequest);
  }, []);

  useEffect(() => {
    if (!phase || phase === "complete" || phase === "error") return;
    const target = PHASE_DETAILS[phase].target;
    const timer = window.setInterval(() => {
      setProgress((current) => Math.min(target - 1, current + 1));
    }, 350);
    return () => window.clearInterval(timer);
  }, [phase]);

  useEffect(() => {
    if (!request) return;
    let cancelled = false;
    const cancel = () => {
      cancelled = true;
    };
    cancelPreparationRef.current = cancel;
    async function prepareItinerary() {
      try {
        let sourceText = request?.sourceText?.trim() ?? "";
        setPhase("extracting");
        if (request?.fileName && request.fileBase64) {
          const extracted = await serverFunctions.current.extractText({
            data: {
              fileName: request.fileName,
              mimeType: request.mimeType || "application/octet-stream",
              fileBase64: request.fileBase64,
              ...(request.destinationText ? { destinationText: request.destinationText } : {}),
            },
          });
          sourceText = extracted.text;
        }
        if (!sourceText)
          throw new Error("No readable itinerary text was found in the selected input.");
        if (cancelled) return;

        setPhase("drafting");
        const generated = await serverFunctions.current.extractItinerary({
          data: {
            sourceText,
            ...(request?.destinationText ? { destinationText: request.destinationText } : {}),
          },
        });
        if (cancelled) return;

        setPhase("enriching");
        const hotelNames = generated.draft.days.flatMap((day) =>
          day.items
            .filter((item) => item.item_type === "ACCOMMODATION")
            .map((item) => {
              const hotelName = item["hotel_name"];
              return typeof hotelName === "string" && hotelName.trim() ? hotelName : item.title;
            })
            .filter((name) => typeof name === "string" && Boolean(name.trim())),
        );

        setProgress((current) => Math.max(current, 76));
        setPhase("images");
        let imageResult: QuickImageResult | null = null;
        try {
          imageResult = await serverFunctions.current.addImages({
            data: {
              draft: {
                title: generated.draft.title || generated.draft.destination,
                destinationName: generated.draft.destination,
                days: generated.draft.days.map((day, index) => ({
                  id: `quick-day-${index + 1}`,
                  day_number: index + 1,
                  title: day.title,
                  description: day.description ?? null,
                  notes: day.notes ?? null,
                  items: day.items.map((item) => ({
                    item_type: item.item_type,
                    title: item.title,
                    ...(typeof item["location"] === "string" ? { location: item["location"] } : {}),
                    ...(typeof item.description === "string"
                      ? { description: item.description }
                      : {}),
                    ...(typeof item["hotel_city"] === "string"
                      ? { hotel_city: item["hotel_city"] }
                      : {}),
                    ...(typeof item["dropoff"] === "string" ? { dropoff: item["dropoff"] } : {}),
                  })),
                })),
              },
            },
          });
        } catch (error) {
          const details =
            error instanceof Error ? error.message : "Image lookup could not be completed.";
          setImageMessage(`The itinerary is ready, but image lookup failed: ${details}`);
        }
        if (cancelled) return;
        if (imageResult && (imageResult.failed > 0 || imageResult.notFound > 0)) {
          setImageMessage(
            `Images were added for ${imageResult.added} day${imageResult.added === 1 ? "" : "s"}; ${imageResult.failed + imageResult.notFound} day${imageResult.failed + imageResult.notFound === 1 ? "" : "s"} had no available image.`,
          );
        }

        const photoResolution = await resolvePreviewPhotos(generated, imageResult);
        if (cancelled) return;
        if (photoResolution.failed) {
          setImageMessage((current) =>
            current
              ? `${current} Some images could not be loaded into the preview.`
              : "The itinerary is ready, but some images could not be loaded into the preview.",
          );
        }
        const savedDraft = await saveQuickItineraryDraft(
          generated,
          photoResolution.photos,
          sourceText,
        );
        if (cancelled) return;
        queryClient.setQueryData<ItineraryDraftWorkspaceRow[]>(["itinerary-drafts"], (current) =>
          dedupeItineraryDraftRows([savedDraft.row, ...(current ?? [])]),
        );
        await queryClient.invalidateQueries({ queryKey: ["itinerary-drafts"] });
        if (savedDraft.location === "browser") {
          setImageMessage((current) =>
            [current, "Draft saved in this browser only because account sync is unavailable."]
              .filter(Boolean)
              .join(" "),
          );
        }
        const preview = createQuickItineraryPreview(generated, photoResolution.photos);
        setPreviewHtml(buildItineraryPdfHtml(preview));
        if (hotelNames.length === 0) {
          setImageMessage((current) =>
            current
              ? `${current} No hotel names were detected in the source content.`
              : "No hotel names were detected in the source content.",
          );
        }
        setProgress(100);
        setPhase("complete");
        setPreviewOpen(true);
      } catch (error) {
        if (cancelled) return;
        const message =
          error instanceof Error ? error.message : "Unable to prepare this quick itinerary.";
        setErrorMessage(message);
        setPhase("error");
        toast.error(message);
      }
    }
    void prepareItinerary();
    return () => {
      cancelled = true;
      if (cancelPreparationRef.current === cancel) cancelPreparationRef.current = null;
    };
  }, [queryClient, request]);

  useEffect(() => {
    if (!dragging) return;
    const move = (event: PointerEvent) => {
      const origin = dragOrigin.current;
      if (!origin) return;
      const width = Math.min(minimized ? 230 : 360, window.innerWidth - 16);
      const height = minimized ? 64 : 174;
      setPosition({
        left: Math.max(
          8,
          Math.min(window.innerWidth - width - 8, origin.left + event.clientX - origin.pointerX),
        ),
        top: Math.max(
          8,
          Math.min(window.innerHeight - height - 8, origin.top + event.clientY - origin.pointerY),
        ),
      });
    };
    const end = () => {
      dragOrigin.current = null;
      setDragging(false);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end, { once: true });
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
    };
  }, [dragging, minimized]);

  function beginDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest("button")) return;
    event.preventDefault();
    dragOrigin.current = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      left: position.left,
      top: position.top,
    };
    setDragging(true);
  }

  function dismiss() {
    setPreviewOpen(false);
    setPhase(null);
    setRequest(null);
    setPreviewHtml("");
    setProgress(0);
    setErrorMessage("");
    setImageMessage("");
  }

  function closePreview() {
    setPreviewOpen(false);
    setPhase("complete");
    setMinimized(false);
    void queryClient.invalidateQueries({ queryKey: ["itinerary-drafts"] });
  }

  function cancelPreparation() {
    cancelPreparationRef.current?.();
    cancelPreparationRef.current = null;
    dismiss();
    toast.info("Itinerary preparation cancelled.");
  }

  if (!phase) return null;
  const phaseDetails = PHASE_DETAILS[phase];
  const isComplete = phase === "complete";
  const isError = phase === "error";

  return (
    <>
      {!previewOpen && (
        <section
          aria-label="Quick itinerary preparation progress"
          className="fixed z-[60] rounded-xl border border-slate-200 bg-white shadow-2xl"
          style={{
            left: position.left,
            top: position.top,
            width: Math.min(minimized ? 230 : 360, window.innerWidth - 16),
          }}
        >
          <div
            className="flex cursor-move items-center justify-between gap-3 rounded-t-xl bg-slate-900 px-4 py-3 text-white"
            onPointerDown={beginDrag}
            onPointerUp={() => {
              dragOrigin.current = null;
              setDragging(false);
            }}
          >
            <div className="flex min-w-0 items-center gap-2">
              <Move className="size-4 shrink-0 text-slate-300" />
              <span className="truncate text-sm font-semibold">Quick itinerary preparation</span>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {!isComplete && !isError && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Cancel itinerary preparation"
                  title="Cancel preparation"
                  className="size-7 text-white hover:bg-white/15 hover:text-white"
                  onClick={cancelPreparation}
                >
                  <X className="size-4" />
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={minimized ? "Expand progress" : "Minimize progress"}
                title={minimized ? "Expand" : "Minimize"}
                className="size-7 text-white hover:bg-white/15 hover:text-white"
                onClick={() => setMinimized((value) => !value)}
              >
                {minimized ? <Maximize2 className="size-4" /> : <Minus className="size-4" />}
              </Button>
            </div>
          </div>
          {!minimized && (
            <div className="space-y-3 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-slate-700">{phaseDetails.label}</p>
                <span className="text-sm font-semibold tabular-nums">{progress}%</span>
              </div>
              <Progress value={progress} aria-label={`Preparation ${progress}% complete`} />
              {isError ? (
                <div className="flex items-start gap-2 rounded-md bg-rose-50 p-3 text-sm text-rose-800">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              ) : (
                <p className="text-xs text-slate-500">
                  You can minimize or move this panel and continue using the CRM.
                </p>
              )}
              {isError && (
                <Button type="button" variant="outline" size="sm" onClick={dismiss}>
                  Close
                </Button>
              )}
              {!isComplete && !isError && (
                <Button type="button" variant="outline" size="sm" onClick={cancelPreparation}>
                  Cancel preparation
                </Button>
              )}
              {isComplete && (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    setMinimized(false);
                    setPreviewOpen(true);
                  }}
                >
                  <Eye className="size-4" />
                  Open preview
                </Button>
              )}
            </div>
          )}
          {minimized && (
            <div className="flex items-center gap-2 px-3 py-2 text-xs text-slate-600">
              {isError ? (
                <AlertCircle className="size-4 text-rose-600" />
              ) : isComplete ? (
                <Check className="size-4 text-emerald-600" />
              ) : (
                <LoaderCircle className="size-4 animate-spin text-teal-700" />
              )}
              <span className="tabular-nums">{progress}%</span>
              <Progress className="h-1.5 flex-1" value={progress} />
            </div>
          )}
        </section>
      )}

      <Dialog
        open={previewOpen}
        onOpenChange={(open) => {
          if (!open) closePreview();
        }}
      >
        <DialogContent className="flex h-[92vh] max-h-[94vh] w-[calc(100vw-1rem)] max-w-6xl flex-col gap-0 overflow-hidden p-0">
          <div className="flex items-start justify-between gap-4 border-b px-6 py-4 pr-12">
            <DialogHeader>
              <DialogTitle>Quick itinerary preview</DialogTitle>
              <DialogDescription>
                Your itinerary and hotel summary cards are ready. This editable itinerary has also
                been saved under Drafts, so closing the preview won’t discard it.
              </DialogDescription>
            </DialogHeader>
            <Button type="button" variant="outline" size="sm" onClick={closePreview}>
              <X className="size-4" />
              Close
            </Button>
          </div>
          {imageMessage && (
            <p className="mx-5 mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {imageMessage}
            </p>
          )}
          <div className="min-h-0 flex-1 bg-slate-100 p-3">
            <iframe
              title="Customer-facing quick itinerary preview"
              srcDoc={previewHtml}
              className="h-full w-full rounded-md border bg-white"
              sandbox="allow-same-origin"
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t px-6 py-3">
            <p className="flex items-center gap-2 text-sm text-emerald-700">
              <Check className="size-4" />
              Preparation complete
            </p>
            <Button type="button" onClick={closePreview}>
              <Eye className="size-4" />
              Minimize preview
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

async function resolvePreviewPhotos(
  generated: SupplierImportResult,
  imageResult: QuickImageResult | null,
) {
  const photoSpecs: Array<{
    dayIndex: number;
    itemIndex?: number;
    storagePath: string;
    placeName?: string;
    caption?: string | null;
    altText?: string | null;
    googlePlaceId?: string;
    attribution?: Array<{ displayName: string; uri: string | null; photoUri: string | null }>;
  }> = [];

  for (const photo of generated.photo_attachments) {
    photoSpecs.push({
      dayIndex: photo.day_index,
      itemIndex: photo.item_index,
      storagePath: photo.storage_path,
      caption: photo.caption,
      altText: photo.alt_text,
    });
  }
  for (const result of imageResult?.days ?? []) {
    if (!result.photo?.storage_path) continue;
    const placeName = result.photo.place_name ?? result.placeName ?? undefined;
    photoSpecs.push({
      dayIndex: result.dayNumber - 1,
      storagePath: result.photo.storage_path,
      ...(placeName ? { placeName } : {}),
      ...(result.photo.caption !== undefined ? { caption: result.photo.caption } : {}),
      ...(result.photo.alt_text !== undefined ? { altText: result.photo.alt_text } : {}),
      ...(result.photo.google_place_id ? { googlePlaceId: result.photo.google_place_id } : {}),
      ...(Array.isArray(result.photo.attribution)
        ? {
            attribution: result.photo.attribution.flatMap((value) => {
              if (!value || typeof value !== "object" || Array.isArray(value)) return [];
              const attribution = value as Record<string, unknown>;
              if (typeof attribution["displayName"] !== "string") return [];
              return [
                {
                  displayName: attribution["displayName"],
                  uri: typeof attribution["uri"] === "string" ? attribution["uri"] : null,
                  photoUri:
                    typeof attribution["photoUri"] === "string" ? attribution["photoUri"] : null,
                },
              ];
            }),
          }
        : {}),
    });
  }

  const signedUrls = new Map<string, string>();
  let failed = false;
  await Promise.all(
    [...new Set(photoSpecs.map((photo) => photo.storagePath))].map(async (storagePath) => {
      try {
        const { data, error } = await supabase.storage
          .from("itineraries")
          .createSignedUrl(storagePath, 3600);
        if (error) {
          failed = true;
          console.warn("[Quick itinerary] Could not load a generated preview image.", error);
          return;
        }
        signedUrls.set(storagePath, data.signedUrl);
      } catch (error) {
        failed = true;
        console.warn("[Quick itinerary] Could not load a generated preview image.", error);
      }
    }),
  );

  return {
    photos: photoSpecs.flatMap((photo) => {
      const url = signedUrls.get(photo.storagePath);
      if (!url) return [];
      return [{ ...photo, url }];
    }),
    failed,
  };
}

async function saveQuickItineraryDraft(
  generated: SupplierImportResult,
  photos: Awaited<ReturnType<typeof resolvePreviewPhotos>>["photos"],
  sourceText: string,
): Promise<{ location: "account" | "browser"; row: ItineraryDraftWorkspaceRow }> {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!authData.user) throw new Error("Sign in before generating a quick itinerary draft.");

  const draftId = crypto.randomUUID();
  const snapshot = createQuickItineraryDraftSnapshot(generated, photos, sourceText);
  const savedAt = new Date().toISOString();
  const draftData =
    snapshot as unknown as Database["public"]["Tables"]["itinerary_drafts"]["Insert"]["draft_data"];
  let databaseError: unknown = null;

  let browserStorageError: unknown = null;
  try {
    const storageBaseKey = `savr-itinerary-draft:${authData.user.id}:draft-${draftId}`;
    window.localStorage.setItem(`${storageBaseKey}:id`, draftId);
    window.localStorage.setItem(
      `${storageBaseKey}:snapshot`,
      JSON.stringify({ savedAt: Date.parse(savedAt), snapshot }),
    );
    window.localStorage.setItem(`savr-itinerary-last-draft:${authData.user.id}`, draftId);
  } catch (error) {
    browserStorageError = error;
    console.warn("[Quick itinerary] Browser draft backup failed.", error);
  }

  try {
    const { data, error } = await supabase
      .from("itinerary_drafts")
      .upsert(
        {
          id: draftId,
          user_id: authData.user.id,
          itinerary_id: null,
          lead_id: null,
          draft_data: draftData,
        },
        { onConflict: "id" },
      )
      .select("id,itinerary_id,lead_id,draft_data,updated_at")
      .single();
    if (error) throw error;
    if (!data) throw new Error("The account draft was not returned after saving.");
  } catch (error) {
    databaseError = error;
    console.warn("[Quick itinerary] Account draft save failed.", error);
  }

  if (databaseError && browserStorageError) {
    const databaseMessage =
      databaseError instanceof Error ? databaseError.message : "Account draft storage failed.";
    const browserMessage =
      browserStorageError instanceof Error
        ? browserStorageError.message
        : "Browser draft storage failed.";
    throw new Error(
      `Could not save the quick itinerary draft. ${databaseMessage} ${browserMessage}`,
    );
  }
  return {
    location: databaseError ? "browser" : "account",
    row: {
      id: draftId,
      itinerary_id: null,
      lead_id: null,
      draft_data: snapshot as unknown as ItineraryDraftWorkspaceRow["draft_data"],
      updated_at: savedAt,
    },
  };
}
