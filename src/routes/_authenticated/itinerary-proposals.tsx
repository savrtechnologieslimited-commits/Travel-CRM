import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Bookmark, Copy, Edit3, Eye, FileText, FolderOpen, Plus, Search, Sparkles, Trash2, UserPlus } from "lucide-react";
import { dedupeItineraryDraftRows, useDeleteItineraryDraft, useItineraryDraftWorkspaceRows, useItineraryWorkspaceRows, type ItineraryDraftWorkspaceRow, type ItineraryWorkspaceRow } from "@/lib/data";
import { formatDate } from "@/lib/crm";
import { shiftIsoDate, totalCityStayNights } from "@/lib/itinerary-day-dates";
import { PageHeader } from "@/components/app-shell";
import { QUICK_ITINERARY_REQUEST_EVENT } from "@/lib/quick-itinerary";
import { DestinationInput } from "@/components/destination-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/itinerary-proposals")({
  head: () => ({
    meta: [
      { title: "Create Itinerary/Proposal — SAVR Travels CRM" },
      { name: "description", content: "Create and open structured travel itineraries and proposals." },
    ],
  }),
  component: ItineraryProposalsPage,
});

export const PROPOSAL_TABS = [
  { value: "package", label: "Package Itinerary", disabled: false },
  { value: "other", label: "Flight/Visa/Other Proposal", disabled: false },
  { value: "b2b", label: "B2B Proposal", disabled: true },
] as const;

export const ITINERARY_WORKSPACE_COLUMNS = [
  "Itinerary ID",
  "Destination/Title",
  "Version",
  "Travel Dates",
  "Adults",
  "Children",
  "Created By",
  "Created At",
  "Customer/Lead",
  "Actions",
] as const;

export const CREATE_ITINERARY_HREF = "/itinerary-builder";

export function getItineraryDisplayTitle(itinerary: ItineraryWorkspaceRow) {
  const title = itinerary.title ?? itinerary.name ?? "Untitled itinerary";
  return itinerary.destinations?.name ? `${itinerary.destinations.name} - ${title}` : title;
}

export function getItineraryTravelDates(itinerary: ItineraryWorkspaceRow) {
  return itinerary.travel_start_date || itinerary.travel_end_date
    ? `${itinerary.travel_start_date ? formatDate(itinerary.travel_start_date) : "-"} - ${itinerary.travel_end_date ? formatDate(itinerary.travel_end_date) : "-"}`
    : "-";
}

export function getDraftDisplayDetails(draft: ItineraryDraftWorkspaceRow) {
  const data = draft.draft_data && typeof draft.draft_data === "object" && !Array.isArray(draft.draft_data)
    ? draft.draft_data as Record<string, unknown>
    : {};
  const form = data["form"] && typeof data["form"] === "object" && !Array.isArray(data["form"])
    ? data["form"] as Record<string, unknown>
    : {};
  const days = Array.isArray(data["days"]) ? data["days"] : [];
  const title = typeof form["title"] === "string" && form["title"].trim() ? form["title"] : "Untitled itinerary draft";
  const start = typeof form["travel_start_date"] === "string" ? form["travel_start_date"] : "";
  const end = typeof form["travel_end_date"] === "string" ? form["travel_end_date"] : "";
  const adults = typeof form["adults"] === "string" || typeof form["adults"] === "number" ? String(form["adults"]) : "0";
  const children = typeof form["children"] === "string" || typeof form["children"] === "number" ? String(form["children"]) : "0";
  return { title, travelDates: start || end ? `${start || "-"} – ${end || "-"}` : "Dates not set", dayCount: days.length, adults, children };
}

