import { useState } from "react";
import { Car } from "lucide-react";
import { useSaveTransportService } from "@/lib/data";
import { FulfilmentFields } from "@/components/fulfilment-fields";
import { InrEquivalent, useCurrencyRates } from "@/components/currency-converter";
import { convertToInr, type CurrencyCode } from "@/lib/currency-converter";
import { PhoneNumberInput } from "@/components/phone-number-input";
import { parseValidPhoneNumber } from "@/lib/phone-number";
import { toast } from "sonner";
import { titleize } from "@/lib/crm";
import { TRANSPORT_TYPES, VEHICLE_TYPES, transportTitle, transportLine } from "@/lib/transport";
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
 * Structured transport service form. Writes the financial service line
 * (booking_items / quotation_items) and its transport_services detail row.
 * Pricing stays on the service line — transport_services holds no money.
 */
export function TransportServiceDialog({
  parent,
  parentId,
  currency = "INR",
  item,
  trigger,
}: {
  parent: "booking" | "quotation";
  parentId: string;
  currency?: string | null;
  /** Existing service line with its transport_services row, when editing. */
  item?: Row;
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const save = useSaveTransportService();
  const { rates } = useCurrencyRates();
  const transport: Row = Array.isArray(item?.transport_services)
    ? item?.transport_services?.[0]
    : item?.transport_services;

  const [form, setForm] = useState({
    transport_type: str(transport?.transport_type, "Airport Transfer"),
    pickup_location: str(transport?.pickup_location),
    drop_location: str(transport?.drop_location),
    start_date: str(transport?.start_date ?? item?.start_date),
    end_date: str(transport?.end_date ?? item?.end_date),
    pickup_time: str(transport?.pickup_time),
    drop_time: str(transport?.drop_time),
    vehicle_type: str(transport?.vehicle_type, "Sedan"),
    vehicle_registration: str(transport?.vehicle_registration),
    vehicle_capacity: str(transport?.vehicle_capacity),
    is_ac: transport?.is_ac === false ? "no" : "yes",
    passengers: str(transport?.passengers, "0"),
    driver_name: str(transport?.driver_name),
    driver_phone: str(transport?.driver_phone),
    supplier_id: str(transport?.supplier_id ?? item?.supplier_id),
    fulfilment_mode: str(
      item?.fulfilment_mode ??
        ((transport?.supplier_id ?? item?.supplier_id) ? "supplier" : "direct"),
      "direct",
    ),
    confirmation_number: str(transport?.confirmation_number ?? item?.confirmation_number),
    cost_price: str(item?.cost_price),
    sell_price: str(item?.sell_price),
    status: str(transport?.status ?? item?.status, "pending"),
    route_notes: str(transport?.route_notes),
    notes: str(transport?.notes),
  });

  const start = form.start_date;
  const end = form.end_date || form.start_date;
  const datesInvalid = Boolean(start && form.end_date && new Date(end) < new Date(start));
  const timesInvalid = Boolean(
    form.pickup_time &&
    form.drop_time &&
    (!form.end_date || form.end_date === form.start_date) &&
    form.drop_time < form.pickup_time,
  );

  function set(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (datesInvalid || timesInvalid) return;
    if (form.fulfilment_mode === "supplier" && !form.supplier_id) return;
    const driverPhone = form.driver_phone.trim()
      ? parseValidPhoneNumber(form.driver_phone)
      : null;
    if (form.driver_phone.trim() && !driverPhone) {
      toast.error("Enter a valid driver phone number for the selected country.");
      return;
    }
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
      transport_type: form.transport_type,
      pickup_location: form.pickup_location || null,
      drop_location: form.drop_location || null,
      route_notes: form.route_notes || null,
      start_date: form.start_date || null,
      end_date: end || null,
      pickup_time: form.pickup_time || null,
      drop_time: form.drop_time || null,
      vehicle_type: form.vehicle_type || null,
      vehicle_registration: form.vehicle_registration || null,
      vehicle_capacity:
        form.vehicle_capacity === "" ? null : Math.max(Number(form.vehicle_capacity) || 0, 0),
      is_ac: form.is_ac === "yes",
      passengers: Math.max(Number(form.passengers) || 0, 0),
      driver_name: form.driver_name || null,
      driver_phone: driverPhone,
      supplier_id: supplierId,
      confirmation_number: form.confirmation_number || null,
      status: form.status,
      notes: form.notes || null,
    };

    const serviceLine: Record<string, unknown> = {
      title: transportTitle(form.transport_type, detail),
      description: transportLine(detail),
      supplier_id: supplierId,
      fulfilment_mode: form.fulfilment_mode,
      start_date: form.start_date || null,
      end_date: end || null,
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
      // Transport prices are entered as service totals, so quantity stays 1.
      serviceLine["quantity"] = 1;
      serviceLine["city"] = form.pickup_location || null;
    }

    await save.mutateAsync({
      parent,
      parentId,
      itemId: item?.id ?? null,
      transportId: transport?.id ?? null,
      item: serviceLine,
      transport: detail,
    });
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline">
            <Car className="mr-2 size-4" /> Add transport
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {transport ? "Edit transport service" : "Add transport service"}
          </DialogTitle>
          <DialogDescription>
            Vehicle, route and driver details. Pricing stays on the service line so booking totals
            remain database-calculated.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
          <Field label="Transport type">
            <Select value={form.transport_type} onValueChange={(v) => set("transport_type", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TRANSPORT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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

          <Field label="Pickup location">
            <Input
              value={form.pickup_location}
              onChange={(e) => set("pickup_location", e.target.value)}
              placeholder="Hyderabad Airport"
            />
          </Field>
          <Field label="Drop location">
            <Input
              value={form.drop_location}
              onChange={(e) => set("drop_location", e.target.value)}
              placeholder="Hotel"
            />
          </Field>

          <Field label="Start date">
            <Input
              type="date"
              required
              value={form.start_date}
              onChange={(e) => set("start_date", e.target.value)}
            />
          </Field>
          <Field label="End date">
            <Input
              type="date"
              value={form.end_date}
              onChange={(e) => set("end_date", e.target.value)}
            />
          </Field>
          <Field label="Pickup time">
            <Input
              type="time"
              value={form.pickup_time}
              onChange={(e) => set("pickup_time", e.target.value)}
            />
          </Field>
          <Field label="Drop time">
            <Input
              type="time"
              value={form.drop_time}
              onChange={(e) => set("drop_time", e.target.value)}
            />
          </Field>

          <Field label="Vehicle type">
            <Select value={form.vehicle_type} onValueChange={(v) => set("vehicle_type", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VEHICLE_TYPES.map((v) => (
                  <SelectItem key={v} value={v}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="AC / Non-AC">
            <Select value={form.is_ac} onValueChange={(v) => set("is_ac", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="yes">AC</SelectItem>
                <SelectItem value="no">Non-AC</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Registration number">
            <Input
              value={form.vehicle_registration}
              onChange={(e) => set("vehicle_registration", e.target.value)}
              placeholder="TS09AB1234"
            />
          </Field>
          <Field label="Seating capacity">
            <Input
              type="number"
              min={0}
              value={form.vehicle_capacity}
              onChange={(e) => set("vehicle_capacity", e.target.value)}
              placeholder="Optional"
            />
          </Field>
          <Field label="Passengers">
            <Input
              type="number"
              min={0}
              value={form.passengers}
              onChange={(e) => set("passengers", e.target.value)}
            />
          </Field>

          <Field label="Driver name">
            <Input value={form.driver_name} onChange={(e) => set("driver_name", e.target.value)} />
          </Field>
          <Field label="Driver phone">
            <PhoneNumberInput
              id="transport-driver-phone"
              value={form.driver_phone}
              onChange={(value) => set("driver_phone", value)}
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
                      name: str(transport?.suppliers?.name ?? item?.suppliers?.name),
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
              placeholder="TRN12345"
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

          <Field label="Route notes" className="sm:col-span-2">
            <Textarea
              rows={2}
              value={form.route_notes}
              onChange={(e) => set("route_notes", e.target.value)}
              placeholder="Hotel → Charminar → Golconda Fort → Hotel"
            />
          </Field>
          <Field label="Operational instructions" className="sm:col-span-2">
            <Textarea rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
          </Field>

          {(datesInvalid || timesInvalid) && (
            <p className="text-sm text-destructive sm:col-span-2">
              {datesInvalid
                ? "End date cannot be before the start date."
                : "Drop time cannot be before pickup time on a single-day service."}
            </p>
          )}

          <div className="sm:col-span-2">
            <Button type="submit" disabled={save.isPending || datesInvalid || timesInvalid}>
              {save.isPending ? "Saving…" : "Save transport service"}
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
