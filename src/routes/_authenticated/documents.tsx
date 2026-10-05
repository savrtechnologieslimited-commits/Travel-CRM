import { useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Plus, ShieldCheck, FileWarning, Upload, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  useDocuments,
  useUpsertDocument,
  useVisaBoard,
  useBookings,
  useCustomers,
} from "@/lib/data";
import { DOC_TYPES, VISA_STATUSES, formatDate, titleize } from "@/lib/crm";
import { PageHeader } from "@/components/app-shell";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/documents")({
  head: () => ({
    meta: [
      { title: "Visa & Documents — SAVR Travels CRM" },
      {
        name: "description",
        content:
          "Track passports, visas, tickets and insurance documents with expiry alerts and visa processing status per booking.",
      },
      { property: "og:title", content: "Visa & Documents — SAVR Travels CRM" },
      {
        property: "og:description",
        content: "Visa processing board and document checklist for travel operations teams.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DocumentsPage,
});

const DOC_STATUSES = ["pending", "received", "verified", "expired", "rejected"] as const;

function DocumentsPage() {
  const [status, setStatus] = useState("all");
  const [type, setType] = useState("all");
  const [search, setSearch] = useState("");
  const { data: docs = [], isLoading } = useDocuments({ status, type, search });
  const { data: visa } = useVisaBoard();

  const expiringSoon = useMemo(() => {
    const limit = new Date();
    limit.setMonth(limit.getMonth() + 6);
    return (visa?.travellers ?? []).filter(
      (t) => t.passport_expiry && new Date(t.passport_expiry) <= limit,
    );
  }, [visa]);

  return (
    <div>
      <PageHeader
        title="Visa & Documents"
        subtitle="Passport, visa, ticket and insurance tracking with expiry alerts."
        actions={<NewDocumentDialog />}
      />

      <Tabs defaultValue="documents">
        <TabsList className="mb-4">
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="visa">Visa board</TabsTrigger>
          <TabsTrigger value="passports">Passport expiry</TabsTrigger>
        </TabsList>

        <TabsContent value="documents">
          <div className="mb-4 flex flex-wrap gap-3">
            <Input
              placeholder="Search document name"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full sm:w-64"
            />
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {DOC_TYPES.map((d) => (
                  <SelectItem key={d} value={d}>
                    {titleize(d)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {DOC_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {titleize(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Card className="overflow-x-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Document</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Linked to</TableHead>
                  <TableHead>Expiry</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>File</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                      Loading documents…
                    </TableCell>
                  </TableRow>
                )}
                {!isLoading && docs.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                      No documents yet. Add passports, visas or tickets to start tracking.
                    </TableCell>
                  </TableRow>
                )}
                {docs.map((d) => {
                  const row = d as typeof d & {
                    bookings?: { code?: string | null } | null;
                    customers?: { full_name?: string | null } | null;
                    travellers?: { full_name?: string | null } | null;
                  };
                  const linked =
                    row.travellers?.full_name ||
                    row.customers?.full_name ||
                    row.bookings?.code ||
                    "—";
                  return (
                    <TableRow key={d.id}>
                      <TableCell className="font-medium">{d.name}</TableCell>
                      <TableCell>{titleize(d.doc_type)}</TableCell>
                      <TableCell className="text-muted-foreground">{linked}</TableCell>
                      <TableCell>{d.expiry_date ? formatDate(d.expiry_date) : "—"}</TableCell>
                      <TableCell>
                        <StatusBadge status={d.status} />
                      </TableCell>
                      <TableCell>
                        <DocumentFileCell id={d.id} filePath={d.file_path ?? null} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="visa">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {(visa?.bookings ?? []).length === 0 && (
              <Card className="p-6 text-sm text-muted-foreground">
                No international bookings needing visa processing.
              </Card>
            )}
            {(visa?.bookings ?? []).map((b) => {
              const row = b as typeof b & {
                customers?: { full_name?: string | null } | null;
                destinations?: { name?: string | null; country?: string | null } | null;
              };
              return (
                <Card key={b.id} className="space-y-2 p-5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-display font-semibold">{b.code ?? "Booking"}</p>
                    <StatusBadge status={b.visa_status} />
                  </div>
                  <p className="text-sm">{row.customers?.full_name ?? "Unassigned customer"}</p>
                  <p className="text-sm text-muted-foreground">
                    {row.destinations?.name ?? "—"}
                    {row.destinations?.country ? `, ${row.destinations.country}` : ""}
                  </p>
                  <p className="flex items-center gap-2 text-xs text-muted-foreground">
                    <ShieldCheck className="size-3.5" /> Travel {formatDate(b.travel_start)}
                  </p>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="passports">
          <Card className="overflow-x-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Traveller</TableHead>
                  <TableHead>Passport</TableHead>
                  <TableHead>Nationality</TableHead>
                  <TableHead>Expiry</TableHead>
                  <TableHead>Visa</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(visa?.travellers ?? []).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                      No travellers recorded yet.
                    </TableCell>
                  </TableRow>
                )}
                {(visa?.travellers ?? []).map((t) => {
                  const risky = expiringSoon.some((x) => x.id === t.id);
                  return (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">{t.full_name}</TableCell>
                      <TableCell>{t.passport_number ?? "—"}</TableCell>
                      <TableCell>{t.nationality ?? "—"}</TableCell>
                      <TableCell
                        className={risky ? "font-medium text-destructive" : undefined}
                      >
                        <span className="inline-flex items-center gap-1.5">
                          {risky && <FileWarning className="size-3.5" />}
                          {t.passport_expiry ? formatDate(t.passport_expiry) : "—"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={t.visa_status} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function NewDocumentDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [docType, setDocType] = useState<string>(DOC_TYPES[0]);
  const [status, setStatus] = useState<string>("pending");
  const [expiry, setExpiry] = useState("");
  const [bookingId, setBookingId] = useState("none");
  const [customerId, setCustomerId] = useState("none");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const { data: bookings = [] } = useBookings();
  const { data: customers = [] } = useCustomers();
  const save = useUpsertDocument();

  async function submit() {
    if (!name.trim()) return;
    let filePath: string | null = null;
    if (file) {
      setUploading(true);
      try {
        filePath = await uploadDocumentFile(file);
      } catch (e) {
        setUploading(false);
        toast.error(e instanceof Error ? e.message : "Upload failed");
        return;
      }
      setUploading(false);
    }
    await save.mutateAsync({
      values: {
        name: name.trim(),
        doc_type: docType,
        status,
        expiry_date: expiry || null,
        booking_id: bookingId === "none" ? null : bookingId,
        customer_id: customerId === "none" ? null : customerId,
        notes: notes || null,
        file_path: filePath,
      },
    });
    setOpen(false);
    setName("");
    setExpiry("");
    setNotes("");
    setFile(null);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" /> Add document
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add document</DialogTitle>
          <DialogDescription>
            Track a passport, visa, ticket, insurance or invoice against a booking or customer.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>Document name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Passport — Rahul Reddy" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>Type</Label>
              <Select value={docType} onValueChange={setDocType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DOC_TYPES.map((d) => (
                    <SelectItem key={d} value={d}>
                      {titleize(d)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DOC_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {titleize(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>Expiry date</Label>
              <Input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Booking</Label>
              <Select value={bookingId} onValueChange={setBookingId}>
                <SelectTrigger>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not linked</SelectItem>
                  {bookings.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.code ?? "—"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>Customer</Label>
            <Select value={customerId} onValueChange={setCustomerId}>
              <SelectTrigger>
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Not linked</SelectItem>
                {customers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>
          <div className="grid gap-1.5">
            <Label>Attach file (optional)</Label>
            <Input
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <p className="text-xs text-muted-foreground">
              Stored privately; opened via time-limited secure links.
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            Visa stages available on bookings: {VISA_STATUSES.map((v) => titleize(v)).join(", ")}.
          </p>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={save.isPending || uploading || !name.trim()}>
            {uploading ? "Uploading…" : "Save document"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export async function uploadDocumentFile(file: File) {
  const ext = file.name.split(".").pop() ?? "bin";
  const path = `${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("documents").upload(path, file, {
    cacheControl: "3600",
    upsert: false,
  });
  if (error) throw error;
  return path;
}

function DocumentFileCell({ id, filePath }: { id: string; filePath: string | null }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const save = useUpsertDocument();

  async function onPick(file?: File | null) {
    if (!file) return;
    setBusy(true);
    try {
      const path = await uploadDocumentFile(file);
      await save.mutateAsync({ id, values: { file_path: path } });
      toast.success("File uploaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function openFile() {
    if (!filePath) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.storage
        .from("documents")
        .createSignedUrl(filePath, 300);
      if (error || !data) throw error ?? new Error("Could not create link");
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not open file");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-1">
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          void onPick(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {busy ? (
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      ) : filePath ? (
        <>
          <Button size="sm" variant="outline" onClick={openFile}>
            <ExternalLink className="size-3.5" /> View
          </Button>
          <Button size="sm" variant="ghost" onClick={() => inputRef.current?.click()}>
            Replace
          </Button>
        </>
      ) : (
        <Button size="sm" variant="outline" onClick={() => inputRef.current?.click()}>
          <Upload className="size-3.5" /> Upload
        </Button>
      )}
    </div>
  );
}