function ItineraryProposalsPage() {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<(typeof PROPOSAL_TABS)[number]["value"]>("package");
  const [showDrafts, setShowDrafts] = useState(false);
  const { data: itineraries = [], isLoading, error } = useItineraryWorkspaceRows(search);
  const { data: drafts = [], isLoading: draftsLoading, error: draftsError } = useItineraryDraftWorkspaceRows();
  const visibleDrafts = useMemo(() => dedupeItineraryDraftRows(drafts), [drafts]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Create Itinerary/Proposal"
        actions={
          <div className="flex items-center gap-2">
            <div className="relative w-44 sm:w-56">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <Input
                aria-label="Search itineraries"
                className="h-9 pl-8"
                placeholder="Search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <Button type="button" variant={showDrafts ? "default" : "outline"} size="sm" onClick={() => setShowDrafts((open) => !open)}>
              <FileText className="mr-2 size-4" />Drafts{visibleDrafts.length ? ` (${visibleDrafts.length})` : ""}
            </Button>
            <CreateItineraryDialog />
          </div>
        }
      />

      {showDrafts && <section className="space-y-3 rounded-md border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-slate-900">Your saved drafts</h2>
            <p className="text-xs text-slate-500">Incomplete itineraries are autosaved to your account and can be resumed after signing back in.</p>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={() => setShowDrafts(false)}>Close</Button>
        </div>
        {draftsLoading && <p className="py-4 text-sm text-slate-500">Loading drafts…</p>}
        {draftsError && <p role="alert" className="py-3 text-sm text-rose-600">Could not load drafts. Apply the itinerary drafts database migration and refresh.</p>}
        {!draftsLoading && !draftsError && visibleDrafts.length === 0 && <p className="rounded-md border border-dashed border-slate-200 p-5 text-center text-sm text-slate-500">No saved drafts yet. Start an itinerary and your changes will appear here automatically.</p>}
        {!draftsLoading && !draftsError && visibleDrafts.length > 0 && <div className="grid gap-2 md:grid-cols-2">
          {visibleDrafts.map((draft) => <DraftCard key={draft.id} draft={draft} />)}
        </div>}
      </section>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={tab} onValueChange={(value) => setTab(value as typeof tab)}>
          <TabsList className="h-9 rounded-md border bg-white p-0.5">
            {PROPOSAL_TABS.map((proposalTab) => (
              <TabsTrigger
                key={proposalTab.value}
                value={proposalTab.value}
                disabled={proposalTab.disabled}
                title={proposalTab.disabled ? "B2B proposals are not supported yet" : undefined}
                className="h-8 rounded px-3 text-xs"
              >
                {proposalTab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <Button variant="outline" size="sm" asChild>
          <a href="/itinerary-library">
            <FolderOpen className="mr-2 size-4" />
            Itinerary Library
          </a>
        </Button>
      </div>

      {tab === "b2b" ? (
        <div className="border border-dashed p-8 text-center text-sm text-muted-foreground">
          B2B proposals are not currently supported by the itinerary model.
        </div>
      ) : (
        <div className="overflow-x-auto border bg-white">
          <Table className="min-w-[1080px]">
            <TableHeader>
              <TableRow className="bg-slate-50 hover:bg-slate-50">
                <TableHead>Itinerary ID</TableHead>
                <TableHead>Destination/Title</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Travel Dates</TableHead>
                <TableHead>Adults</TableHead>
                <TableHead>Children</TableHead>
                <TableHead>Created By</TableHead>
                <TableHead>Created At</TableHead>
                <TableHead>Customer/Lead</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableMessage>Loading itineraries…</TableMessage>}
              {error && <TableMessage>Error loading itineraries.</TableMessage>}
              {!isLoading && !error && itineraries.length === 0 && <TableMessage>No itineraries found.</TableMessage>}
              {itineraries.map((itinerary) => (
                <ItineraryRow key={itinerary.id} itinerary={itinerary} />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function DraftCard({ draft }: { draft: ItineraryDraftWorkspaceRow }) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const deleteDraft = useDeleteItineraryDraft();
  const details = getDraftDisplayDetails(draft);
  return (
    <article className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 p-3">
      <div className="min-w-0 space-y-1">
        <h3 className="truncate font-medium text-slate-900">{details.title}</h3>
        <p className="text-xs text-slate-600">{details.travelDates} · {details.dayCount} day{details.dayCount === 1 ? "" : "s"} · {details.adults} adults · {details.children} children</p>
        <p className="text-[11px] text-slate-500">Last saved {formatDate(draft.updated_at)}</p>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" asChild><a href={`/itinerary-builder?draftId=${encodeURIComponent(draft.id)}${draft.lead_id ? `&leadId=${encodeURIComponent(draft.lead_id)}` : ""}`}><Edit3 className="mr-1.5 size-3.5" />Resume draft</a></Button>
        <AlertDialog
          open={deleteOpen}
          onOpenChange={(open) => {
            if (!deleteDraft.isPending) setDeleteOpen(open);
          }}
        >
          <AlertDialogTrigger asChild>
            <Button type="button" size="sm" variant="outline" className="text-destructive">
              <Trash2 className="size-4" />
              Delete
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this draft?</AlertDialogTitle>
              <AlertDialogDescription>
                “{details.title}” will be permanently deleted and can’t be recovered.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleteDraft.isPending}>Cancel</AlertDialogCancel>
              <Button
                type="button"
                variant="destructive"
                disabled={deleteDraft.isPending}
                onClick={() =>
                  deleteDraft.mutate(draft.id, {
                    onSuccess: () => setDeleteOpen(false),
                  })
                }
              >
                {deleteDraft.isPending ? "Deleting…" : "Delete draft"}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </article>
  );
}

function TableMessage({ children }: { children: React.ReactNode }) {
  return (
    <TableRow>
      <TableCell colSpan={10} className="py-10 text-center text-sm text-muted-foreground">
        {children}
      </TableCell>
    </TableRow>
  );
}

function ItineraryRow({ itinerary }: { itinerary: ItineraryWorkspaceRow }) {
  const createdBy = itinerary.profiles?.full_name ?? itinerary.profiles?.email ?? "-";
  const leadName = itinerary.customers?.full_name ?? itinerary.leads?.customer_name ?? "-";

  return (
    <TableRow className="border-t hover:bg-slate-50/70">
      <TableCell className="whitespace-nowrap py-2.5 font-mono text-xs">{itinerary.id}</TableCell>
      <TableCell className="max-w-[220px] py-2.5">
        <div className="truncate font-medium">{getItineraryDisplayTitle(itinerary)}</div>
      </TableCell>
      <TableCell className="py-2.5">{itinerary.version ?? "-"}</TableCell>
      <TableCell className="whitespace-nowrap py-2.5">{getItineraryTravelDates(itinerary)}</TableCell>
      <TableCell className="py-2.5">{itinerary.adults ?? "-"}</TableCell>
      <TableCell className="py-2.5">{itinerary.children ?? "-"}</TableCell>
      <TableCell className="max-w-[170px] truncate py-2.5">{createdBy}</TableCell>
      <TableCell className="whitespace-nowrap py-2.5">{formatDate(itinerary.created_at)}</TableCell>
      <TableCell className="max-w-[150px] truncate py-2.5">{leadName}</TableCell>
      <TableCell className="py-2.5">
        <div className="flex justify-end gap-1">
          <ActionLink href={`/itinerary-builder?itineraryId=${encodeURIComponent(itinerary.id)}`} label="Open" icon={<Eye className="size-3.5" />} />
          <ActionLink href={`/itinerary-builder?copyFrom=${encodeURIComponent(itinerary.id)}`} label="Assign" icon={<UserPlus className="size-3.5" />} />
          <UnavailableAction label="Duplicate" icon={<Copy className="size-3.5" />} />
          <ActionLink href={`/itinerary-builder?itineraryId=${encodeURIComponent(itinerary.id)}`} label="Edit" icon={<Edit3 className="size-3.5" />} />
          <UnavailableAction label="Bookmark" icon={<Bookmark className="size-3.5" />} />
          <UnavailableAction label="Delete" icon={<Trash2 className="size-3.5" />} />
        </div>
      </TableCell>
    </TableRow>
  );
}

function ActionLink({ href, label, icon }: { href: string; label: string; icon: React.ReactNode }) {
  return (
    <Button variant="outline" size="sm" className="h-7 gap-1 px-2 text-[11px]" asChild>
      <a href={href} aria-label={label} title={label}>
        {label === "Open" || label === "Edit" ? icon : null}
        {label}
      </a>
    </Button>
  );
}

function UnavailableAction({ label, icon }: { label: string; icon: React.ReactNode }) {
  return (
    <Button
      variant="outline"
      size="sm"
      className="h-7 gap-1 px-2 text-[11px]"
      disabled
      aria-label={`${label} unavailable`}
      title={`${label} is not supported by the current itinerary model`}
    >
      {icon}
      {label}
    </Button>
  );
}

function CreateItineraryDialog() {
  type CityStayInput = { id: string; city: string; nights: string };
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"create" | "quick">("create");
  const [title, setTitle] = useState("");
  const [version, setVersion] = useState("v1.0");
  const [noDates, setNoDates] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [adults, setAdults] = useState("2");
  const [children, setChildren] = useState("0");
  const [childAges, setChildAges] = useState("");
  const [cityStayOpen, setCityStayOpen] = useState(false);
  const [cityStays, setCityStays] = useState<CityStayInput[]>([]);
  const [prompt, setPrompt] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [quickInputError, setQuickInputError] = useState("");
  const totalNights = totalCityStayNights(cityStays.map((stay) => stay.nights));

  function updateCityStayNights(stayId: string, nights: string) {
    const updatedStays = cityStays.map((stay) => stay.id === stayId ? { ...stay, nights } : stay);
    setCityStays(updatedStays);
    const updatedTotal = totalCityStayNights(updatedStays.map((stay) => stay.nights));
    if (updatedTotal === null) return;
    if (startDate) setEndDate(shiftIsoDate(startDate, updatedTotal));
    else if (endDate) setStartDate(shiftIsoDate(endDate, -updatedTotal));
  }

  function updateCityStaysWithout(stayId: string) {
    const updatedStays = cityStays.filter((stay) => stay.id !== stayId);
    setCityStays(updatedStays);
    const updatedTotal = totalCityStayNights(updatedStays.map((stay) => stay.nights));
    if (updatedTotal === null) return;
    if (startDate) setEndDate(shiftIsoDate(startDate, updatedTotal));
    else if (endDate) setStartDate(shiftIsoDate(endDate, -updatedTotal));
  }

  function openBuilder() {
    const params = new URLSearchParams({ draftId: crypto.randomUUID(), newItinerary: "1" });
    if (title.trim()) params.set("title", title.trim());
    if (!noDates && startDate) params.set("travelStartDate", startDate);
    if (!noDates && endDate) params.set("travelEndDate", endDate);
    params.set("adults", adults || "0");
    params.set("children", children || "0");
    const route = cityStays.filter((stay) => stay.city.trim() || stay.nights).map((stay) => `${stay.city.trim() || "City to confirm"}${stay.nights ? `: ${stay.nights} night${stay.nights === "1" ? "" : "s"}` : ""}`);
    const requestedNights = totalNights;
    const requirements = [
      title.trim() ? `Destination/title: ${title.trim()}.` : "",
      requestedNights !== null ? `Trip duration: ${requestedNights + 1} days / ${requestedNights} nights.` : "",
      route.length ? `Visit these cities in order: ${route.join(" → ")}.` : "",
      !noDates && startDate && endDate ? `Travel dates: ${startDate} to ${endDate}.` : "",
      `Travellers: ${adults || 0} adults, ${children || 0} children${childAges.trim() ? ` (ages ${childAges.trim()})` : ""}.`,
      version.trim() ? `Itinerary version: ${version.trim()}.` : "",
    ].filter(Boolean).join(" ");
    if (requirements) params.set("quickPrompt", requirements);
    window.location.assign(`${CREATE_ITINERARY_HREF}?${params.toString()}`);
  }

  function addCityStay() {
    setCityStays((current) => [...current, { id: crypto.randomUUID(), city: "", nights: "" }]);
    setCityStayOpen(true);
  }

  async function generateQuickItinerary() {
    if (Boolean(prompt.trim()) === Boolean(file)) return;
    if (prompt.trim()) {
      setQuickInputError("");
      window.dispatchEvent(
        new CustomEvent(QUICK_ITINERARY_REQUEST_EVENT, {
          detail: { sourceText: prompt.trim(), destinationText: title.trim() },
        }),
      );
      setOpen(false);
      return;
    }
    if (!file) return;
    if (file.size > 3_000_000) {
      setQuickInputError("Files must be under 3 MB. Please select a smaller file.");
      return;
    }
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = "";
      for (let index = 0; index < bytes.length; index += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
      }
      window.dispatchEvent(
        new CustomEvent(QUICK_ITINERARY_REQUEST_EVENT, {
          detail: {
            fileName: file.name,
            mimeType: file.type || "application/octet-stream",
            fileBase64: btoa(binary),
            destinationText: title.trim(),
          },
        }),
      );
      setQuickInputError("");
      setOpen(false);
    } catch (error) {
      setQuickInputError(
        error instanceof Error
          ? `Could not read the selected file: ${error.message}`
          : "Could not read the selected file. Please try again.",
      );
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="h-9">
          <Plus className="mr-2 size-4" />
          Create New Itinerary
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] w-[calc(100vw-2rem)] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Itinerary</DialogTitle>
          <DialogDescription className="sr-only">Create an itinerary manually or start from a prompt or supplier document.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
          <Button type="button" variant={mode === "create" ? "default" : "ghost"} className="h-10 rounded-lg" onClick={() => setMode("create")}>Create Itinerary</Button>
          <Button type="button" variant={mode === "quick" ? "default" : "ghost"} className="h-10 rounded-lg" onClick={() => setMode("quick")}>Quick Itinerary</Button>
        </div>

        {mode === "create" ? <div className="space-y-4 py-1">
          <div className="space-y-1.5"><label htmlFor="new-itinerary-title" className="text-sm font-medium">Destination/Title</label><Input id="new-itinerary-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g., Paris, France" /></div>
          <div className="space-y-1.5"><label htmlFor="new-itinerary-version" className="text-sm font-medium">Version</label><Input id="new-itinerary-version" value={version} onChange={(event) => setVersion(event.target.value)} placeholder="e.g., v1.0" /></div>
          <div className="space-y-3 rounded-xl border p-4">
            <Button type="button" variant="ghost" className="h-auto w-full justify-between p-0 text-left font-medium" aria-expanded={cityStayOpen} onClick={() => setCityStayOpen((value) => !value)}>Add City/Night Stay <span aria-hidden="true">{cityStayOpen ? "−" : "⌄"}</span></Button>
            {cityStayOpen && <div className="space-y-3">
              {cityStays.map((stay, index) => <div key={stay.id} className="grid items-end gap-3 sm:grid-cols-[1fr_180px_auto]">
                <div className="space-y-1.5"><label htmlFor={`new-itinerary-city-${stay.id}`} className="text-sm">City {index + 1}</label><DestinationInput id={`new-itinerary-city-${stay.id}`} value={stay.city} onChange={(city) => setCityStays((current) => current.map((item) => item.id === stay.id ? { ...item, city } : item))} placeholder="Type a city name" /></div>
                <div className="space-y-1.5"><label htmlFor={`new-itinerary-nights-${stay.id}`} className="text-sm">Nights</label><Input id={`new-itinerary-nights-${stay.id}`} type="number" min="1" value={stay.nights} onChange={(event) => updateCityStayNights(stay.id, event.target.value)} placeholder="Number of nights" /></div>
                <Button type="button" variant="ghost" size="icon" aria-label={`Remove city ${index + 1}`} onClick={() => updateCityStaysWithout(stay.id)}><Trash2 className="size-4" /></Button>
              </div>)}
              <Button type="button" variant="outline" size="sm" onClick={addCityStay}><Plus className="mr-2 size-4" />Add another city</Button>
              {totalNights !== null && <p className="text-sm font-medium text-slate-600">Total stay: {totalNights} {totalNights === 1 ? "night" : "nights"} · {totalNights + 1} days</p>}
            </div>}
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={noDates} onChange={(event) => setNoDates(event.target.checked)} className="size-4 accent-teal-700" />No dates</label>
          {!noDates && <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1.5"><label htmlFor="new-itinerary-start" className="text-sm font-medium">Trip Start Date</label><Input id="new-itinerary-start" type="date" value={startDate} onChange={(event) => { const nextStart = event.target.value; setStartDate(nextStart); if (nextStart && totalNights !== null) setEndDate(shiftIsoDate(nextStart, totalNights)); }} /></div><div className="space-y-1.5"><label htmlFor="new-itinerary-end" className="text-sm font-medium">Trip End Date</label><Input id="new-itinerary-end" type="date" min={startDate || undefined} value={endDate} onChange={(event) => { const nextEnd = event.target.value; setEndDate(nextEnd); if (nextEnd && totalNights !== null) setStartDate(shiftIsoDate(nextEnd, -totalNights)); }} /></div></div>}
          <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1.5"><label htmlFor="new-itinerary-adults" className="text-sm font-medium">No of Adults</label><Input id="new-itinerary-adults" type="number" min="0" value={adults} onChange={(event) => setAdults(event.target.value)} /></div><div className="space-y-1.5"><label htmlFor="new-itinerary-children" className="text-sm font-medium">No of Children</label><Input id="new-itinerary-children" type="number" min="0" value={children} onChange={(event) => setChildren(event.target.value)} /></div></div>
          {Number(children) > 0 && <div className="space-y-1.5"><label htmlFor="new-itinerary-child-ages" className="text-sm font-medium">Children age</label><Input id="new-itinerary-child-ages" value={childAges} onChange={(event) => setChildAges(event.target.value)} placeholder="e.g., 8, 9" /></div>}
          <DialogFooter><Button type="button" className="bg-teal-700 text-white hover:bg-teal-800" onClick={openBuilder}>Create Itinerary</Button></DialogFooter>
        </div> : <div className="space-y-4 py-1">
          <p className="text-sm text-muted-foreground">
            Create an itinerary from a prompt or an uploaded file. Preparation runs in a movable,
            minimizable panel while you continue using the CRM; the preview opens when it is ready.
          </p>
          <div className="space-y-1.5"><label htmlFor="quick-itinerary-prompt" className="text-sm font-medium">Prompt</label><Textarea id="quick-itinerary-prompt" value={prompt} onChange={(event) => { setPrompt(event.target.value); setQuickInputError(""); if (event.target.value) setFile(null); }} placeholder="Paste itinerary details, inclusions, hotels, day plan..." className="min-h-36 resize-y" /></div>
          <div className="space-y-1.5"><label htmlFor="quick-itinerary-file" className="text-sm font-medium">Upload file</label><Input id="quick-itinerary-file" type="file" accept=".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown" onChange={(event) => { const selectedFile = event.target.files?.[0] ?? null; setFile(selectedFile); setQuickInputError(""); if (selectedFile) setPrompt(""); }} /><p className="text-xs text-muted-foreground">PDF, DOCX, or TXT. Either prompt or file is required. Files must be under 3 MB.</p></div>
          {quickInputError && <p role="alert" className="text-sm text-destructive">{quickInputError}</p>}
          <div className="flex justify-end pt-2"><Button type="button" className="bg-[#151515] text-white hover:bg-black" disabled={Boolean(prompt.trim()) === Boolean(file) || Boolean(file && file.size > 3_000_000)} onClick={() => void generateQuickItinerary()}><Sparkles className="mr-2 size-4" />Generate Quick Itinerary</Button></div>
        </div>}
      </DialogContent>
    </Dialog>
  );
}
