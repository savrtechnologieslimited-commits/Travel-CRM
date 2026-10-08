import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Copy, Pencil, Share2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatDate } from "@/lib/crm";
import { buildPublicItineraryShareUrl, createItineraryShareFn } from "@/lib/itinerary-share";
import { supabase } from "@/integrations/supabase/client";
import { AssignedItineraryReviewDialog } from "@/components/assigned-itinerary-review-dialog";
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
import { Link } from "@tanstack/react-router";

type LeadItinerary = {
  id: string;
  title: string | null;
  name: string;
  status: string;
  travel_start_date: string | null;
  travel_end_date: string | null;
  lead_id: string | null;
  customer_id: string | null;
  destinations: { name: string | null } | null;
};

export function LeadItineraryCard({
  itinerary,
  index,
  leadId,
  customerId,
  customerName,
  phoneNumber,
  onDeleted,
}: {
  itinerary: LeadItinerary;
  index: number;
  leadId: string;
  customerId: string | null;
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
    if (!window.confirm(`Delete "${title}" from this lead? This cannot be undone.`)) return;
    const isLeadItinerary = itinerary.lead_id === leadId;
    if (!isLeadItinerary && (!customerId || itinerary.customer_id !== customerId)) {
      toast.error("This itinerary is not assigned to this lead or its customer.");
      return;
    }

    setDeleting(true);
    try {
      let readQuery = supabase.from("itineraries").select("document_path").eq("id", itinerary.id);
      readQuery = isLeadItinerary
        ? readQuery.eq("lead_id", leadId)
        : readQuery.eq("customer_id", customerId!);
      const { data: current, error: readError } = await readQuery.maybeSingle();
      if (readError) throw readError;
      if (!current) throw new Error("This assigned itinerary could not be found.");

      if (current.document_path) {
        const { error: storageError } = await supabase.storage
          .from("itineraries")
          .remove([current.document_path]);
        if (storageError) throw storageError;
      }

      let deleteQuery = supabase.from("itineraries").delete().eq("id", itinerary.id);
      deleteQuery = isLeadItinerary
        ? deleteQuery.eq("lead_id", leadId)
        : deleteQuery.eq("customer_id", customerId!);
      const { error: deleteError } = await deleteQuery;
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
                  leadId,
                  customerId,
                  phoneNumber,
                  customerName,
                  destination: itinerary.destinations?.name ?? null,
                }}
                initialMessage={`Hi ${customerName}, here is your itinerary preview: ${shareUrl}`}
                trigger={
                  <Button type="button" variant="outline">
                    Share on WhatsApp
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
