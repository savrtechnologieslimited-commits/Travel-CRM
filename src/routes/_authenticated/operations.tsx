import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useBooking, useBookings, useProfiles, useSuppliersFull } from "@/lib/data";
import { useOpsJobs, useUpsertOpsJob } from "@/lib/ops-data";
import { formatDate, formatMoney, fulfilmentLabel, statusTone, titleize, today } from "@/lib/crm";
import { transportDetailPairs, transportOf } from "@/lib/transport";
import { activityDetailPairs, activityOf } from "@/lib/activity";
import { PageHeader } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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

const JOB_STATUSES = ["pending", "assigned", "confirmed", "in_progress", "completed", "cancelled"];
const SERVICE_TYPES = [
  "hotel",
  "cab",
  "flight",
  "train",
  "guide",
  "activity",
  "visa",
  "insurance",
  "meal",
  "other",
];

export const Route = createFileRoute("/_authenticated/operations")({
  head: () => ({
    meta: [
      { title: "Operations Board — SAVR Travels CRM" },
      {
        name: "description",
        content:
          "Assign hotel, cab, guide and visa jobs to suppliers and staff, track confirmations and service dates.",
      },
      { property: "og:title", content: "Operations Board — SAVR Travels CRM" },
      {
        property: "og:description",
        content: "Ground operations job board for supplier and staff service delivery.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: OperationsPage,
});

function OperationsPage() {
  const [status, setStatus] = useState("all");
  const [assignee, setAssignee] = useState("all");
  const { data: jobs = [], isLoading } = useOpsJobs({ status, assignee });
  const { data: profiles = [] } = useProfiles();
  const upsert = useUpsertOpsJob();

  const nameOf = useMemo(() => {
    const map = new Map(profiles.map((p) => [p.id, p.full_name]));
    return (id?: string | null) => (id ? (map.get(id) ?? "Unavailable team member") : "Unassigned");
  }, [profiles]);

  const t = today();
  const stats = {
    todayJobs: jobs.filter((j) => j.service_date === t).length,
    unconfirmed: jobs.filter((j) => j.status === "pending" || j.status === "assigned").length,
    cost: jobs.reduce((s, j) => s + Number(j.cost_amount ?? 0), 0),
  };

  const columns = ["pending", "assigned", "confirmed", "in_progress", "completed"];

  return (
    <div>
      <PageHeader
        title="Operations Board"
        subtitle="Ground services assigned to suppliers and your operations team."
        actions={<NewJobDialog />}
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Services today</p>
          <p className="font-display text-2xl font-semibold">{stats.todayJobs}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Awaiting confirmation</p>
          <p className="font-display text-2xl font-semibold text-destructive">
            {stats.unconfirmed}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Supplier cost in view</p>
          <p className="font-display text-2xl font-semibold">{formatMoney(stats.cost)}</p>
        </Card>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {JOB_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {titleize(s)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={assignee} onValueChange={setAssignee}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Owner" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All owners</SelectItem>
            {profiles.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.full_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading && <Card className="p-4 text-sm text-muted-foreground">Loading jobs…</Card>}

      <div className="grid gap-4 lg:grid-cols-5">
        {columns.map((col) => {
          const list = jobs.filter((j) => j.status === col);
          return (
            <div key={col} className="min-w-0">
              <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {titleize(col)} ({list.length})
              </p>
              <div className="grid gap-2">
                {list.map((j) => (
                  <Card key={j.id} className="p-3">
                    <p className="text-sm font-medium">{j.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {titleize(j.service_type)} · {j.city ?? "—"}
                    </p>
                    <p className="text-xs text-muted-foreground">{formatDate(j.service_date)}</p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      <Badge variant="secondary">{j.suppliers?.name ?? "No supplier"}</Badge>
                      {j.bookings?.code && <Badge variant="outline">{j.bookings.code}</Badge>}
                    </div>
                    <p className="mt-2 text-xs">
                      Owner: {nameOf(j.assigned_to)} · {formatMoney(Number(j.cost_amount ?? 0))}
                    </p>
                    {j.confirmation_number && (
                      <p className="text-xs text-muted-foreground">Ref {j.confirmation_number}</p>
                    )}
                    <TransportJobDetails job={j} />
                    <ActivityJobDetails job={j} />

                    <Select
                      value={j.status}
                      onValueChange={(v) => upsert.mutate({ id: j.id, values: { status: v } })}
                    >
                      <SelectTrigger className="mt-2 h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {JOB_STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>
                            {titleize(s)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Card>
                ))}
                {list.length === 0 && (
                  <p className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
                    No jobs
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function NewJobDialog() {
  const [open, setOpen] = useState(false);
  const upsert = useUpsertOpsJob();
  const { data: profiles = [] } = useProfiles();
  const { data: suppliers = [] } = useSuppliersFull();
  const { data: bookings = [] } = useBookings();
  const [form, setForm] = useState({
    title: "",
    service_type: "hotel",
    service_date: today(),
    city: "",
    supplier_id: "",
    booking_id: "",
    booking_item_id: "",
    assigned_to: "",
    cost_amount: "0",
    confirmation_number: "",
    notes: "",
    status: "pending",
  });
  // Service lines of the linked booking, so a job can point at the exact
  // hotel / transport / activity line it executes.
  const { data: bookingDetail } = useBooking(form.booking_id);
  const bookingItems = bookingDetail?.items ?? [];

  function set(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await upsert.mutateAsync({
      values: {
        title: form.title,
        service_type: form.service_type,
        service_date: form.service_date || null,
        city: form.city || null,
        supplier_id: form.supplier_id || null,
        booking_id: form.booking_id || null,
        booking_item_id: form.booking_item_id || null,
        assigned_to: form.assigned_to || null,
        cost_amount: Number(form.cost_amount || 0),
        confirmation_number: form.confirmation_number || null,
        notes: form.notes || null,
        status: form.status,
      },
    });

    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 size-4" /> New job
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Assign a service job</DialogTitle>
          <DialogDescription>
            Hotel, cab, guide, visa or activity work handed to a supplier with an internal owner.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="j-title">Job title</Label>
            <Input
              id="j-title"
              required
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
            />
          </div>
          <div>
            <Label>Service type</Label>
            <Select value={form.service_type} onValueChange={(v) => set("service_type", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SERVICE_TYPES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {titleize(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="j-date">Service date</Label>
            <Input
              id="j-date"
              type="date"
              value={form.service_date}
              onChange={(e) => set("service_date", e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="j-city">City</Label>
            <Input id="j-city" value={form.city} onChange={(e) => set("city", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="j-cost">Supplier cost</Label>
            <Input
              id="j-cost"
              type="number"
              value={form.cost_amount}
              onChange={(e) => set("cost_amount", e.target.value)}
            />
          </div>
          <div>
            <Label>Supplier</Label>
            <Select value={form.supplier_id} onValueChange={(v) => set("supplier_id", v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select supplier" />
              </SelectTrigger>
              <SelectContent>
                {suppliers.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Booking</Label>
            <Select
              value={form.booking_id}
              onValueChange={(v) => setForm((f) => ({ ...f, booking_id: v, booking_item_id: "" }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Link booking" />
              </SelectTrigger>
              <SelectContent>
                {bookings.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.code ?? "—"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {form.booking_id && (
            <div>
              <Label>Service line</Label>
              <Select value={form.booking_item_id} onValueChange={(v) => set("booking_item_id", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Link service line (optional)" />
                </SelectTrigger>
                <SelectContent>
                  {bookingItems.map((it) => (
                    <SelectItem key={it.id} value={it.id}>
                      {titleize(it.item_type)} · {it.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label>Internal owner</Label>
            <Select value={form.assigned_to} onValueChange={(v) => set("assigned_to", v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select staff" />
              </SelectTrigger>
              <SelectContent>
                {profiles.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="j-conf">Confirmation number</Label>
            <Input
              id="j-conf"
              value={form.confirmation_number}
              onChange={(e) => set("confirmation_number", e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="j-notes">Notes</Label>
            <Textarea
              id="j-notes"
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
            />
          </div>
          <DialogFooter className="sm:col-span-2">
            <Button type="submit" disabled={upsert.isPending}>
              {upsert.isPending ? "Saving…" : "Create job"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Operational transport detail for a job that was created from a transport
 * service line. The job stays the unit of execution; this only surfaces the
 * sold transport service behind it (no pricing — cost stays on the job/line).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function TransportJobDetails({ job }: { job: any }) {
  const item = job?.booking_items;
  const t = transportOf(item);
  if (!t) return null;
  const partner = fulfilmentLabel(item?.fulfilment_mode, t.suppliers ?? item?.suppliers);
  const pairs: Array<[string, string]> = [
    // Supplier and confirmation are shown once, in the fulfilment rows below.
    ...transportDetailPairs(t).filter(
      ([label]) => label !== "Supplier" && label !== "Confirmation",
    ),
    ["Fulfilment", partner],
    ["Confirmation", t.confirmation_number ?? job.confirmation_number ?? "Pending"],
  ];
  return (
    <div className="mt-2 rounded-md border border-border bg-muted/40 p-2">
      <p className="mb-1 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
        Transport service
      </p>
      <dl className="grid gap-0.5 text-xs">
        {pairs.map(([label, value]) => (
          <div key={label} className="flex gap-2">
            <dt className="w-24 shrink-0 text-muted-foreground">{label}</dt>
            <dd className="min-w-0 break-words">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * Operational activity detail for a job created from an activity service line.
 * The job stays the unit of execution; this only surfaces the sold activity
 * behind it (no pricing — cost stays on the job/line).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ActivityJobDetails({ job }: { job: any }) {
  const item = job?.booking_items;
  const a = activityOf(item);
  if (!a) return null;
  const partner = fulfilmentLabel(item?.fulfilment_mode, a.suppliers ?? item?.suppliers);
  const pairs: Array<[string, string]> = [
    // Supplier and confirmation are shown once, in the fulfilment rows below.
    ...activityDetailPairs(a).filter(([label]) => label !== "Supplier" && label !== "Confirmation"),
    ["Fulfilment", partner],
    ["Confirmation", a.confirmation_number ?? job.confirmation_number ?? "Pending"],
  ];
  return (
    <div className="mt-2 rounded-md border border-border bg-muted/40 p-2">
      <p className="mb-1 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
        Activity service
      </p>
      <dl className="grid gap-0.5 text-xs">
        {pairs.map(([label, value]) => (
          <div key={label} className="flex gap-2">
            <dt className="w-24 shrink-0 text-muted-foreground">{label}</dt>
            <dd className="min-w-0 break-words">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
