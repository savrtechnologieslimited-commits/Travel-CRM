import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  Copy,
  Edit3,
  ExternalLink,
  MessageSquareText,
  Pencil,
  Phone,
  Share2,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { useCustomer } from "@/lib/data";
import { formatDate, formatMoney, titleize } from "@/lib/crm";
import { resolveFlightAirportCode } from "@/lib/airports";
import {
  buildMakeMyTripHotelSearchLink,
  buildFlightSearchLink,
  flightSearchProviders,
} from "@/lib/travel-search-providers";
import { supabase } from "@/integrations/supabase/client";
import { NewCustomerDialog } from "@/components/entity-dialogs";
import { CustomerDeleteButton } from "@/components/customer-delete-button";
import { AssignedItineraryReviewDialog } from "@/components/assigned-itinerary-review-dialog";
import { WacrmContactMatchLink } from "@/components/wacrm-contact-match-link";
import { WhatsAppChatDialog } from "@/components/whatsapp-inbox";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Database, Json } from "@/integrations/supabase/types";
import { buildPublicItineraryShareUrl, createItineraryShareFn } from "@/lib/itinerary-share";

type CustomerFlowRequirement = Database["public"]["Tables"]["customer_flow_requirements"]["Row"];
type CustomerItinerary = Pick<
  Database["public"]["Tables"]["itineraries"]["Row"],
  | "id"
  | "title"
  | "name"
  | "status"
  | "travel_start_date"
  | "travel_end_date"
  | "adults"
  | "children"
> & {
  destinations: { name: string | null } | null;
};
type ItinerarySummaryItem = Database["public"]["Tables"]["itinerary_day_items"]["Row"];
const makeMyTripFlightProvider = flightSearchProviders.find(
  (provider) => provider.name === "MakeMyTrip",
);

