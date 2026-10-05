import { useState } from "react";
import { BedDouble, Plus } from "lucide-react";
import { useSaveHotelService } from "@/lib/data";
import { FulfilmentFields } from "@/components/fulfilment-fields";
import { InrEquivalent, useCurrencyRates } from "@/components/currency-converter";
import { convertToInr, type CurrencyCode } from "@/lib/currency-converter";
import { toast } from "sonner";
import { titleize } from "@/lib/crm";
import {
  HOTEL_MEAL_PLANS,
  HOTEL_STAR_CATEGORIES,
  ROOM_TYPES,
  hotelTitle,
  nightsBetween,
} from "@/lib/hotel";
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
 * Structured hotel service form. Writes the financial service line
 * (booking_items / quotation_items) and its hotel_bookings detail row.
 */
export function HotelServiceDialog({
  parent,
  parentId,
  currency = "INR",
  item,
  trigger,
}: {
  parent: "booking" | "quotation";
  parentId: string;
  currency?: string | null;
  /** Existing service line with its hotel_bookings row, when editing. */
  item?: Row;
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const save = useSaveHotelService();
  const { rates } = useCurrencyRates();
  const hotel: Row = Array.isArray(item?.hotel_bookings)
    ? item?.hotel_bookings?.[0]
    : item?.hotel_bookings;

  const [form, setForm] = useState({
    hotel_name: str(hotel?.hotel_name),
    city: str(hotel?.city ?? item?.city),
    address: str(hotel?.address),
    country: str(hotel?.country),
    star_category: str(hotel?.star_category),
    check_in: str(hotel?.check_in ?? item?.start_date),
    check_out: str(hotel?.check_out ?? item?.end_date),
    rooms: str(hotel?.rooms, "1"),
    room_type: str(hotel?.room_type),
    adults: str(hotel?.adults, "2"),
    children: str(hotel?.children, "0"),
    extra_beds: str(hotel?.extra_beds, "0"),
    meal_plan: str(hotel?.meal_plan, "Breakfast"),
    supplier_id: str(hotel?.supplier_id ?? item?.supplier_id),
    fulfilment_mode: str(
      item?.fulfilment_mode ?? ((hotel?.supplier_id ?? item?.supplier_id) ? "supplier" : "direct"),
      "direct",
    ),
    confirmation_number: str(hotel?.confirmation_number ?? item?.confirmation_number),
    cost_price: str(item?.cost_price),
    sell_price: str(item?.sell_price),
    cancellation_deadline: str(hotel?.cancellation_deadline),
    status: str(hotel?.status ?? item?.status, "pending"),
    notes: str(hotel?.notes),
  });

  const nights = nightsBetween(form.check_in, form.check_out);
  const datesInvalid = Boolean(
    form.check_in && form.check_out && new Date(form.check_out) < new Date(form.check_in),
  );

  function set(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (datesInvalid) return;
    if (form.fulfilment_mode === "supplier" && !form.supplier_id) return;
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
    const title = hotelTitle(form.hotel_name, form.city);
    const rooms = Math.max(Number(form.rooms) || 1, 1);

    const serviceLine: Record<string, unknown> = {
      title,
      description: `${nights} ${nights === 1 ? "night" : "nights"}${form.room_type ? ` · ${form.room_type}` : ""} · ${rooms} ${rooms === 1 ? "room" : "rooms"}${form.meal_plan ? ` · ${form.meal_plan}` : ""}`,
      supplier_id: supplierId,
      fulfilment_mode: form.fulfilment_mode,
      start_date: form.check_in || null,
      end_date: form.check_out || null,
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
      // Quotation prices are entered as stay totals, so quantity stays 1.
      serviceLine["quantity"] = 1;
      serviceLine["city"] = form.city || null;
      serviceLine["nights"] = nights;
    }

    await save.mutateAsync({
      parent,
      parentId,
      itemId: item?.id ?? null,
      hotelId: hotel?.id ?? null,
      item: serviceLine,
      hotel: {
        hotel_name: form.hotel_name,
        city: form.city || null,
        address: form.address || null,
        country: form.country || null,
        star_category: form.star_category || null,
        check_in: form.check_in || null,
        check_out: form.check_out || null,
        rooms,
        room_type: form.room_type || null,
        adults: Number(form.adults) || 0,
        children: Number(form.children) || 0,
        extra_beds: Number(form.extra_beds) || 0,
        meal_plan: form.meal_plan || null,
        supplier_id: supplierId,
        confirmation_number: form.confirmation_number || null,
        cancellation_deadline: form.cancellation_deadline || null,
        status: form.status,
        notes: form.notes || null,
      },
    });
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline">
            <BedDouble className="mr-2 size-4" /> Add hotel
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{hotel ? "Edit hotel service" : "Add hotel service"}</DialogTitle>
          <DialogDescription>
            Structured hotel stay. Nights are calculated from the dates; pricing stays on the
            service line.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
          <Field label="Hotel name" className="sm:col-span-2">
            <Input
              required
              value={form.hotel_name}
              onChange={(e) => set("hotel_name", e.target.value)}
              placeholder="Taj Example"
            />
          </Field>
          <Field label="City">
            <Input
              value={form.city}
              onChange={(e) => set("city", e.target.value)}
              placeholder="Goa"
            />
          </Field>
          <Field label="Country">
            <Input value={form.country} onChange={(e) => set("country", e.target.value)} />
          </Field>
          <Field label="Location / address" className="sm:col-span-2">
            <Input value={form.address} onChange={(e) => set("address", e.target.value)} />
          </Field>
          <Field label="Category">
            <Select value={form.star_category} onValueChange={(v) => set("star_category", v)}>
              <SelectTrigger>
                <SelectValue placeholder="Optional" />
              </SelectTrigger>
              <SelectContent>
                {HOTEL_STAR_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Meal plan">
            <Select value={form.meal_plan} onValueChange={(v) => set("meal_plan", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HOTEL_MEAL_PLANS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Check-in">
            <Input
              type="date"
              value={form.check_in}
              onChange={(e) => set("check_in", e.target.value)}
            />
          </Field>
          <Field label="Check-out">
            <Input
              type="date"
              value={form.check_out}
              onChange={(e) => set("check_out", e.target.value)}
            />
          </Field>
          <div className="sm:col-span-2 -mt-1 text-sm">
            {datesInvalid ? (
              <span className="text-destructive">Check-out cannot be before check-in.</span>
            ) : (
              <span className="text-muted-foreground">
                Nights: <span className="font-medium text-foreground">{nights}</span> (calculated)
              </span>
            )}
          </div>

          <Field label="Rooms">
            <Input
              type="number"
              min={1}
              value={form.rooms}
              onChange={(e) => set("rooms", e.target.value)}
            />
          </Field>
          <Field label="Room type">
            <Select value={form.room_type} onValueChange={(v) => set("room_type", v)}>
              <SelectTrigger>
                <SelectValue placeholder="Optional" />
              </SelectTrigger>
              <SelectContent>
                {ROOM_TYPES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
          <Field label="Extra beds">
            <Input
              type="number"
              min={0}
              value={form.extra_beds}
              onChange={(e) => set("extra_beds", e.target.value)}
            />
          </Field>
          <Field label="Service status">
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

          <div className="grid gap-3 sm:col-span-2 sm:grid-cols-2">
            <FulfilmentFields
              mode={form.fulfilment_mode}
              supplierId={form.supplier_id}
              currentSupplier={
                form.supplier_id
                  ? {
                      id: form.supplier_id,
                      name: str(hotel?.suppliers?.name ?? item?.suppliers?.name),
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
          <Field label="Supplier confirmation no.">
            <Input
              value={form.confirmation_number}
              onChange={(e) => set("confirmation_number", e.target.value)}
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
          <Field label={`Selling price (${currency ?? "INR"})`}>
            <Input
              type="number"
              min={0}
              value={form.sell_price}
              onChange={(e) => set("sell_price", e.target.value)}
            />
            <InrEquivalent amount={form.sell_price} currency={currency ?? "INR"} />
          </Field>
          <Field label="Cancellation deadline">
            <Input
              type="date"
              value={form.cancellation_deadline}
              onChange={(e) => set("cancellation_deadline", e.target.value)}
            />
          </Field>
          <Field label="Internal notes" className="sm:col-span-2">
            <Textarea
              rows={2}
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Early check-in requested, sea-facing rooms"
            />
          </Field>

          <div className="sm:col-span-2 flex justify-end">
            <Button type="submit" disabled={save.isPending || datesInvalid}>
              <Plus className="mr-2 size-4" /> {hotel ? "Save hotel" : "Add hotel service"}
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
      <Label className="mb-1 block text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
