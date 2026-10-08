import { useState } from "react";
import { ClipboardPaste, FileUp, LoaderCircle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { extractDocumentCandidate, type DocumentExtractionProgress } from "@/lib/document-ocr";
import { parseFlightDetailsFromText } from "@/lib/flight-details-import";
import type { FlightDetailsDraft, LiveFlightOffer } from "@/lib/travel-search-types";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

function isDateTime(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return false;
  const date = new Date(`${value}:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 16) === value;
}

export function FlightDetailsImportDialog({
  currency,
  departureDate,
  returnDate,
  from,
  to,
  onAddFlight,
}: {
  currency: string;
  departureDate: string;
  returnDate: string;
  from: string;
  to: string;
  onAddFlight: (offer: LiveFlightOffer) => void;
}) {
  const [open, setOpen] = useState(false);
  const [sourceText, setSourceText] = useState("");
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [draft, setDraft] = useState<FlightDetailsDraft | null>(null);
  const [includeReturn, setIncludeReturn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const updateDraft = <K extends keyof FlightDetailsDraft>(
    key: K,
    value: FlightDetailsDraft[K],
  ) => {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  };

  const closeDialog = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen && !busy) {
      setError("");
      setStatus("");
    }
  };

  const pasteClipboard = async () => {
    setError("");
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        setError("The clipboard is empty. Copy the selected flight details first.");
        return;
      }
      setSourceText(text.slice(0, 20_000));
      setSelectedImage(null);
      setDraft(null);
      setStatus("Flight text pasted. Choose Analyze to fill the review fields.");
    } catch {
      setError(
        "Clipboard access was blocked. Click in the text box and paste with Ctrl+V (or Cmd+V).",
      );
    }
  };

  const analyzeSource = async () => {
    setBusy(true);
    setError("");
    setStatus("");
    setDraft(null);
    try {
      let text = sourceText.trim();
      if (selectedImage) {
        if (selectedImage.size > MAX_IMAGE_BYTES) {
          throw new Error("Please choose an image smaller than 10 MB.");
        }
        if (!["image/png", "image/jpeg", "image/webp"].includes(selectedImage.type)) {
          throw new Error("Use a PNG, JPEG, or WebP screenshot.");
        }
        setStatus("Reading screenshot in this browser…");
        const bytes = new Uint8Array(await selectedImage.arrayBuffer());
        const extracted = await extractDocumentCandidate(
          {
            fileName: selectedImage.name,
            mimeType: selectedImage.type,
            file: bytes,
          },
          (progress: DocumentExtractionProgress) => {
            if (progress.stage === "loading_ocr") setStatus("Loading the browser’s text reader…");
            else if (progress.stage === "recognizing")
              setStatus("Reading text from the screenshot…");
          },
        );
        text = extracted.text.trim();
        if (!text)
          throw new Error(
            "No readable text was found. Try a clearer screenshot or paste the flight details instead.",
          );
        setSourceText(text.slice(0, 20_000));
      }
      if (!text) throw new Error("Paste the copied flight details or choose a screenshot first.");
      if (text.length > 20_000)
        throw new Error("Use a shorter flight summary (20,000 characters maximum).");

      setStatus("Extracting flight fields in this browser…");
      const extractedDraft = parseFlightDetailsFromText(text, {
        departureDate,
        returnDate,
        currency,
        from,
        to,
      });
      setDraft(extractedDraft);
      setIncludeReturn(extractedDraft.has_return);
      setStatus(
        "Review the extracted fields. Check every date, time, route, and fare before adding.",
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "The flight details could not be analyzed.",
      );
      setStatus("");
    } finally {
      setBusy(false);
    }
  };

  const saveDraft = () => {
    if (!draft) return;
    const from = draft.from?.trim().toUpperCase() ?? "";
    const to = draft.to?.trim().toUpperCase() ?? "";
    const resolvedCurrency = draft.currency?.trim().toUpperCase() || currency;
    if (!draft.airline?.trim()) return setError("Enter or confirm the airline.");
    if (!/^[A-Z]{3}$/.test(from) || !/^[A-Z]{3}$/.test(to) || from === to) {
      return setError("Enter valid, different three-letter origin and destination airport codes.");
    }
    if (!isDateTime(draft.departure_at) || !isDateTime(draft.arrival_at)) {
      return setError("Enter valid departure and arrival dates and times.");
    }
    if (!/^[A-Z]{3}$/.test(resolvedCurrency))
      return setError("Enter a valid three-letter currency code.");
    if (draft.stops !== null && (!Number.isInteger(draft.stops) || draft.stops < 0)) {
      return setError("Stops must be a whole number greater than or equal to zero.");
    }
    if (draft.price !== null && (!Number.isFinite(draft.price) || draft.price < 0)) {
      return setError("Fare must be a valid non-negative amount.");
    }
    if (includeReturn) {
      const returnFrom = draft.return_from?.trim().toUpperCase() || to;
      const returnTo = draft.return_to?.trim().toUpperCase() || from;
      if (
        !/^[A-Z]{3}$/.test(returnFrom) ||
        !/^[A-Z]{3}$/.test(returnTo) ||
        returnFrom === returnTo
      ) {
        return setError("Enter valid, different airport codes for the return flight.");
      }
      if (!draft.return_airline?.trim()) return setError("Enter or confirm the return airline.");
      if (
        draft.return_stops !== null &&
        (!Number.isInteger(draft.return_stops) || draft.return_stops < 0)
      ) {
        return setError("Return stops must be a whole number greater than or equal to zero.");
      }
      if (!isDateTime(draft.return_departure_at) || !isDateTime(draft.return_arrival_at)) {
        return setError(
          "Enter valid return departure and arrival dates and times, or turn off the return leg.",
        );
      }
    }

    onAddFlight({
      id: `imported-flight-${Date.now()}`,
      airline: draft.airline.trim(),
      flight_number: draft.flight_number?.trim() ?? "",
      from,
      to,
      departure_at: draft.departure_at,
      arrival_at: draft.arrival_at,
      duration: draft.duration?.trim() ?? "",
      ...(draft.stops !== null ? { stops: draft.stops } : {}),
      price: draft.price ?? 0,
      currency: resolvedCurrency,
      ...(draft.cabin?.trim() ? { cabin: draft.cabin.trim() } : {}),
      ...(draft.baggage_information ? { baggage_information: draft.baggage_information } : {}),
      ...(includeReturn
        ? {
            return_from: draft.return_from?.trim().toUpperCase() || to,
            return_to: draft.return_to?.trim().toUpperCase() || from,
            return_departure_at: draft.return_departure_at!,
            return_arrival_at: draft.return_arrival_at!,
            ...(draft.return_duration?.trim()
              ? { return_duration: draft.return_duration.trim() }
              : {}),
            ...(draft.return_stops !== null ? { return_stops: draft.return_stops } : {}),
            ...(draft.return_baggage_information
              ? { return_baggage_information: draft.return_baggage_information }
              : {}),
            ...(draft.return_airline?.trim()
              ? { return_airline: draft.return_airline.trim() }
              : {}),
            ...(draft.return_flight_number?.trim()
              ? { return_flight_number: draft.return_flight_number.trim() }
              : {}),
          }
        : {}),
    });
    setOpen(false);
    setSourceText("");
    setSelectedImage(null);
    setDraft(null);
    setError("");
    setStatus("");
  };

  const textField = (
    key: keyof FlightDetailsDraft,
    label: string,
    options: { type?: string; placeholder?: string; maxLength?: number } = {},
  ) => {
    const value = draft?.[key];
    if (typeof value !== "string" && value !== null) return null;
    return (
      <div className="space-y-1">
        <Label htmlFor={`flight-import-${key}`}>{label}</Label>
        <Input
          id={`flight-import-${key}`}
          type={options.type ?? "text"}
          value={value ?? ""}
          placeholder={options.placeholder}
          maxLength={options.maxLength}
          onChange={(event) =>
            updateDraft(key, event.target.value as FlightDetailsDraft[typeof key])
          }
        />
      </div>
    );
  };

  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
        <FileUp className="mr-2 size-4" />
        Add selected flight
      </Button>
      <Dialog open={open} onOpenChange={closeDialog}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Import selected flight</DialogTitle>
            <DialogDescription>
              Paste copied flight details or upload a screenshot. Screenshot OCR and field
              extraction run in your browser; the image and text are not sent to an AI service. No
              paid flight-search or AI API is used.
            </DialogDescription>
          </DialogHeader>

          {!draft ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="flight-import-source">Copied flight text</Label>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => void pasteClipboard()}
                    disabled={busy}
                  >
                    <ClipboardPaste className="mr-2 size-4" />
                    Paste from clipboard
                  </Button>
                </div>
                <Textarea
                  id="flight-import-source"
                  value={sourceText}
                  onChange={(event) => {
                    setSourceText(event.target.value);
                    setSelectedImage(null);
                    setError("");
                  }}
                  placeholder="Paste the selected itinerary details here…"
                  rows={7}
                  maxLength={20_001}
                  disabled={busy}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="flight-import-image">Or upload a screenshot</Label>
                <Input
                  id="flight-import-image"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  disabled={busy}
                  onChange={(event) => {
                    const image = event.target.files?.[0] ?? null;
                    setSelectedImage(image);
                    setDraft(null);
                    setError("");
                  }}
                />
                {selectedImage && (
                  <p className="text-xs text-muted-foreground">Selected: {selectedImage.name}</p>
                )}
              </div>
              <div className="flex justify-end">
                <Button
                  type="button"
                  onClick={() => void analyzeSource()}
                  disabled={busy || (!sourceText.trim() && !selectedImage)}
                >
                  {busy ? (
                    <LoaderCircle className="mr-2 size-4 animate-spin" />
                  ) : (
                    <Sparkles className="mr-2 size-4" />
                  )}
                  Analyze and fill fields
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Check the extracted details and correct anything that is missing or inaccurate. The
                fare and itinerary are not booking confirmation.
              </p>
              <section
                className="space-y-3 rounded-lg border border-sky-200 bg-sky-50/60 p-4"
                aria-label="Flight summary preview"
              >
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-sky-800">
                    Itinerary summary
                  </p>
                  <p className="mt-1 text-lg font-semibold text-slate-900">
                    {draft.from || "Origin"} → {draft.to || "Destination"}
                  </p>
                  <p className="text-sm text-slate-700">
                    {[draft.airline, draft.flight_number].filter(Boolean).join(" ") ||
                      "Airline / flight number not identified"}
                  </p>
                </div>
                <div className="grid gap-3 text-sm sm:grid-cols-2">
                  <div className="rounded-md bg-white p-3">
                    <p className="font-medium text-slate-900">Outbound</p>
                    <p>
                      {draft.departure_at?.replace("T", " · ") ||
                        "Departure date/time not identified"}
                    </p>
                    <p>
                      {draft.arrival_at?.replace("T", " · ") || "Arrival date/time not identified"}
                    </p>
                    <p className="mt-1 text-muted-foreground">
                      {draft.duration || "Duration unknown"} ·{" "}
                      {draft.stops === null
                        ? "Stops unknown"
                        : draft.stops === 0
                          ? "Non-stop"
                          : `${draft.stops} stop(s)`}
                    </p>
                  </div>
                  {includeReturn && (
                    <div className="rounded-md bg-white p-3">
                      <p className="font-medium text-slate-900">
                        Return · {draft.return_from || to || "Origin"} →{" "}
                        {draft.return_to || from || "Destination"}
                      </p>
                      <p>
                        {draft.return_departure_at?.replace("T", " · ") ||
                          "Departure date/time not identified"}
                      </p>
                      <p>
                        {draft.return_arrival_at?.replace("T", " · ") ||
                          "Arrival date/time not identified"}
                      </p>
                      <p className="mt-1 text-muted-foreground">
                        {draft.return_duration || "Duration unknown"} ·{" "}
                        {draft.return_stops === null
                          ? "Stops unknown"
                          : draft.return_stops === 0
                            ? "Non-stop"
                            : `${draft.return_stops} stop(s)`}
                      </p>
                    </div>
                  )}
                </div>
                <p className="text-sm text-slate-700">
                  Fare:{" "}
                  {draft.price === null
                    ? "Not identified"
                    : `${draft.currency || currency} ${draft.price.toLocaleString()}`}
                  {" · "}
                  {draft.cabin || "Cabin not identified"}
                  {" · "}
                  {draft.baggage_information || "Baggage not identified"}
                  {includeReturn && draft.return_baggage_information
                    ? ` · Return baggage: ${draft.return_baggage_information}`
                    : ""}
                </p>
              </section>
              <div className="grid gap-3 sm:grid-cols-2">
                {textField("airline", "Airline")}
                {textField("flight_number", "Flight number")}
                {textField("from", "From (IATA code)", { maxLength: 3, placeholder: "HYD" })}
                {textField("to", "To (IATA code)", { maxLength: 3, placeholder: "DEL" })}
                {textField("departure_at", "Departure (local time)", { type: "datetime-local" })}
                {textField("arrival_at", "Arrival (local time)", { type: "datetime-local" })}
                {textField("duration", "Duration", { placeholder: "2h 15m" })}
                {textField("cabin", "Cabin")}
                {textField("baggage_information", "Baggage (if shown)")}
                <div className="space-y-1">
                  <Label htmlFor="flight-import-stops">Stops</Label>
                  <Input
                    id="flight-import-stops"
                    type="number"
                    min="0"
                    step="1"
                    value={draft.stops ?? ""}
                    placeholder="Unknown"
                    onChange={(event) =>
                      updateDraft(
                        "stops",
                        event.target.value === "" ? null : Number(event.target.value),
                      )
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="flight-import-price">Fare amount (optional)</Label>
                  <Input
                    id="flight-import-price"
                    type="number"
                    min="0"
                    step="0.01"
                    value={draft.price ?? ""}
                    placeholder="Not found"
                    onChange={(event) =>
                      updateDraft(
                        "price",
                        event.target.value === "" ? null : Number(event.target.value),
                      )
                    }
                  />
                </div>
                {textField("currency", "Currency", { maxLength: 3, placeholder: currency })}
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={includeReturn}
                  onChange={(event) => setIncludeReturn(event.target.checked)}
                />
                Include a return flight
              </label>
              {includeReturn && (
                <div className="space-y-3 rounded-md border p-3">
                  <p className="text-sm font-medium">Return flight</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {textField("return_airline", "Return airline")}
                    {textField("return_flight_number", "Return flight number")}
                    {textField("return_from", "Return from (IATA)", {
                      maxLength: 3,
                      placeholder: "DEL",
                    })}
                    {textField("return_to", "Return to (IATA)", {
                      maxLength: 3,
                      placeholder: "HYD",
                    })}
                    {textField("return_departure_at", "Return departure (local time)", {
                      type: "datetime-local",
                    })}
                    {textField("return_arrival_at", "Return arrival (local time)", {
                      type: "datetime-local",
                    })}
                    {textField("return_duration", "Return duration", { placeholder: "2h 20m" })}
                    {textField("return_baggage_information", "Return baggage (if shown)")}
                    <div className="space-y-1">
                      <Label htmlFor="flight-import-return-stops">Return stops</Label>
                      <Input
                        id="flight-import-return-stops"
                        type="number"
                        min="0"
                        step="1"
                        value={draft.return_stops ?? ""}
                        placeholder="Unknown"
                        onChange={(event) =>
                          updateDraft(
                            "return_stops",
                            event.target.value === "" ? null : Number(event.target.value),
                          )
                        }
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {(status || error) && (
            <p
              className={`text-sm ${error ? "text-destructive" : "text-muted-foreground"}`}
              role={error ? "alert" : "status"}
              aria-live="polite"
            >
              {error || status}
            </p>
          )}
          {draft && (
            <DialogFooter className="gap-2 sm:gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setDraft(null);
                  setError("");
                }}
              >
                Back
              </Button>
              <Button type="button" onClick={saveDraft}>
                Add to itinerary
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
