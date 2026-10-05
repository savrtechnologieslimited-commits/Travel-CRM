import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { FileUp, Plane, Sparkles, ImagePlus, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { extractItineraryFromSupplierDocumentFn } from "@/lib/ai-supplier-itinerary-import";
import { generateLeadItineraryPromptFn } from "@/lib/ai-lead-prompt";

async function fileToBase64(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

export function LeadProposalComposer({
  lead,
}: {
  lead: { id: string; destination: string | null; travelStart: string | null; travelEnd: string | null };
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("ai");
  const [instructions, setInstructions] = useState(() => lead.destination ? `${lead.destination}${lead.travelStart ? ` · ${lead.travelStart} to ${lead.travelEnd ?? ""}` : ""}` : "");
  const [supplierText, setSupplierText] = useState("");
  const [supplierFile, setSupplierFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const generate = useServerFn(generateLeadItineraryPromptFn);
  const extractSupplier = useServerFn(extractItineraryFromSupplierDocumentFn);
  const builderHref = `/itinerary-builder?leadId=${encodeURIComponent(lead.id)}`;

  async function generatePlan() {
    if (!instructions.trim()) {
      toast.error("Describe the itinerary you want to prepare.");
      return;
    }
    setBusy(true);
    try {
      const result = await generate({ data: { leadId: lead.id, prompt: instructions.trim() } });
      sessionStorage.setItem("itinerary-ai-draft", JSON.stringify(result));
      window.location.assign(`/itinerary-builder?aiDraft=1&leadId=${encodeURIComponent(lead.id)}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to generate the itinerary.");
      setBusy(false);
    }
  }

  async function importSupplierPlan() {
    if (!supplierFile && !supplierText.trim()) {
      toast.error("Upload a supplier plan or paste its text first.");
      return;
    }
    setBusy(true);
    try {
      const result = await extractSupplier({
        data: supplierFile
          ? {
              destinationText: lead.destination ?? undefined,
              fileName: supplierFile.name,
              mimeType: supplierFile.type || "application/octet-stream",
              fileBase64: await fileToBase64(supplierFile),
            }
          : { sourceText: supplierText, destinationText: lead.destination ?? undefined },
      });
      sessionStorage.setItem("itinerary-supplier-draft", JSON.stringify(result));
      window.location.assign(`/itinerary-builder?supplierDraft=1&leadId=${encodeURIComponent(lead.id)}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to import the supplier plan.");
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-slate-600 hover:text-sky-700" aria-label="Create and send proposal" title="Create and send proposal">
          <Sparkles className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] overflow-y-auto p-2 sm:max-w-2xl">
        <DialogHeader className="px-2 pt-2">
          <DialogTitle>Prepare proposal{lead.destination ? ` · ${lead.destination}` : ""}</DialogTitle>
          <DialogDescription>
            Start with an AI day plan, a supplier itinerary, or continue to a quote workspace. Travel dates: {lead.travelStart || "TBD"} – {lead.travelEnd || "TBD"}.
          </DialogDescription>
        </DialogHeader>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="flex h-auto w-full justify-start gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1">
            <TabsTrigger value="ai" className="shrink-0 rounded-lg">AI Day Plan</TabsTrigger>
            <TabsTrigger value="land" className="shrink-0 rounded-lg">Quote - LandPackage</TabsTrigger>
            <TabsTrigger value="flights" className="shrink-0 rounded-lg">Quote - Flights</TabsTrigger>
            <TabsTrigger value="rates" className="shrink-0 rounded-lg" disabled title="Rates import is not available yet">Import Rates</TabsTrigger>
          </TabsList>

          <TabsContent value="ai" className="space-y-3 pt-2">
            <label className="flex cursor-pointer items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300">
              <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-500"><Upload className="size-5" /></span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-slate-700">{supplierFile?.name ?? "Upload supplier plan"}</span>
                <span className="mt-1 block text-sm text-slate-400">PDF, DOCX, or TXT</span>
              </span>
              <input type="file" accept=".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown" className="sr-only" onChange={(event) => setSupplierFile(event.target.files?.[0] ?? null)} />
              <FileUp className="size-4 text-slate-400" />
            </label>
            <Textarea
              value={supplierText || instructions}
              onChange={(event) => {
                if (supplierFile) setSupplierText(event.target.value);
                else setInstructions(event.target.value);
              }}
              placeholder={lead.destination ? `${lead.destination} — describe nights, cities, pace, and client preferences` : "Describe destination, nights, cities, and client preferences"}
              className="min-h-[190px] resize-y rounded-xl border-slate-200 bg-white text-base"
              aria-label="Itinerary instructions or supplier plan text"
            />
            {supplierFile && <p className="px-1 text-xs text-slate-500">A selected supplier file will be imported and reviewed instead of generating from the text above.</p>}
            <Button className="h-12 w-full rounded-xl bg-[#151515] text-base font-semibold text-white hover:bg-black" disabled={busy} onClick={() => void (supplierFile ? importSupplierPlan() : generatePlan())}>
              {busy ? <><Sparkles className="mr-2 size-4 animate-pulse" />Preparing…</> : supplierFile ? "Import supplier plan" : "Generate itinerary using AI"}
            </Button>
            <Button variant="outline" className="h-12 w-full rounded-xl border-slate-200 bg-[#151515] text-base font-semibold text-white hover:bg-black hover:text-white" disabled title="AI photo generation is not configured yet">
              <ImagePlus className="mr-2 size-4" />Generate photos for itinerary using AI
            </Button>
          </TabsContent>

          <TabsContent value="land" className="space-y-4 pt-4">
            <div className="rounded-xl border bg-slate-50 p-4">
              <h3 className="font-semibold">Land package quote</h3>
              <p className="mt-1 text-sm text-muted-foreground">Build the itinerary and package options for this lead, then create a secure customer-facing share link.</p>
            </div>
            <Button asChild className="w-full"><a href={builderHref}>Open land package itinerary builder</a></Button>
          </TabsContent>

          <TabsContent value="flights" className="space-y-4 pt-4">
            <div className="rounded-xl border bg-slate-50 p-4">
              <div className="flex items-center gap-2 font-semibold"><Plane className="size-4" />Flight / Visa / Other proposal</div>
              <p className="mt-1 text-sm text-muted-foreground">Continue to the proposal and quotation workspace to add flight, visa, or other services for this lead.</p>
            </div>
            <Button asChild className="w-full"><a href={`/quotations?leadId=${encodeURIComponent(lead.id)}`}>Open proposal workspace</a></Button>
          </TabsContent>

          <TabsContent value="rates" className="pt-4">
            <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Rates import is not available yet.</p>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