function AssignedItineraryCard({
  itinerary,
  index,
  customerId,
  customerName,
  phoneNumber,
  onDeleted,
}: {
  itinerary: CustomerItinerary;
  index: number;
  customerId: string;
  customerName: string;
  phoneNumber: string | null;
  onDeleted: () => Promise<void>;
}) {
  const createShare = useServerFn(createItineraryShareFn);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [sharing, setSharing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const title = itinerary.title ?? itinerary.name ?? "Untitled itinerary";

  async function shareItinerary() {
    setSharing(true);
    try {
      const result = await createShare({ data: { itineraryId: itinerary.id, expiresInDays: 30 } });
      setShareUrl(buildPublicItineraryShareUrl(window.location.origin, result.token));
      setShareDialogOpen(true);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to create the itinerary share link.",
      );
    } finally {
      setSharing(false);
    }
  }

  async function copyShareUrl() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success("Itinerary share link copied");
    } catch {
      toast.error("Could not copy automatically. Select the share link and copy it.");
    }
  }

  async function deleteItinerary() {
    if (!window.confirm(`Delete "${title}" from this customer? This cannot be undone.`)) return;

    setDeleting(true);
    try {
      const { data: current, error: readError } = await supabase
        .from("itineraries")
        .select("document_path")
        .eq("id", itinerary.id)
        .eq("customer_id", customerId)
        .maybeSingle();
      if (readError) throw readError;
      if (!current) throw new Error("This assigned itinerary could not be found.");

      if (current.document_path) {
        const { error: storageError } = await supabase.storage
          .from("itineraries")
          .remove([current.document_path]);
        if (storageError) throw storageError;
      }

      const { error: deleteError } = await supabase
        .from("itineraries")
        .delete()
        .eq("id", itinerary.id)
        .eq("customer_id", customerId);
      if (deleteError) throw deleteError;
      await onDeleted();
      toast.success("Assigned itinerary deleted");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to delete the assigned itinerary.",
      );
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <article className="rounded-lg border border-slate-200 p-4 transition-colors hover:bg-slate-50">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Assigned itinerary {index + 1}
            </p>
            <p className="mt-1 text-base font-medium text-slate-900">{title}</p>
            <p className="mt-1 text-xs text-slate-500">
              {itinerary.destinations?.name ?? "Destination pending"} ·{" "}
              {itinerary.travel_start_date || itinerary.travel_end_date
                ? `${itinerary.travel_start_date ? formatDate(itinerary.travel_start_date) : "Dates not set"}${itinerary.travel_end_date ? ` – ${formatDate(itinerary.travel_end_date)}` : ""}`
                : "Dates not set"}
            </p>
          </div>
          <StatusBadge status={itinerary.status} />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <AssignedItineraryReviewDialog itineraryId={itinerary.id} title={title} />
          <Button type="button" size="sm" variant="outline" asChild>
            <Link to="/itinerary-builder" search={{ itineraryId: itinerary.id }}>
              <Pencil className="mr-1.5 size-4" />
              Edit
            </Link>
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void shareItinerary()}
            disabled={sharing}
          >
            <Share2 className="mr-1.5 size-4" />
            {sharing ? "Creating link…" : "Share"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="text-rose-700 hover:bg-rose-50 hover:text-rose-800"
            onClick={() => void deleteItinerary()}
            disabled={deleting}
          >
            <Trash2 className="mr-1.5 size-4" />
            {deleting ? "Deleting…" : "Delete"}
          </Button>
        </div>
      </article>
      <Dialog open={shareDialogOpen} onOpenChange={setShareDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Share itinerary</DialogTitle>
            <DialogDescription>
              This customer-ready link is available for 30 days.
            </DialogDescription>
          </DialogHeader>
          <input
            aria-label="Itinerary share link"
            readOnly
            value={shareUrl}
            className="h-10 w-full rounded-md border border-slate-200 bg-slate-50 px-3 text-sm"
          />
          <DialogFooter>
            {shareUrl && (
              <WhatsAppChatDialog
                context={{
                  customerId,
                  phoneNumber,
                  customerName,
                  destination: itinerary.destinations?.name,
                }}
                initialMessage={`Hi ${customerName}, here is your itinerary preview: ${shareUrl}`}
                trigger={
                  <Button type="button" variant="outline">
                    <MessageSquareText className="mr-1.5 size-4" />
                    WhatsApp
                  </Button>
                }
              />
            )}
            <Button type="button" variant="outline" onClick={() => setShareDialogOpen(false)}>
              Close
            </Button>
            <Button type="button" onClick={() => void copyShareUrl()}>
              <Copy className="mr-1.5 size-4" />
              Copy link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function requirementAnswerEntries(answers: Json): [string, string][] {
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) return [];
  return Object.entries(answers).map(([key, value]) => [
    titleize(key.replace(/_/g, " ")),
    typeof value === "string" || typeof value === "number" || typeof value === "boolean"
      ? String(value)
      : value === null
        ? "—"
        : JSON.stringify(value),
  ]);
}

function FlowRequirementList({
  requirements,
  emptyMessage,
}: {
  requirements: CustomerFlowRequirement[];
  emptyMessage: string;
}) {
  if (requirements.length === 0) {
    return <p className="text-sm text-slate-500">{emptyMessage}</p>;
  }

  return (
    <div className="space-y-3">
      {requirements.map((requirement, index) => {
        const answers = requirementAnswerEntries(requirement.answers);
        return (
          <article key={requirement.id} className="rounded-lg border border-slate-200 p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  Requirement {index + 1}: {requirement.flow_name}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Completed {formatDate(requirement.completed_at)}
                </p>
              </div>
            </div>
            {answers.length > 0 ? (
              <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                {answers.map(([label, value], answerIndex) => (
                  <div key={`${label}-${answerIndex}`}>
                    <dt className="text-[11px] uppercase tracking-[0.12em] text-slate-500">
                      {label}
                    </dt>
                    <dd className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-900">
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="mt-3 text-sm text-slate-500">No answers were captured.</p>
            )}
          </article>
        );
      })}
    </div>
  );
}

function readItemMetadata(metadata: Json): Record<string, Json | undefined> {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata : {};
}

function BookingPaymentControl({
  customerId,
  itineraryId,
  item,
}: {
  customerId: string;
  itineraryId: string;
  item: ItinerarySummaryItem;
}) {
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState<"document" | "proof" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const metadata = readItemMetadata(item.metadata);
  const documentPath =
    typeof metadata["booking_document_path"] === "string"
      ? metadata["booking_document_path"]
      : typeof metadata["booking_pdf_path"] === "string"
        ? metadata["booking_pdf_path"]
        : typeof metadata["voucher_path"] === "string"
          ? metadata["voucher_path"]
          : null;
  const documentName =
    typeof metadata["booking_document_name"] === "string"
      ? metadata["booking_document_name"]
      : typeof metadata["booking_pdf_name"] === "string"
        ? metadata["booking_pdf_name"]
        : typeof metadata["voucher_name"] === "string"
          ? metadata["voucher_name"]
          : null;
  const paymentProofPath =
    typeof metadata["payment_proof_path"] === "string" ? metadata["payment_proof_path"] : null;
  const paymentProofName =
    typeof metadata["payment_proof_name"] === "string" ? metadata["payment_proof_name"] : null;
  const paymentMode =
    typeof metadata["payment_mode"] === "string" ? metadata["payment_mode"] : "";
  const [savingPaymentMode, setSavingPaymentMode] = useState(false);

  async function uploadFile(file: File, kind: "document" | "proof") {
    const isSupportedFile =
      file.type === "application/pdf" ||
      file.type.startsWith("image/") ||
      /\.(pdf|jpe?g|png|webp)$/i.test(file.name);
    if (!isSupportedFile) {
      setError("Choose a PDF or image file.");
      return;
    }
    setUploading(kind);
    setError(null);
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${customerId}/${itineraryId}/${item.id}/${crypto.randomUUID()}-${safeName}`;
    const pathKey = kind === "document" ? "booking_document_path" : "payment_proof_path";
    const nameKey = kind === "document" ? "booking_document_name" : "payment_proof_name";
    try {
      const { error: uploadError } = await supabase.storage.from("itineraries").upload(path, file, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });
      if (uploadError) throw uploadError;
      const { error: updateError } = await supabase
        .from("itinerary_day_items")
        .update({
          metadata: { ...metadata, [pathKey]: path, [nameKey]: file.name },
        })
        .eq("id", item.id);
      if (updateError) {
        const { error: cleanupError } = await supabase.storage.from("itineraries").remove([path]);
        if (cleanupError) {
          throw new Error(
            `${updateError.message} The uploaded file could not be removed: ${cleanupError.message}`,
          );
        }
        throw updateError;
      }
      await queryClient.invalidateQueries({
        queryKey: ["customer-selected-itinerary-summaries"],
      });
    } catch (uploadFailure) {
      setError(
        uploadFailure instanceof Error
          ? uploadFailure.message
          : kind === "document"
            ? "Could not upload this booking document."
            : "Could not upload payment proof.",
      );
    } finally {
      setUploading(null);
    }
  }

  async function openFile(path: string | null) {
    if (!path) return;
    setError(null);
    const { data, error: signedUrlError } = await supabase.storage
      .from("itineraries")
      .createSignedUrl(path, 3600);
    if (signedUrlError) {
      setError(signedUrlError.message);
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function savePaymentMode(value: string) {
    setSavingPaymentMode(true);
    setError(null);
    try {
      const { error: updateError } = await supabase
        .from("itinerary_day_items")
        .update({ metadata: { ...metadata, payment_mode: value || null } })
        .eq("id", item.id);
      if (updateError) throw updateError;
      await queryClient.invalidateQueries({
        queryKey: ["customer-selected-itinerary-summaries"],
      });
    } catch (saveFailure) {
      setError(
        saveFailure instanceof Error ? saveFailure.message : "Could not save the payment mode.",
      );
    } finally {
      setSavingPaymentMode(false);
    }
  }

  return (
    <div className="mt-4 space-y-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3">
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-slate-700">Booking Document (Voucher/PDF)</p>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
            <Upload className="size-3.5" />
            {uploading === "document"
              ? "Uploading…"
              : documentPath
                ? "Replace booking document"
                : "Upload booking document"}
            <input
              type="file"
              className="sr-only"
              accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/*"
              disabled={uploading !== null}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file) void uploadFile(file, "document");
                event.currentTarget.value = "";
              }}
            />
          </label>
          {documentPath && (
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto p-0 text-xs"
              onClick={() => void openFile(documentPath)}
            >
              <ExternalLink className="mr-1 size-3.5" />
              {documentName || "Open booking document"}
            </Button>
          )}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-slate-700">Payment Proof</p>
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
              <Upload className="size-3.5" />
              {uploading === "proof"
                ? "Uploading…"
                : paymentProofPath
                  ? "Replace proof"
                  : "Upload proof"}
              <input
                type="file"
                className="sr-only"
                accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/*"
                disabled={uploading !== null}
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  if (file) void uploadFile(file, "proof");
                  event.currentTarget.value = "";
                }}
              />
            </label>
            {paymentProofPath && (
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-auto p-0 text-xs"
                onClick={() => void openFile(paymentProofPath)}
              >
                <ExternalLink className="mr-1 size-3.5" />
                {paymentProofName || "Open proof"}
              </Button>
            )}
          </div>
        </div>
        <label className="space-y-1.5 text-xs font-medium text-slate-700">
          Payment Mode
          <select
            className="block h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-sm font-normal text-slate-900"
            value={paymentMode}
            disabled={savingPaymentMode}
            onChange={(event) => void savePaymentMode(event.currentTarget.value)}
          >
            <option value="">Select payment mode</option>
            <option value="Cash">Cash</option>
            <option value="Bank">Bank</option>
            <option value="Credit">Credit</option>
            <option value="Other">Other</option>
          </select>
        </label>
      </div>
      {error && (
        <p className="w-full text-xs text-rose-700" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

type BookingDocumentCategory = "hotels" | "flights" | "activities" | "others";
type UploadedBookingDocument = {
  itinerary: CustomerItinerary;
  item: ItinerarySummaryItem;
  category: BookingDocumentCategory;
  dayNumber: number;
  name: string;
  itineraryNumber: number;
  path: string;
  kind: "Booking document" | "Payment proof";
};

function getBookingDocumentCategory(item: ItinerarySummaryItem): BookingDocumentCategory {
  if (item.item_type === "ACCOMMODATION") return "hotels";
  if (item.item_type === "FLIGHT") return "flights";
  if (item.item_type === "ACTIVITY" || item.item_type === "SIGHTSEEING") return "activities";
  return "others";
}

function UploadedBookingDocumentCard({ document }: { document: UploadedBookingDocument }) {
  const [error, setError] = useState<string | null>(null);

  async function openDocument() {
    setError(null);
    const newWindow = window.open("about:blank", "_blank");
    if (!newWindow) {
      setError("Allow pop-ups to open this booking PDF.");
      return;
    }
    const { data, error: signedUrlError } = await supabase.storage
      .from("itineraries")
      .createSignedUrl(document.path, 3600);
    if (signedUrlError) {
      newWindow.close();
      setError(signedUrlError.message);
      return;
    }
    newWindow.location.href = data.signedUrl;
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-200 bg-white p-3">
      <div>
        <p className="text-sm font-medium text-slate-900">{document.name}</p>
        <p className="mt-0.5 text-xs text-slate-500">
          {document.kind} · Day {document.dayNumber} · {document.item.title || "Booking"}
        </p>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={() => void openDocument()}>
        <ExternalLink className="mr-1.5 size-3.5" />
        View file
      </Button>
      {error && (
        <p className="w-full text-xs text-rose-700" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function ItineraryUploadedDocuments({ documents }: { documents: UploadedBookingDocument[] }) {
  const categoryLabels: Record<BookingDocumentCategory, string> = {
    hotels: "Hotels",
    flights: "Flights",
    activities: "Activities",
    others: "Others",
  };
  const categories = (Object.keys(categoryLabels) as BookingDocumentCategory[]).filter((category) =>
    documents.some((document) => document.category === category),
  );
  const [activeCategory, setActiveCategory] = useState<BookingDocumentCategory | "">("");
  const selectedCategory = categories.includes(activeCategory)
    ? activeCategory
    : (categories[0] ?? "");

  return (
    <Tabs
      value={selectedCategory}
      onValueChange={(value) => {
        const category = categories.find((entry) => entry === value);
        if (category) setActiveCategory(category);
      }}
      className="space-y-3"
    >
      <TabsList className="h-auto flex-wrap justify-start gap-1 bg-slate-100 p-1">
        {categories.map((category) => (
          <TabsTrigger key={category} value={category}>
            {categoryLabels[category]}
          </TabsTrigger>
        ))}
      </TabsList>
      {categories.map((category) => (
        <TabsContent key={category} value={category} className="mt-0 space-y-2">
          {documents
            .filter((document) => document.category === category)
            .map((document) => (
              <UploadedBookingDocumentCard
                key={`${document.item.id}-${document.kind}`}
                document={document}
              />
            ))}
        </TabsContent>
      ))}
    </Tabs>
  );
}

function UploadedBookingDocuments({ documents }: { documents: UploadedBookingDocument[] }) {
  const itineraries = Array.from(
    new Map(documents.map((document) => [document.itinerary.id, document.itinerary])).values(),
  );
  const [activeItineraryId, setActiveItineraryId] = useState("");
  const selectedItineraryId = itineraries.some((itinerary) => itinerary.id === activeItineraryId)
    ? activeItineraryId
    : (itineraries[0]?.id ?? "");

  if (itineraries.length === 0) {
    return <p className="text-sm text-slate-500">No booking PDFs have been uploaded yet.</p>;
  }

  if (itineraries.length === 1) {
    return (
      <ItineraryUploadedDocuments
        documents={documents.filter((document) => document.itinerary.id === selectedItineraryId)}
      />
    );
  }

  return (
    <Tabs value={selectedItineraryId} onValueChange={setActiveItineraryId} className="space-y-3">
      <TabsList className="h-auto flex-wrap justify-start gap-1 bg-slate-100 p-1">
        {itineraries.map((itinerary) => (
          <TabsTrigger key={itinerary.id} value={itinerary.id}>
            Assigned itinerary{" "}
            {documents.find((document) => document.itinerary.id === itinerary.id)?.itineraryNumber}
          </TabsTrigger>
        ))}
      </TabsList>
      {itineraries.map((itinerary) => (
        <TabsContent key={itinerary.id} value={itinerary.id} className="mt-0">
          <ItineraryUploadedDocuments
            documents={documents.filter((document) => document.itinerary.id === itinerary.id)}
          />
        </TabsContent>
      ))}
    </Tabs>
  );
}

function ItinerarySummaryCards({
  customerId,
  itinerary,
  days,
  items,
}: {
  customerId: string;
  itinerary: CustomerItinerary;
  days: Array<{ id: string; itinerary_id: string; day_number: number }>;
  items: ItinerarySummaryItem[];
}) {
  const dayNumbers = new Map(days.map((day) => [day.id, day.day_number]));
  const hotels = items.filter((item) => item.item_type === "ACCOMMODATION");
  const flights = items.filter((item) => item.item_type === "FLIGHT");
  const activities = items.filter(
    (item) => item.item_type === "ACTIVITY" || item.item_type === "SIGHTSEEING",
  );
  const otherItems = items.filter(
    (item) =>
      item.item_type !== "ACCOMMODATION" &&
      item.item_type !== "FLIGHT" &&
      item.item_type !== "ACTIVITY" &&
      item.item_type !== "SIGHTSEEING",
  );

  function makeHotelSearchLink(item: ItinerarySummaryItem) {
    const roomDetails = readItemMetadata(item.metadata)["room_details"];
    const rooms =
      item.rooms ?? (Array.isArray(roomDetails) && roomDetails.length > 0 ? roomDetails.length : 1);
    return buildMakeMyTripHotelSearchLink({
      hotelName: item.hotel_name || item.title,
      city: item.hotel_city || item.location,
      checkIn: item.check_in || itinerary.travel_start_date,
      checkOut: item.check_out || itinerary.travel_end_date,
      adults: item.adults ?? itinerary.adults ?? 1,
      children: item.children ?? itinerary.children ?? 0,
      rooms,
    });
  }

  function makeFlightSearchLink(item: ItinerarySummaryItem) {
    const from =
      resolveFlightAirportCode(item.departure_airport) ??
      resolveFlightAirportCode(item.departure_city);
    const to =
      resolveFlightAirportCode(item.arrival_airport) ?? resolveFlightAirportCode(item.arrival_city);
    const departure = item.flight_departure_date || itinerary.travel_start_date;
    if (!makeMyTripFlightProvider || !from || !to || !departure) return null;
    return buildFlightSearchLink(makeMyTripFlightProvider, {
      from,
      to,
      departure,
      adults: item.adults ?? itinerary.adults ?? 1,
      children: item.children ?? itinerary.children ?? 0,
      tripType: "one-way",
    });
  }

  function renderCard(
    item: ItinerarySummaryItem,
    details: ReactNode,
    searchUrl?: string | null,
    title?: string,
  ) {
    return (
      <article key={item.id} className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h4 className="font-semibold text-slate-900">
              {title || item.title || "Travel service"}
            </h4>
            <p className="mt-1 text-xs text-slate-500">
              Day {dayNumbers.get(item.itinerary_day_id) ?? "—"}
              {item.location ? ` · ${item.location}` : ""}
            </p>
          </div>
        </div>
        <div className="mt-3 space-y-1 text-sm text-slate-700">{details}</div>
        {searchUrl && (
          <a
            href={searchUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-sky-700 hover:underline"
          >
            <ExternalLink className="size-3.5" />
            Open on MakeMyTrip
          </a>
        )}
        <BookingPaymentControl customerId={customerId} itineraryId={itinerary.id} item={item} />
      </article>
    );
  }

  return (
    <article className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
      <header className="mb-4">
        <h3 className="text-base font-semibold text-slate-900">
          {itinerary.title || itinerary.name || "Untitled itinerary"}
        </h3>
        <p className="mt-1 text-xs text-slate-500">
          {itinerary.travel_start_date ? formatDate(itinerary.travel_start_date) : "Dates not set"}
          {itinerary.travel_end_date ? ` – ${formatDate(itinerary.travel_end_date)}` : ""}
        </p>
      </header>
      <Tabs defaultValue="hotels" className="space-y-4">
        <TabsList className="h-auto flex-wrap justify-start gap-1 bg-slate-100 p-1">
          <TabsTrigger value="hotels">Hotels</TabsTrigger>
          <TabsTrigger value="flights">Flights</TabsTrigger>
          <TabsTrigger value="activities">Activities</TabsTrigger>
          <TabsTrigger value="others">Others</TabsTrigger>
        </TabsList>
        {[
          {
            value: "hotels",
            title: "Hotel bookings",
            empty: "No hotel bookings in this itinerary.",
            cards: hotels.map((item) =>
              renderCard(
                item,
                <>
                  <p>
                    {[item.hotel_city, item.hotel_country, item.hotel_address]
                      .filter(Boolean)
                      .join(", ") ||
                      item.location ||
                      "Location not set"}
                  </p>
                  <p>
                    {item.check_in ? formatDate(item.check_in) : "Check-in not set"}
                    {" → "}
                    {item.check_out ? formatDate(item.check_out) : "Check-out not set"}
                    {item.nights ? ` · ${item.nights} nights` : ""}
                  </p>
                  <p>
                    {[item.room_type, item.room_details, item.meal_plan]
                      .filter(Boolean)
                      .join(" · ") || "Room details not set"}
                  </p>
                  <p>
                    {[
                      item.rooms ? `${item.rooms} room(s)` : "",
                      item.adults != null ? `${item.adults} adults` : "",
                      item.children != null ? `${item.children} children` : "",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {item.hotel_description && <p>{item.hotel_description}</p>}
                  {item.customer_facing_info && <p>{item.customer_facing_info}</p>}
                </>,
                makeHotelSearchLink(item),
                item.hotel_name || item.title,
              ),
            ),
          },
          {
            value: "flights",
            title: "Flights",
            empty: "No flights in this itinerary.",
            cards: flights.map((item) =>
              renderCard(
                item,
                <>
                  <p>
                    {item.flight_airline || "Airline not set"}
                    {item.flight_number ? ` ${item.flight_number}` : ""}
                  </p>
                  <p>
                    {[
                      item.departure_city || item.departure_airport,
                      item.arrival_city || item.arrival_airport,
                    ]
                      .filter(Boolean)
                      .join(" → ") || "Route not set"}
                  </p>
                  <p>
                    {item.flight_departure_date
                      ? formatDate(item.flight_departure_date)
                      : "Departure date not set"}
                    {item.flight_departure_time ? ` · ${item.flight_departure_time}` : ""}
                    {" → "}
                    {item.flight_arrival_date
                      ? formatDate(item.flight_arrival_date)
                      : "Arrival date not set"}
                    {item.flight_arrival_time ? ` · ${item.flight_arrival_time}` : ""}
                  </p>
                  <p>
                    {[item.flight_cabin, item.flight_duration, item.baggage_information]
                      .filter(Boolean)
                      .join(" · ") || "Flight details not set"}
                    {item.flight_price != null
                      ? ` · ${item.flight_currency || "INR"} ${item.flight_price.toLocaleString("en-IN")}`
                      : ""}
                  </p>
                </>,
                makeFlightSearchLink(item),
              ),
            ),
          },
          {
            value: "activities",
            title: "Activities",
            empty: "No activities in this itinerary.",
            cards: activities.map((item) =>
              renderCard(
                item,
                <>
                  {item.description && <p>{item.description}</p>}
                  {item.duration && <p>Duration: {item.duration}</p>}
                  {item.departure_time && <p>Time: {item.departure_time}</p>}
                  {item.notes && <p>{item.notes}</p>}
                </>,
              ),
            ),
          },
          {
            value: "others",
            title: "Other bookings",
            empty: "No other bookings in this itinerary.",
            cards: otherItems.map((item) =>
              renderCard(
                item,
                <>
                  {item.description && <p>{item.description}</p>}
                  {(item.pickup || item.dropoff) && (
                    <p>
                      {[
                        item.pickup ? `From: ${item.pickup}` : "",
                        item.dropoff ? `To: ${item.dropoff}` : "",
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  )}
                  {(item.departure_time || item.arrival_time) && (
                    <p>
                      {item.departure_time || "Start time not set"}
                      {" → "}
                      {item.arrival_time || "End time not set"}
                    </p>
                  )}
                  {item.visa_country && <p>Country: {item.visa_country}</p>}
                  {item.visa_type && <p>Visa type: {item.visa_type}</p>}
                  {item.visa_customer_information && <p>{item.visa_customer_information}</p>}
                  {item.notes && <p>{item.notes}</p>}
                </>,
              ),
            ),
          },
        ].map((section) => (
          <TabsContent key={section.value} value={section.value} className="mt-0">
            <section className="space-y-3">
              <h4 className="text-sm font-semibold text-slate-800">{section.title}</h4>
              {section.cards.length > 0 ? (
                <div className="grid gap-3 lg:grid-cols-2">{section.cards}</div>
              ) : (
                <p className="text-sm text-slate-500">{section.empty}</p>
              )}
            </section>
          </TabsContent>
        ))}
      </Tabs>
    </article>
  );
}

export const Route = createFileRoute("/_authenticated/customers/$customerId")({
  head: () => ({
    meta: [
      { title: "Customer 360 — SAVR Travels CRM" },
      {
        name: "description",
        content: "Complete traveller profile: past leads, enquiries, bookings and payments.",
      },
      { property: "og:title", content: "Customer 360 — SAVR Travels CRM" },
      {
        property: "og:description",
        content: "Traveller history across leads, enquiries and bookings.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CustomerDetailPage,
});

function CustomerDetailPage() {
  const { customerId } = Route.useParams();
  const { data, isLoading, isError, error } = useCustomer(customerId);
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("overview");
  const assignedItineraries = data?.itineraries ?? [];
  const finalizedItineraries = assignedItineraries.filter(
    (itinerary) => itinerary.show_in_customer_bookings,
  );
  const finalizedItineraryIds = finalizedItineraries.map((itinerary) => itinerary.id);
  const [selectedItineraryIds, setSelectedItineraryIds] = useState<string[]>([]);
  const [savingItinerarySelection, setSavingItinerarySelection] = useState(false);
  const [itinerarySelectionError, setItinerarySelectionError] = useState<string | null>(null);
  const [activeBookingItineraryId, setActiveBookingItineraryId] = useState("");
  const [uploadedDocumentsOpen, setUploadedDocumentsOpen] = useState(false);

  useEffect(() => {
    const persistedSelection = (data?.itineraries ?? [])
      .filter((itinerary) => itinerary.show_in_customer_bookings)
      .map((itinerary) => itinerary.id);
    setSelectedItineraryIds(persistedSelection);
    setActiveBookingItineraryId((current) =>
      persistedSelection.includes(current) ? current : (persistedSelection[0] ?? ""),
    );
  }, [customerId, data?.itineraries]);

  const selectedSummaries = useQuery({
    queryKey: ["customer-selected-itinerary-summaries", finalizedItineraryIds],
    enabled: finalizedItineraryIds.length > 0,
    queryFn: async () => {
      const { data: days, error: daysError } = await supabase
        .from("itinerary_days")
        .select("id,itinerary_id,day_number")
        .in("itinerary_id", finalizedItineraryIds)
        .order("day_number", { ascending: true });
      if (daysError) throw daysError;
      const dayIds = (days ?? []).map((day) => day.id);
      if (dayIds.length === 0) return { days: [], items: [] };
      const { data: items, error: itemsError } = await supabase
        .from("itinerary_day_items")
        .select("*")
        .in("itinerary_day_id", dayIds)
        .order("sequence", { ascending: true });
      if (itemsError) throw itemsError;
      return { days: days ?? [], items: items ?? [] };
    },
  });

  if (isLoading) return <p className="text-sm text-slate-500">Loading customer…</p>;
  if (isError) {
    return (
      <p className="text-sm text-rose-700">
        Could not load customer details: {error instanceof Error ? error.message : "Unknown error"}
      </p>
    );
  }
  const customer = data?.customer;
  if (!customer) return <p className="text-sm text-slate-500">Customer not found.</p>;

  const primaryPhone = customer.whatsapp ?? customer.mobile ?? "—";
  const summaryDays = selectedSummaries.data?.days ?? [];
  const uploadedBookingDocuments = (selectedSummaries.data?.items ?? []).flatMap((item) => {
    const metadata = readItemMetadata(item.metadata);
    const day = summaryDays.find((entry) => entry.id === item.itinerary_day_id);
    const itinerary = finalizedItineraries.find((entry) => entry.id === day?.itinerary_id);
    if (!day || !itinerary) return [];
    const base = {
      itinerary,
      item,
      category: getBookingDocumentCategory(item),
      dayNumber: day.day_number,
      itineraryNumber: assignedItineraries.findIndex((entry) => entry.id === itinerary.id) + 1,
    };
    const bookingDocumentPath =
      typeof metadata["booking_document_path"] === "string"
        ? metadata["booking_document_path"]
        : typeof metadata["booking_pdf_path"] === "string"
          ? metadata["booking_pdf_path"]
          : typeof metadata["voucher_path"] === "string"
            ? metadata["voucher_path"]
            : null;
    const bookingDocumentName =
      typeof metadata["booking_document_name"] === "string"
        ? metadata["booking_document_name"]
        : typeof metadata["booking_pdf_name"] === "string"
          ? metadata["booking_pdf_name"]
          : typeof metadata["voucher_name"] === "string"
            ? metadata["voucher_name"]
            : item.title || "Booking document";
    const paymentProofPath =
      typeof metadata["payment_proof_path"] === "string" ? metadata["payment_proof_path"] : null;
    const paymentProofName =
      typeof metadata["payment_proof_name"] === "string"
        ? metadata["payment_proof_name"]
        : item.title || "Payment proof";

    return [
      ...(bookingDocumentPath
        ? [
            {
              ...base,
              path: bookingDocumentPath,
              name: bookingDocumentName,
              kind: "Booking document" as const,
            },
          ]
        : []),
      ...(paymentProofPath
        ? [
            {
              ...base,
              path: paymentProofPath,
              name: paymentProofName,
              kind: "Payment proof" as const,
            },
          ]
        : []),
    ];
  });

  async function saveItinerarySelection() {
    if (!data?.itinerarySelectionAvailable) {
      setItinerarySelectionError(
        "Finalised itinerary selection is unavailable until the CRM database is updated.",
      );
      return;
    }
    setSavingItinerarySelection(true);
    setItinerarySelectionError(null);
    try {
      const selectedIds = new Set(selectedItineraryIds);
      const updates = await Promise.all(
        assignedItineraries.map((itinerary) =>
          supabase
            .from("itineraries")
            .update({ show_in_customer_bookings: selectedIds.has(itinerary.id) })
            .eq("id", itinerary.id)
            .eq("customer_id", customerId),
        ),
      );
      const failedUpdate = updates.find((result) => result.error);
      if (failedUpdate?.error) throw failedUpdate.error;
      await queryClient.invalidateQueries({ queryKey: ["customer", customerId] });
      toast.success("Finalised itinerary selection saved");
    } catch (saveError) {
      const message =
        saveError instanceof Error
          ? saveError.message
          : "Could not save the finalised itinerary selection.";
      setItinerarySelectionError(message);
      toast.error(message);
    } finally {
      setSavingItinerarySelection(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link
          to="/customers"
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="size-4" />
          Back to customers
        </Link>

        <div className="flex items-center gap-2">
          {primaryPhone !== "—" ? (
            <WacrmContactMatchLink
              recordType="customer"
              recordId={customer.id}
              trigger={
                <>
                  <MessageSquareText className="size-4" />
                  WhatsApp
                </>
              }
            />
          ) : null}

          <NewCustomerDialog
            record={customer}
            trigger={
              <Button size="sm" variant="outline" className="gap-2">
                <Edit3 className="size-4" />
                Edit
              </Button>
            }
          />
          <CustomerDeleteButton
            customerId={customer.id}
            name={customer.full_name || "this customer"}
          />
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Customer
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
              {customer.full_name}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-slate-600">
              {primaryPhone !== "—" ? (
                <span className="inline-flex items-center gap-1.5">
                  <Phone className="size-3.5" />
                  {primaryPhone}
                </span>
              ) : null}
              {customer.email ? (
                <span className="inline-flex items-center gap-1.5">
                  <MessageSquareText className="size-3.5" />
                  {customer.email}
                </span>
              ) : null}
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-700">
              {customer.code ?? "Customer"}
            </span>
          </div>
        </div>
      </div>

      <WacrmContactMatchLink recordType="customer" recordId={customer.id} />

      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="h-auto gap-1 bg-slate-100 p-1">
          <TabsTrigger value="overview" className="rounded-md px-3 py-1.5 text-sm">
            Overview
          </TabsTrigger>
          <TabsTrigger value="leads" className="rounded-md px-3 py-1.5 text-sm">
            Leads
          </TabsTrigger>
          <TabsTrigger value="enquiries" className="rounded-md px-3 py-1.5 text-sm">
            Enquiries
          </TabsTrigger>
          <TabsTrigger value="bookings" className="rounded-md px-3 py-1.5 text-sm">
            Bookings
          </TabsTrigger>
          <TabsTrigger value="itineraries" className="rounded-md px-3 py-1.5 text-sm">
            Itineraries
          </TabsTrigger>
          <TabsTrigger value="payments" className="rounded-md px-3 py-1.5 text-sm">
            Payments
          </TabsTrigger>
          <TabsTrigger value="requirements" className="rounded-md px-3 py-1.5 text-sm">
            Requirements
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === "overview" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">Customer information</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500">Name</p>
                <p className="mt-1 text-sm text-slate-900">{customer.full_name}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500">Phone</p>
                <p className="mt-1 text-sm text-slate-900">{customer.mobile ?? "—"}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500">WhatsApp</p>
                <p className="mt-1 text-sm text-slate-900">{customer.whatsapp ?? "—"}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500">Email</p>
                <p className="mt-1 text-sm text-slate-900">{customer.email ?? "—"}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500">Location</p>
                <p className="mt-1 text-sm text-slate-900">
                  {[customer.city, customer.state, customer.country].filter(Boolean).join(", ") ||
                    "—"}
                </p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500">Passport</p>
                <p className="mt-1 text-sm text-slate-900">{customer.passport_number ?? "—"}</p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">Travel information</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500">Lead count</p>
                <p className="mt-1 text-sm text-slate-900">{data?.leads?.length ?? 0}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500">
                  Enquiry count
                </p>
                <p className="mt-1 text-sm text-slate-900">{data?.enquiries?.length ?? 0}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500">
                  Booking count
                </p>
                <p className="mt-1 text-sm text-slate-900">{data?.bookings?.length ?? 0}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500">
                  Lifetime value
                </p>
                <p className="mt-1 text-sm text-slate-900">
                  {formatMoney(
                    (data?.payments ?? [])
                      .filter((p) => p.direction === "inbound")
                      .reduce((sum, p) => sum + Number(p.amount ?? 0), 0),
                  )}
                </p>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-2">
            <h2 className="text-sm font-semibold text-slate-900">Travel requirements</h2>
            <div className="mt-4">
              <FlowRequirementList
                requirements={data?.requirements ?? []}
                emptyMessage="No completed WACRM flows have been recorded for this customer."
              />
            </div>
          </div>
        </div>
      )}

      {tab === "requirements" && (
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Completed flow requirements</h2>
          <div className="mt-4">
            <FlowRequirementList
              requirements={data?.requirements ?? []}
              emptyMessage="No completed WACRM flows have been recorded for this customer."
            />
          </div>
        </section>
      )}

      {tab === "leads" && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          {(data?.leads ?? []).length === 0 ? (
            <p className="text-sm text-slate-500">No leads yet.</p>
          ) : (
            <div className="space-y-3">
              {(data?.leads ?? []).map((lead) => (
                <Link
                  key={lead.id}
                  to="/leads/$leadId"
                  params={{ leadId: lead.id }}
                  className="block rounded-lg border border-slate-200 p-3 transition-colors hover:bg-slate-50"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-slate-900">
                        {lead.destination_text ?? lead.code}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">{formatDate(lead.lead_date)}</p>
                    </div>
                    <StatusBadge status={lead.status} />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "enquiries" && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          {(data?.enquiries ?? []).length === 0 ? (
            <p className="text-sm text-slate-500">No enquiries yet.</p>
          ) : (
            <div className="space-y-3">
              {(data?.enquiries ?? []).map((enquiry) => (
                <div key={enquiry.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-slate-900">{enquiry.code}</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {enquiry.destinations?.name ?? "Destination pending"}
                      </p>
                    </div>
                    <StatusBadge status={enquiry.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "bookings" && (
        <div className="space-y-4">
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">
                  Finalised itinerary bookings
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Bookings for the itineraries selected as finalised in the Itineraries tab.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={selectedSummaries.isLoading || uploadedBookingDocuments.length === 0}
                onClick={() => setUploadedDocumentsOpen((open) => !open)}
              >
                {uploadedDocumentsOpen ? "Hide uploaded documents" : "View uploaded documents"}
                {uploadedBookingDocuments.length > 0 ? ` (${uploadedBookingDocuments.length})` : ""}
              </Button>
            </div>
            {uploadedDocumentsOpen && !selectedSummaries.isLoading && (
              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <h3 className="mb-3 text-sm font-semibold text-slate-900">
                  Uploaded booking documents and payment proofs
                </h3>
                <UploadedBookingDocuments documents={uploadedBookingDocuments} />
              </div>
            )}
            {finalizedItineraries.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500">No finalised itineraries selected yet.</p>
            ) : selectedSummaries.isLoading ? (
              <p className="mt-4 text-sm text-slate-500">Loading itinerary bookings…</p>
            ) : selectedSummaries.isError ? (
              <p className="mt-4 text-sm text-rose-700" role="alert">
                Could not load itinerary bookings:{" "}
                {selectedSummaries.error instanceof Error
                  ? selectedSummaries.error.message
                  : "Unknown error"}
              </p>
            ) : (
              <Tabs
                value={activeBookingItineraryId || finalizedItineraryIds[0] || ""}
                onValueChange={setActiveBookingItineraryId}
                className="mt-4"
              >
                <TabsList className="h-auto flex-wrap justify-start gap-1 bg-slate-100 p-1">
                  {finalizedItineraries.map((itinerary) => {
                    const assignedIndex = assignedItineraries.findIndex(
                      (entry) => entry.id === itinerary.id,
                    );
                    return (
                      <TabsTrigger
                        key={itinerary.id}
                        value={itinerary.id}
                        className="rounded-md px-3 py-1.5 text-sm"
                      >
                        Assigned itinerary {assignedIndex + 1}
                      </TabsTrigger>
                    );
                  })}
                </TabsList>
                {finalizedItineraries.map((itinerary) => (
                  <TabsContent key={itinerary.id} value={itinerary.id} className="pt-4">
                    <ItinerarySummaryCards
                      customerId={customer.id}
                      itinerary={itinerary}
                      days={(selectedSummaries.data?.days ?? []).filter(
                        (day) => day.itinerary_id === itinerary.id,
                      )}
                      items={(selectedSummaries.data?.items ?? []).filter((item) =>
                        (selectedSummaries.data?.days ?? [])
                          .filter((day) => day.itinerary_id === itinerary.id)
                          .some((day) => day.id === item.itinerary_day_id),
                      )}
                    />
                  </TabsContent>
                ))}
              </Tabs>
            )}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">Bookings</h2>
            {(data?.bookings ?? []).length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">No bookings yet.</p>
            ) : (
              <div className="mt-3 space-y-3">
                {(data?.bookings ?? []).map((booking) => (
                  <div key={booking.id} className="rounded-lg border border-slate-200 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-slate-900">{booking.code}</p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {formatDate(booking.travel_start)} → {formatDate(booking.travel_end)}
                        </p>
                      </div>
                      <StatusBadge status={booking.status} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {tab === "itineraries" && (
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Customer itineraries</h2>
              <p className="mt-1 text-xs text-slate-500">
                Itinerary copies assigned to {customer.full_name}.
              </p>
            </div>
            <Button size="sm" variant="outline" asChild>
              <Link to="/itinerary-builder" search={{ customerId: customer.id }}>
                Create itinerary
              </Link>
            </Button>
          </div>
          {(data?.itineraries ?? []).length === 0 ? (
            <p className="text-sm text-slate-500">No itineraries assigned to this customer yet.</p>
          ) : (
            <div className="space-y-3">
              {(data?.itineraries ?? []).map((itinerary, index) => (
                <AssignedItineraryCard
                  key={itinerary.id}
                  itinerary={itinerary}
                  index={index}
                  customerId={customer.id}
                  customerName={customer.full_name}
                  phoneNumber={customer.whatsapp ?? customer.mobile}
                  onDeleted={() =>
                    queryClient.invalidateQueries({ queryKey: ["customer", customerId] })
                  }
                />
              ))}
            </div>
          )}
          <section className="mt-6 border-t border-slate-200 pt-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Select finalised itinerary</h3>
                <p className="mt-1 text-xs text-slate-500">
                  Choose which assigned itineraries should appear in the Bookings tab.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                onClick={() => void saveItinerarySelection()}
                disabled={
                  savingItinerarySelection ||
                  !data.itinerarySelectionAvailable ||
                  assignedItineraries.length === 0
                }
              >
                {savingItinerarySelection ? "Saving…" : "Save selection"}
              </Button>
            </div>
            {!data.itinerarySelectionAvailable && (
              <p className="mb-3 text-sm text-amber-700" role="status">
                Finalised itinerary selection is unavailable until the CRM database is updated.
              </p>
            )}
            {itinerarySelectionError && (
              <p className="mb-3 text-sm text-rose-700" role="alert">
                Could not save selection: {itinerarySelectionError}
              </p>
            )}
            {assignedItineraries.length === 0 ? (
              <p className="text-sm text-slate-500">
                Assign an itinerary before choosing a finalised itinerary.
              </p>
            ) : (
              <div className="space-y-2">
                {assignedItineraries.map((itinerary, index) => (
                  <label
                    key={itinerary.id}
                    className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-3 hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      aria-label={`Select Assigned itinerary ${index + 1} as finalised`}
                      checked={selectedItineraryIds.includes(itinerary.id)}
                      disabled={!data.itinerarySelectionAvailable || savingItinerarySelection}
                      onChange={(event) => {
                        setSelectedItineraryIds((current) =>
                          event.target.checked
                            ? [...new Set([...current, itinerary.id])]
                            : current.filter((id) => id !== itinerary.id),
                        );
                        setItinerarySelectionError(null);
                      }}
                      className="mt-1 size-4 shrink-0 accent-slate-900"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-slate-900">
                        Assigned itinerary {index + 1}:{" "}
                        {itinerary.title ?? itinerary.name ?? "Untitled itinerary"}
                      </span>
                      <span className="mt-1 block text-xs text-slate-500">
                        {itinerary.destinations?.name ?? "Destination pending"}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            )}
          </section>
        </section>
      )}

      {tab === "payments" && (
        <Tabs defaultValue="to-suppliers" className="w-full">
          <TabsList className="mb-4 h-auto gap-1 bg-slate-100 p-1">
            <TabsTrigger value="to-suppliers" className="rounded-md px-3 py-1.5 text-sm">
              Payments to Suppliers
            </TabsTrigger>
            <TabsTrigger value="from-customers" className="rounded-md px-3 py-1.5 text-sm">
              Payments from Customers
            </TabsTrigger>
          </TabsList>
          {[
            { value: "to-suppliers", direction: "outbound" },
            { value: "from-customers", direction: "inbound" },
          ].map(({ value, direction }) => {
            const payments = (data?.payments ?? []).filter(
              (payment) => payment.direction === direction,
            );
            return (
              <TabsContent key={value} value={value} className="mt-0">
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  {payments.length === 0 ? (
                    <p className="text-sm text-slate-500">No payments recorded.</p>
                  ) : (
                    <div className="space-y-3">
                      {payments.map((payment) => (
                        <div
                          key={payment.id}
                          className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3"
                        >
                          <div>
                            <p className="text-sm font-medium text-slate-900">
                              {formatMoney(payment.amount, payment.currency ?? "INR")}
                            </p>
                            <p className="mt-0.5 text-xs text-slate-500">
                              {formatDate(payment.paid_on)} · {titleize(payment.method)}
                            </p>
                          </div>
                          <StatusBadge status={payment.status} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </TabsContent>
            );
          })}
        </Tabs>
      )}
    </div>
  );
}
