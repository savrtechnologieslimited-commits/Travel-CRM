import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Copy, ExternalLink, FilePlus2, Plane, Send, Share2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { formatDate } from "@/lib/crm";
import { createItineraryShareFn } from "@/lib/itinerary-share";
import { ensureConversation } from "@/lib/whatsapp-data";
import { sendWhatsAppMessageFn } from "@/lib/whatsapp-send";

 type AssignedProposal = {
  id: string;
  title: string | null;
  name?: string | null;
  travel_start_date?: string | null;
  travel_end_date?: string | null;
  travel_start?: string | null;
  travel_end?: string | null;
  created_at: string;
  destination_id?: string | null;
  destinations?: { name?: string | null } | null;
  code?: string | null;
};

export function LeadSendProposalDialog({
  lead,
}: {
  lead: {
    id: string;
    customer_name: string;
    email: string | null;
    mobile: string | null;
    destination_text: string | null;
    travel_start: string | null;
    travel_end: string | null;
  };
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"package" | "other">("package");
  const [finalItineraryId, setFinalItineraryId] = useState("");
  const [selectedPackageId, setSelectedPackageId] = useState("");
  const [shareUrl, setShareUrl] = useState("");
  const [sharing, setSharing] = useState(false);
  const [whatsappSending, setWhatsappSending] = useState(false);
  const createShare = useServerFn(createItineraryShareFn);
  const sendWhatsApp = useServerFn(sendWhatsAppMessageFn);

  const itinerariesQuery = useQuery({
    queryKey: ["lead-proposal-itineraries", lead.id],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("itineraries")
        .select("id,title,name,travel_start_date,travel_end_date,created_at,destination_id,destinations(name)")
        .eq("lead_id", lead.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as AssignedProposal[];
    },
  });

  const quotationsQuery = useQuery({
    queryKey: ["lead-proposal-quotations", lead.id],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotations")
        .select("id,title,code,travel_start,travel_end,created_at,destination_id,destinations(name)")
        .eq("lead_id", lead.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as AssignedProposal[];
    },
  });

  const packageQuery = useQuery({
    queryKey: ["lead-proposal-packages", finalItineraryId],
    enabled: open && Boolean(finalItineraryId) && tab === "package",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("itinerary_package_options")
        .select("id,name,description,sequence")
        .eq("itinerary_id", finalItineraryId)
        .eq("is_active", true)
        .order("sequence", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const itineraries = itinerariesQuery.data ?? [];
  const quotations = quotationsQuery.data ?? [];
  const packages = packageQuery.data ?? [];
  const selectedItinerary = itineraries.find((itinerary) => itinerary.id === finalItineraryId);
  const selectedPackage = packages.find((option) => option.id === selectedPackageId);
  const selectedQuotation = useMemo(() => quotations[0] ?? null, [quotations]);

  useEffect(() => {
    if (!open) return;
    setFinalItineraryId("");
    setSelectedPackageId("");
    setShareUrl("");
  }, [open]);

  useEffect(() => {
    if (packages.length === 1) setSelectedPackageId(packages[0]!.id);
    else if (!packages.some((option) => option.id === selectedPackageId)) setSelectedPackageId("");
  }, [packages, selectedPackageId]);

  async function generateShareLink(itineraryId: string, packageId: string | null) {
    setSharing(true);
    setShareUrl("");
    try {
      const result = await createShare({ data: { itineraryId, packageId, expiresInDays: 14 } });
      const url = `${window.location.origin}/itinerary-share/${encodeURIComponent(result.token)}`;
      setShareUrl(url);
      await navigator.clipboard?.writeText(url).catch(() => undefined);
      toast.success("Proposal link created and copied");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create the proposal link.");
    } finally {
      setSharing(false);
    }
  }

  function emailProposal() {
    if (!shareUrl) return;
    const subject = encodeURIComponent(`Travel proposal — ${lead.destination_text ?? "Your trip"}`);
    const body = encodeURIComponent(`Hello ${lead.customer_name},\n\nPlease review your travel proposal here:\n${shareUrl}\n\nRegards,\nSAVR Travels`);
    window.location.href = `mailto:${lead.email ?? ""}?subject=${subject}&body=${body}`;
  }

  async function whatsappProposal() {
    if (!shareUrl) return;
    if (!lead.mobile) {
      toast.error("Add a WhatsApp number for this lead first.");
      return;
    }
    setWhatsappSending(true);
    try {
      const conversationId = await ensureConversation({ phone_number: lead.mobile, lead_id: lead.id });
      const result = await sendWhatsApp({
        data: {
          conversationId,
          payload: { type: "text", text: `Hello ${lead.customer_name}, please review your travel proposal: ${shareUrl}` },
        },
      });
      toast.success(result.mode === "meta" ? "Meta accepted the proposal message for sending" : "Proposal message queued locally");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "WhatsApp could not send the proposal message.");
    } finally {
      setWhatsappSending(false);
    }
  }

  const createItineraryHref = `/itinerary-builder?leadId=${encodeURIComponent(lead.id)}`;
  const createProposalHref = `/quotations?leadId=${encodeURIComponent(lead.id)}`;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-slate-600 hover:text-sky-700" aria-label="Open existing proposals" title="Open existing proposals">
          <Sparkles className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Send proposal to {lead.customer_name}</DialogTitle>
          <DialogDescription>Choose an itinerary or proposal linked to this lead, select a package if applicable, then share its secure client link.</DialogDescription>
        </DialogHeader>
        <Tabs value={tab} onValueChange={(value) => { setTab(value as "package" | "other"); setShareUrl(""); }}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="package">Package Itineraries ({itineraries.length})</TabsTrigger>
            <TabsTrigger value="other">Flight / Visa / Other ({quotations.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="package" className="space-y-4 pt-3">
            <Card className="space-y-2 bg-slate-50 p-4">
              <p className="font-semibold">Finalised itinerary</p>
              <Select value={finalItineraryId} onValueChange={(value) => { setFinalItineraryId(value); setShareUrl(""); }}>
                <SelectTrigger><SelectValue placeholder="Select an itinerary option" /></SelectTrigger>
                <SelectContent>
                  {itineraries.map((itinerary) => (
                    <SelectItem key={itinerary.id} value={itinerary.id}>
                      {itinerary.destinations?.name ?? itinerary.name ?? itinerary.title ?? "Itinerary"} · {formatDate(itinerary.travel_start_date)} – {formatDate(itinerary.travel_end_date)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!itinerariesQuery.isLoading && itineraries.length === 0 && <p className="text-sm text-muted-foreground">No itinerary assigned to this lead yet.</p>}
            </Card>
            {selectedItinerary && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-black p-4 text-white">
                <div>
                  <p className="text-lg font-semibold">{selectedItinerary.destinations?.name ?? selectedItinerary.name ?? selectedItinerary.title ?? "Travel itinerary"}</p>
                  <p className="text-xs text-white/70">Created {formatDate(selectedItinerary.created_at)}</p>
                </div>
                <Button variant="secondary" size="sm" asChild>
                  <a href={`/itinerary-builder?itineraryId=${encodeURIComponent(selectedItinerary.id)}`} target="_blank" rel="noreferrer"><ExternalLink className="mr-2 size-4" />Open</a>
                </Button>
              </div>
            )}
            {selectedItinerary && packages.length > 0 && (
              <div className="space-y-2">
                <Label>Package option</Label>
                <Select value={selectedPackageId} onValueChange={setSelectedPackageId}>
                  <SelectTrigger><SelectValue placeholder="Select package" /></SelectTrigger>
                  <SelectContent>{packages.map((option) => <SelectItem key={option.id} value={option.id}>{option.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            <div className="flex flex-wrap justify-between gap-2">
              <Button variant="outline" asChild><a href={createItineraryHref}><FilePlus2 className="mr-2 size-4" />Create new itinerary</a></Button>
              <Button disabled={!selectedItinerary || (packages.length > 0 && !selectedPackageId) || sharing} onClick={() => void generateShareLink(selectedItinerary!.id, selectedPackageId || null)}>
                {sharing ? "Preparing…" : "Prepare package proposal"}
              </Button>
            </div>
          </TabsContent>
          <TabsContent value="other" className="space-y-4 pt-3">
            <Card className="space-y-3 p-4">
              <div className="flex items-center gap-2"><Plane className="size-4 text-slate-500" /><p className="font-semibold">Assigned Flight / Visa / Other Proposals</p></div>
              {quotationsQuery.isLoading && <p className="text-sm text-muted-foreground">Loading proposals…</p>}
              {!quotationsQuery.isLoading && quotations.length === 0 && <p className="text-sm text-muted-foreground">No proposal is linked to this lead yet.</p>}
              {selectedQuotation && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
                  <div><p className="font-medium">{selectedQuotation.title}</p><p className="text-xs text-muted-foreground">{selectedQuotation.code ?? "Proposal"} · {formatDate(selectedQuotation.travel_start)} – {formatDate(selectedQuotation.travel_end)}</p></div>
                  <Button variant="outline" size="sm" asChild><a href={`/quotations/${encodeURIComponent(selectedQuotation.id)}`} target="_blank" rel="noreferrer"><ExternalLink className="mr-2 size-4" />Open</a></Button>
                </div>
              )}
            </Card>
            <div className="flex justify-between gap-2">
              <Button variant="outline" asChild><a href={createProposalHref}><FilePlus2 className="mr-2 size-4" />Create new proposal</a></Button>
              <Button disabled={!selectedQuotation || sharing} onClick={() => toast.info("Open the quotation and use its customer PDF/share workflow to send this proposal.")}>
                <Send className="mr-2 size-4" />Send proposal
              </Button>
            </div>
          </TabsContent>
        </Tabs>
        {shareUrl && (
          <Card className="space-y-3 border-teal-200 bg-teal-50/60 p-4">
            <p className="text-sm font-semibold text-teal-950">Secure client proposal link · expires in 14 days</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input aria-label="Proposal share link" readOnly value={shareUrl} className="h-10 min-w-0 flex-1 rounded-md border bg-white px-3 text-sm" />
              <Button variant="outline" onClick={() => void navigator.clipboard?.writeText(shareUrl)}><Copy className="mr-2 size-4" />Copy link</Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {lead.email && <Button size="sm" variant="outline" onClick={emailProposal}>Email client</Button>}
              {lead.mobile && <Button size="sm" variant="outline" onClick={() => void whatsappProposal()} disabled={whatsappSending}>{whatsappSending ? "Sending…" : "WhatsApp client"}</Button>}
              <Button size="sm" variant="ghost" asChild><a href={shareUrl} target="_blank" rel="noreferrer"><ExternalLink className="mr-2 size-4" />Preview</a></Button>
            </div>
          </Card>
        )}
      </DialogContent>
    </Dialog>
  );
}
