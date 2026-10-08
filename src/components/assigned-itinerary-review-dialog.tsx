import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Eye, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { buildPublicItineraryShareUrl, createItineraryShareFn } from "@/lib/itinerary-share";

export function AssignedItineraryReviewDialog({
  itineraryId,
  title,
}: {
  itineraryId: string;
  title: string;
}) {
  const createShare = useServerFn(createItineraryShareFn);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");

  async function openReview() {
    setOpen(true);
    setLoading(true);
    setPreviewUrl("");
    try {
      const result = await createShare({
        data: { itineraryId, expiresInDays: 30 },
      });
      setPreviewUrl(buildPublicItineraryShareUrl(window.location.origin, result.token));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to open the itinerary preview.";
      toast.error(message);
      setOpen(false);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={() => void openReview()}>
        <Eye className="mr-1.5 size-4" />
        Review
      </Button>
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (!nextOpen) setPreviewUrl("");
        }}
      >
        <DialogContent className="flex h-[92vh] max-h-[94vh] w-[calc(100vw-1rem)] max-w-6xl flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="shrink-0 border-b border-slate-200 px-6 py-4 pr-12 text-left">
            <DialogTitle>Itinerary Preview &amp; Send</DialogTitle>
            <DialogDescription>{title}</DialogDescription>
          </DialogHeader>
          {loading || !previewUrl ? (
            <div className="flex min-h-0 flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
              <LoaderCircle className="size-4 animate-spin" />
              Preparing itinerary preview…
            </div>
          ) : (
            <iframe
              key={previewUrl}
              title={`${title} itinerary preview`}
              src={previewUrl}
              className="min-h-0 w-full flex-1 border-0 bg-white"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
