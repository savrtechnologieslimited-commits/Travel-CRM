import { useState } from "react";
import { Ticket } from "lucide-react";
import { useSaveActivityService } from "@/lib/data";
import { FulfilmentFields } from "@/components/fulfilment-fields";
import { InrEquivalent, useCurrencyRates } from "@/components/currency-converter";
import { convertToInr, type CurrencyCode } from "@/lib/currency-converter";
import { toast } from "sonner";
import { titleize } from "@/lib/crm";
import { ACTIVITY_TYPES, activityTitle, activityLine } from "@/lib/activity";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = any;

const SERVICE_STATUSES = ["pending", "requested", "confirmed", "cancelled"] as const;

const str = (v: unknown, fallback = "") => (v === null || v === undefined ? fallback : String(v));

/**
 * Structured activity / sightseeing form. Writes the financial service line
 * (booking_items / quotation_items) and its activity_services detail row.
 * Pricing stays on the service line — activity_services holds no money.
 */
export function ActivityServiceDialog({
  parent,
  parentId,
  currency = "INR",
  item,
  trigger,
}: {
  parent: "booking" | "quotation";
  parentId: string;
  currency?: string | null;
  /** Existing service line with its activity_services row, when editing. */
  item?: Row;
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const save = useSaveActivityService();
  const { rates } = useCurrencyRates();
  const activity: Row = Array.isArray(item?.activity_services)
    ? item?.activity_services?.[0]
    : item?.activity_services;

  const [form, setForm] = useState({
    activity_name: str(activity?.activity_name),
    activity_type: str(activity?.activity_type, "Sightseeing"),
    location: str(activity?.location),
    city: str(activity?.city ?? item?.city),
    activity_date: str(activity?.activity_date ?? item?.start_date),
    start_time: str(activity?.start_time),
    end_time: str(activity?.end_time),
    duration_hours: str(activity?.duration_hours),
    adults: str(activity?.adults, "0"),
    children: str(activity?.children, "0"),
    meeting_point: str(activity?.meeting_point),
    supplier_id: str(activity?.supplier_id ?? item?.supplier_id),
    fulfilment_mode: str(
      item?.fulfilment_mode ??
        ((activity?.supplier_id ?? item?.supplier_id) ? "supplier" : "direct"),
      "direct",
    ),
    confirmation_number: str(activity?.confirmation_number ?? item?.confirmation_number),
    cost_price: str(item?.cost_price),
    sell_price: str(item?.sell_price),
    status: str(activity?.status ?? item?.status, "pending"),
    notes: str(activity?.notes),
  });

  const timesInvalid = Boolean(form.start_time && form.end_time && form.end_time < form.start_time);
  const countsInvalid =
    Number(form.adults) < 0 ||
    Number(form.children) < 0 ||
    (form.duration_hours !== "" && Number(form.duration_hours) < 0);
  const participantsInvalid = (Number(form.adults) || 0) + (Number(form.children) || 0) <= 0;
  const supplierMissing = form.fulfilment_mode === "supplier" && !form.supplier_id;
  const invalid = timesInvalid || countsInvalid || participantsInvalid || supplierMissing;

  function set(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (invalid) return;
    const code = (currency ?? "INR") as CurrencyCode;
    const costPrice = Number(form.cost_price) || 0;
    const sellPrice = Number(form.sell_price) || 0;
    const costPriceInr = costPrice ? convertToInr(costPrice, code, rates?.rates) : 0;
    const sellPriceInr = sellPrice ? convertToInr(sellPrice, code, rates?.rates) : 0;
    if (costPriceInr === null || sellPriceInr === null) {
      toast.error("Live exchange rates are required to save these prices with their INR equivalents. Please try again.");
      return;
    }
    const supplierId = form.fulfilment_mode === "supplier" ? form.supplier_id || null : null;

    const detail = {
      activity_name: form.activity_name || form.activity_type,
      activity_type: form.activity_type,
      location: form.location || null,
      city: form.city || null,
      activity_date: form.activity_date || null,
      start_time: form.start_time || null,
      end_time: form.end_time || null,
      duration_hours: form.duration_hours === "" ? null : Number(form.duration_hours) || 0,
      adults: Math.max(Number(form.adults) || 0, 0),
      children: Math.max(Number(form.children) || 0, 0),
      meeting_point: form.meeting_point || null,
      supplier_id: supplierId,
      confirmation_number: form.confirmation_number || null,
      status: form.status,
      notes: form.notes || null,
    };

    const serviceLine: Record<string, unknown> = {
      title: activityTitle(detail),
      description: activityLine(detail),
      supplier_id: supplierId,
      fulfilment_mode: form.fulfilment_mode,
      start_date: form.activity_date || null,
      end_date: form.activity_date || null,
      cost_price: Number(form.cost_price) || 0,
      cost_price_inr: costPriceInr,
      sell_price: Number(form.sell_price) || 0,
      sell_price_inr: sellPriceInr,
      exchange_rate: costPrice > 0 ? costPriceInr / costPrice : sellPrice > 0 ? sellPriceInr / sellPrice : 1,
      exchange_rate_updated_at: rates?.updatedAt ?? null,
    };
    if (parent === "booking") {
      serviceLine["status"] = form.status;
      serviceLine["confirmation_number"] = form.confirmation_number || null;
    } else {
      // Activity prices are entered as service totals, so quantity stays 1.
      serviceLine["quantity"] = 1;
      serviceLine["city"] = form.city || form.location || null;
    }

    await save.mutateAsync({
      parent,
      parentId,
      itemId: item?.id ?? null,
      activityId: activity?.id ?? null,
      item: serviceLine,
      activity: detail,
    });
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline">
            <Ticket className="mr-2 size-4" /> Add activity
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{activity ? "Edit activity" : "Add activity"}</DialogTitle>
          <DialogDescription>
            Sightseeing and experience details. Pricing stays on the service line so booking totals
            remain database-calculated.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
          <Field label="Activity name">
            <Input
              required
              value={form.activity_name}
              onChange={(e) => set("activity_name", e.target.value)}
              placeholder="Kerala Backwater Cruise"
            />
          </Field>
          <Field label="Activity type">
            <Select value={form.activity_type} onValueChange={(v) => set("activity_type", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACTIVITY_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Location">
            <Input
              value={form.location}
              onChange={(e) => set("location", e.target.value)}
              placeholder="Alleppey"
            />
          </Field>
          <Field label="City">
            <Input value={form.city} onChange={(e) => set("city", e.target.value)} />
          </Field>

          <Field label="Activity date">
            <Input
              type="date"
              required
              value={form.activity_date}
              onChange={(e) => set("activity_date", e.target.value)}
            />
          </Field>
          <Field label="Status">
            <Select value={form.status} onValueChange={(v) => set("status", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SERVICE_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {titleize(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Start time">
            <Input
              type="time"
              value={form.start_time}
              onChange={(e) => set("start_time", e.target.value)}
            />
          </Field>
          <Field label="End time">
            <Input
              type="time"
              value={form.end_time}
              onChange={(e) => set("end_time", e.target.value)}
            />
          </Field>
          <Field label="Duration (hours)">
            <Input
              type="number"
              min={0}
              step="0.5"
              value={form.duration_hours}
              onChange={(e) => set("duration_hours", e.target.value)}
              placeholder="Optional"
            />
          </Field>
          <Field label="Meeting point">
            <Input
              value={form.meeting_point}
              onChange={(e) => set("meeting_point", e.target.value)}
              placeholder="Hotel lobby"
            />
          </Field>

          <Field label="Adults">
            <Input
              type="number"
              min={0}
              value={form.adults}
              onChange={(e) => set("adults", e.target.value)}
            />
          </Field>
          <Field label="Children">
            <Input
              type="number"
              min={0}
              value={form.children}
              onChange={(e) => set("children", e.target.value)}
            />
          </Field>

          <div className="grid gap-3 sm:col-span-2 sm:grid-cols-2">
            <FulfilmentFields
              mode={form.fulfilment_mode}
              supplierId={form.supplier_id}
              currentSupplier={
                form.supplier_id
                  ? {
                      id: form.supplier_id,
                      name: str(activity?.suppliers?.name ?? item?.suppliers?.name),
                    }
                  : null
              }
              onChange={(next) =>
                setForm((f) => ({
                  ...f,
                  fulfilment_mode: next.fulfilment_mode,
                  supplier_id: next.supplier_id,
                }))
              }
            />
          </div>
          <Field label="Supplier confirmation">
            <Input
              value={form.confirmation_number}
              onChange={(e) => set("confirmation_number", e.target.value)}
              placeholder="ACT12345"
            />
          </Field>

          <Field label={`Supplier cost (${currency ?? "INR"})`}>
            <Input
              type="number"
              min={0}
              value={form.cost_price}
              onChange={(e) => set("cost_price", e.target.value)}
            />
            <InrEquivalent amount={form.cost_price} currency={currency ?? "INR"} />
          </Field>
          <Field label={`Customer selling price (${currency ?? "INR"})`}>
            <Input
              type="number"
              min={0}
              value={form.sell_price}
              onChange={(e) => set("sell_price", e.target.value)}
            />
            <InrEquivalent amount={form.sell_price} currency={currency ?? "INR"} />
          </Field>

          <Field label="Operational instructions" className="sm:col-span-2">
            <Textarea rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
          </Field>

          {invalid && (
            <p className="text-sm text-destructive sm:col-span-2">
              {timesInvalid
                ? "End time cannot be before the start time."
                : countsInvalid
                  ? "Participants and duration cannot be negative."
                  : participantsInvalid
                    ? "Add at least one participant."
                    : "Select a fulfilment partner for supplier-fulfilled activities."}
            </p>
          )}

          <div className="sm:col-span-2">
            <Button type="submit" disabled={save.isPending || invalid}>
              {save.isPending ? "Saving…" : "Save activity"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <Label className="mb-1 block">{label}</Label>
      {children}
    </div>
  );
}
