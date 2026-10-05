import { useState } from "react";
import { DestinationInput, useDestinationResolver } from "@/components/destination-input";
import { supabase } from "@/integrations/supabase/client";
import { Plus } from "lucide-react";
import {
  useBookingOptions,
  useCreateBooking,
  useCustomers,
  useRecordPayment,
  useSuppliers,
  useUpdateBooking,
  useUpsert,
} from "@/lib/data";
import {
  CURRENCIES,
  HOTEL_CATEGORIES,
  MEAL_PLANS,
  PAYMENT_METHODS,
  TRIP_TYPES,
  titleize,
  today,
  validateTravelDateRange,
  validateTravellerCounts,
} from "@/lib/crm";
import { toast } from "sonner";
import { AssigneeSelect, useCanAssign } from "@/components/assignee-select";
import { InrEquivalent, useCurrencyRates } from "@/components/currency-converter";
import { Button } from "@/components/ui/button";
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
import { convertToInr, type CurrencyCode } from "@/lib/currency-converter";
import { sendWacrmCustomerGreetingFn } from "@/lib/wacrm-customer-greeting";
import { PhoneNumberInput } from "@/components/phone-number-input";
import { parseValidPhoneNumber } from "@/lib/phone-number";

type Rec = Record<string, any> | null | undefined;

export type EntityDialogProps = { record?: Rec; trigger?: React.ReactNode };

function str(v: unknown, fallback = "") {
  return v === null || v === undefined ? fallback : String(v);
}

function Field({
  label,
  children,
  htmlFor,
}: {
  label: string;
  children: React.ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={htmlFor} className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

/* ------------------------------- Customer ------------------------------- */

export function NewCustomerDialog({ record, trigger }: EntityDialogProps = {}) {
  const [open, setOpen] = useState(false);
  const upsert = useUpsert("customers", "Customer");
  const [whatsappOptIn, setWhatsappOptIn] = useState(
    record?.["whatsapp_opt_in"] === true,
  );
  const [form, setForm] = useState({
    full_name: str(record?.["full_name"]),
    mobile: str(record?.["mobile"]),
    whatsapp: str(record?.["whatsapp"]),
    email: str(record?.["email"]),
    city: str(record?.["city"]),
    state: str(record?.["state"]),
    country: str(record?.["country"], "India"),
    segment: str(record?.["segment"], "individual"),
    passport_number: str(record?.["passport_number"]),
    passport_expiry: str(record?.["passport_expiry"]),
    notes: str(record?.["notes"]),
  });

  function set(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const mobile = form.mobile.trim() ? parseValidPhoneNumber(form.mobile) : null;
    const whatsapp = form.whatsapp.trim() ? parseValidPhoneNumber(form.whatsapp) : null;
    if (form.mobile.trim() && !mobile) {
      toast.error("Enter a valid mobile number for the selected country.");
      return;
    }
    if (form.whatsapp.trim() && !whatsapp) {
      toast.error("Enter a valid WhatsApp number for the selected country.");
      return;
    }
    const customerId = await upsert.mutateAsync({
      id: record?.["id"] as string | undefined,
      values: {
        full_name: form.full_name,
        mobile,
        whatsapp: whatsapp || mobile,
        email: form.email || null,
        city: form.city || null,
        state: form.state || null,
        country: form.country || null,
        segment: form.segment,
        passport_number: form.passport_number || null,
        passport_expiry: form.passport_expiry || null,
        notes: form.notes || null,
        whatsapp_opt_in: whatsappOptIn,
        whatsapp_opt_in_at: whatsappOptIn
          ? (str(record?.["whatsapp_opt_in_at"]) || new Date().toISOString())
          : null,
      },
    });
    setOpen(false);
    if (!record?.["id"] && whatsappOptIn) {
      try {
        await sendWacrmCustomerGreetingFn({ data: { customerId } });
        toast.success("Customer saved and WhatsApp greeting sent");
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "WACRM could not send the greeting.";
        toast.error(`Customer saved, but the WhatsApp greeting failed: ${message}`);
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <Plus className="mr-2 size-4" /> New customer
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{record ? "Edit customer" : "Add customer"}</DialogTitle>
          <DialogDescription>
            Traveller profile with contact and passport details.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
          <Field label="Full name">
            <Input
              required
              value={form.full_name}
              onChange={(e) => set("full_name", e.target.value)}
            />
          </Field>
          <Field label="Mobile" htmlFor="customer-mobile">
            <PhoneNumberInput id="customer-mobile" value={form.mobile} onChange={(value) => set("mobile", value)} />
          </Field>
          <Field label="WhatsApp" htmlFor="customer-whatsapp">
            <PhoneNumberInput id="customer-whatsapp" value={form.whatsapp} onChange={(value) => set("whatsapp", value)} />
          </Field>
          <div className="sm:col-span-2">
            <label className="flex items-start gap-2 text-sm">
              <input
                checked={whatsappOptIn}
                className="mt-0.5 size-4 accent-primary"
                onChange={(e) => setWhatsappOptIn(e.target.checked)}
                type="checkbox"
              />
              <span>
                Customer has agreed to receive WhatsApp messages. Send a greeting
                after saving.
              </span>
            </label>
          </div>
          <Field label="Email">
            <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
          </Field>
          <Field label="City">
            <Input value={form.city} onChange={(e) => set("city", e.target.value)} />
          </Field>
          <Field label="State">
            <Input value={form.state} onChange={(e) => set("state", e.target.value)} />
          </Field>
          <Field label="Segment">
            <Select value={form.segment} onValueChange={(v) => set("segment", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["individual", "family", "corporate", "group", "vip", "repeat"].map((s) => (
                  <SelectItem key={s} value={s}>
                    {titleize(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Passport number">
            <Input
              value={form.passport_number}
              onChange={(e) => set("passport_number", e.target.value)}
            />
          </Field>
          <Field label="Passport expiry">
            <Input
              type="date"
              value={form.passport_expiry}
              onChange={(e) => set("passport_expiry", e.target.value)}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Notes">
              <Textarea
                rows={2}
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
              />
            </Field>
          </div>
          <DialogFooter className="sm:col-span-2">
            <Button type="submit" disabled={upsert.isPending}>
              {upsert.isPending ? "Saving…" : "Save customer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------- Enquiry ------------------------------- */

export function NewEnquiryDialog({ record, trigger }: EntityDialogProps = {}) {
  const [open, setOpen] = useState(false);
  const resolveDestination = useDestinationResolver();
  const { data: customers = [] } = useCustomers();
  const upsert = useUpsert("enquiries", "Enquiry");
  const { rates } = useCurrencyRates();
  const { canAssign } = useCanAssign();
  const [assignedTo, setAssignedTo] = useState<string | null>(
    (record?.["assigned_to"] as string | null) ?? null,
  );

  const [form, setForm] = useState({
    customer_id: str(record?.["customer_id"]),
    scope: str(record?.["scope"], "domestic"),
    destination_name: str(record?.["destinations"]?.name),
    departure_city: str(record?.["departure_city"]),
    departure_date: str(record?.["departure_date"]),
    return_date: str(record?.["return_date"]),
    nights: str(record?.["nights"]),
    adults: str(record?.["adults"], "2"),
    children: str(record?.["children"], "0"),
    infants: str(record?.["infants"], "0"),
    budget_per_person: str(record?.["budget_per_person"]),
    currency: str(record?.["currency"], "INR"),
    hotel_category: str(record?.["hotel_category"], "3 Star"),
    meal_plan: str(record?.["meal_plan"], "Breakfast"),
    trip_type: str(record?.["trip_types"]?.[0], "family"),
    client_requirement: str(record?.["requirements"]),
    notes: str(record?.["lead"]?.notes ?? record?.["notes"]),
  });

  function set(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const dateError = validateTravelDateRange(form.departure_date, form.return_date);
    const travellerError = validateTravellerCounts(form.adults, form.children);
    if (dateError) {
      toast.error(dateError);
      return;
    }
    if (travellerError) {
      toast.error(travellerError);
      return;
    }
    const destinationId = await resolveDestination(form.destination_name, form.scope);
    const adults = Number(form.adults) || 0;
    const children = Number(form.children) || 0;
    const perPerson = Number(form.budget_per_person) || 0;
    const perPersonInr = perPerson ? convertToInr(perPerson, form.currency as CurrencyCode, rates?.rates) : null;
    if (perPerson && perPersonInr === null) {
      toast.error("Live exchange rates are required to save this budget with its INR equivalent. Please try again.");
      return;
    }
    const enquiryId = record?.["id"] as string | undefined;
    await upsert.mutateAsync({
      id: enquiryId,
      values: {
        customer_id: form.customer_id || null,
        scope: form.scope,
        destination_id: destinationId,
        departure_city: form.departure_city || null,
        departure_date: form.departure_date || null,
        return_date: form.return_date || null,
        nights: form.nights ? Number(form.nights) : null,
        adults,
        children,
        infants: Number(form.infants) || 0,
        budget_per_person: perPerson || null,
        total_budget: perPerson ? perPerson * (adults + children) : null,
        budget_per_person_inr: perPersonInr,
        total_budget_inr: perPersonInr === null ? null : perPersonInr * (adults + children),
        exchange_rate: perPerson && perPersonInr !== null ? perPersonInr / perPerson : 1,
        exchange_rate_updated_at: rates?.updatedAt ?? null,
        currency: form.currency,
        hotel_category: form.hotel_category,
        meal_plan: form.meal_plan,
        trip_types: [form.trip_type],
        requirements: form.client_requirement || null,
        ...(canAssign ? { assigned_to: assignedTo } : {}),
        ...(record ? {} : { status: "new" }),
      },
    });
    if (record?.["lead_id"] && form.notes) {
      await supabase
        .from("leads")
        .update({ notes: form.notes || null } as never)
        .eq("id", record["lead_id"]);
    }
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <Plus className="mr-2 size-4" /> New enquiry
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{record ? "Edit enquiry" : "Add enquiry"}</DialogTitle>
          <DialogDescription>Capture travel requirements ready for quotation.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
          <Field label="Customer">
            <Select value={form.customer_id} onValueChange={(v) => set("customer_id", v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select customer" />
              </SelectTrigger>
              <SelectContent>
                {customers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.full_name}
                    {c.mobile ? ` · ${c.mobile}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Scope">
            <Select value={form.scope} onValueChange={(v) => set("scope", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="domestic">Domestic</SelectItem>
                <SelectItem value="international">International</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Destination">
            <DestinationInput
              value={form.destination_name}
              onChange={(v) => set("destination_name", v)}
              scope={form.scope}
            />
          </Field>
          <Field label="Departure city">
            <Input
              value={form.departure_city}
              onChange={(e) => set("departure_city", e.target.value)}
            />
          </Field>
          <Field label="Departure date">
            <Input
              type="date"
              value={form.departure_date}
              onChange={(e) => set("departure_date", e.target.value)}
            />
          </Field>
          <Field label="Return date">
            <Input
              type="date"
              value={form.return_date}
              onChange={(e) => set("return_date", e.target.value)}
            />
          </Field>
          <Field label="Nights">
            <Input
              type="number"
              min={0}
              value={form.nights}
              onChange={(e) => set("nights", e.target.value)}
            />
          </Field>
          <div className="grid grid-cols-3 gap-2">
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
            <Field label="Infants">
              <Input
                type="number"
                min={0}
                value={form.infants}
                onChange={(e) => set("infants", e.target.value)}
              />
            </Field>
          </div>
          <Field label="Budget per person">
            <Input
              type="number"
              min={0}
              value={form.budget_per_person}
              onChange={(e) => set("budget_per_person", e.target.value)}
            />
            <InrEquivalent amount={form.budget_per_person} currency={form.currency} />
          </Field>
          <Field label="Currency">
            <Select value={form.currency} onValueChange={(v) => set("currency", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Hotel category">
            <Select value={form.hotel_category} onValueChange={(v) => set("hotel_category", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HOTEL_CATEGORIES.map((h) => (
                  <SelectItem key={h} value={h}>
                    {h}
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
                {MEAL_PLANS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Trip type">
            <Select value={form.trip_type} onValueChange={(v) => set("trip_type", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TRIP_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {titleize(t)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Assigned to">
            <AssigneeSelect value={assignedTo} onChange={setAssignedTo} disabled={!canAssign} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Client requirement">
              <Textarea
                rows={3}
                value={form.client_requirement}
                onChange={(e) => set("client_requirement", e.target.value)}
              />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Internal notes">
              <Textarea
                rows={3}
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
              />
            </Field>
          </div>
          <DialogFooter className="sm:col-span-2">
            <Button type="submit" disabled={upsert.isPending}>
              {upsert.isPending ? "Saving…" : "Save enquiry"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------- Booking ------------------------------- */

export function NewBookingDialog({ record, trigger }: EntityDialogProps = {}) {
  const [open, setOpen] = useState(false);
  const resolveDestination = useDestinationResolver();
  const { data: customers = [] } = useCustomers();
  const create = useCreateBooking();
  const updateBooking = useUpdateBooking();
  const { rates } = useCurrencyRates();

  const [form, setForm] = useState({
    customer_id: str(record?.["customer_id"]),
    scope: str(record?.["scope"], "domestic"),
    destination_name: str(record?.["destinations"]?.name),
    travel_start: str(record?.["travel_start"]),
    travel_end: str(record?.["travel_end"]),
    adults: str(record?.["adults"], "2"),
    children: str(record?.["children"], "0"),
    infants: str(record?.["infants"], "0"),
    currency: str(record?.["currency"], "INR"),
    total_cost: str(record?.["total_cost"]),
    total_price: str(record?.["total_price"]),
    payment_deadline: str(record?.["payment_deadline"]),
    notes: str(record?.["notes"]),
  });

  function set(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const totalCost = Number(form.total_cost) || 0;
    const totalPrice = Number(form.total_price) || 0;
    const totalCostInr = totalCost ? convertToInr(totalCost, form.currency as CurrencyCode, rates?.rates) : 0;
    const totalPriceInr = totalPrice ? convertToInr(totalPrice, form.currency as CurrencyCode, rates?.rates) : 0;
    if (totalCostInr === null || totalPriceInr === null) {
      toast.error("Live exchange rates are required to save this booking with INR equivalents. Please try again.");
      return;
    }
    const destinationId = await resolveDestination(form.destination_name, form.scope);
    const bookingId = record?.["id"] as string | undefined;

    // total_price / total_cost are database-derived (items + adjustment). Translate the
    // manually entered totals into adjustments so items are never double-counted.
    let itemsSell = 0;
    let itemsCost = 0;
    if (bookingId) {
      const { data: items } = await supabase
        .from("booking_items")
        .select("sell_price,cost_price")
        .eq("booking_id", bookingId);
      for (const i of items ?? []) {
        itemsSell += Number(i.sell_price ?? 0);
        itemsCost += Number(i.cost_price ?? 0);
      }
    }

    const values = {
      customer_id: form.customer_id || null,
      scope: form.scope,
      destination_id: destinationId,
      travel_start: form.travel_start || null,
      travel_end: form.travel_end || null,
      adults: Number(form.adults) || 0,
      children: Number(form.children) || 0,
      infants: Number(form.infants) || 0,
      booking_date: today(),
      currency: form.currency,
      total_cost_inr: totalCostInr,
      total_price_inr: totalPriceInr,
      exchange_rate: totalPrice > 0 ? totalPriceInr / totalPrice : totalCost > 0 ? totalCostInr / totalCost : 1,
      exchange_rate_updated_at: rates?.updatedAt ?? null,
      price_adjustment: (Number(form.total_price) || 0) - itemsSell,
      cost_adjustment: (Number(form.total_cost) || 0) - itemsCost,
      payment_deadline: form.payment_deadline || null,
      notes: form.notes || null,
    };
    if (bookingId) {
      await updateBooking.mutateAsync({ id: bookingId, values });
    } else {
      await create.mutateAsync({ ...values, status: "pending" });
    }
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <Plus className="mr-2 size-4" /> New booking
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{record ? "Edit booking" : "Direct booking"}</DialogTitle>
          <DialogDescription>
            For walk-ins, flight-only or visa-only sales without a quotation.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
          <Field label="Customer">
            <Select value={form.customer_id} onValueChange={(v) => set("customer_id", v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select customer" />
              </SelectTrigger>
              <SelectContent>
                {customers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Scope">
            <Select value={form.scope} onValueChange={(v) => set("scope", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="domestic">Domestic</SelectItem>
                <SelectItem value="international">International</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Destination">
            <DestinationInput
              value={form.destination_name}
              onChange={(v) => set("destination_name", v)}
              scope={form.scope}
            />
          </Field>
          <Field label="Currency">
            <Select value={form.currency} onValueChange={(v) => set("currency", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Travel start">
            <Input
              type="date"
              value={form.travel_start}
              onChange={(e) => set("travel_start", e.target.value)}
            />
          </Field>
          <Field label="Travel end">
            <Input
              type="date"
              value={form.travel_end}
              onChange={(e) => set("travel_end", e.target.value)}
            />
          </Field>
          <div className="grid grid-cols-3 gap-2">
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
            <Field label="Infants">
              <Input
                type="number"
                min={0}
                value={form.infants}
                onChange={(e) => set("infants", e.target.value)}
              />
            </Field>
          </div>
          <Field label="Payment deadline">
            <Input
              type="date"
              value={form.payment_deadline}
              onChange={(e) => set("payment_deadline", e.target.value)}
            />
          </Field>
          <Field label={`Total cost (supplier, ${form.currency})`}>
            <Input
              type="number"
              min={0}
              value={form.total_cost}
              onChange={(e) => set("total_cost", e.target.value)}
            />
            <InrEquivalent amount={form.total_cost} currency={form.currency} />
          </Field>
          <Field label={`Total sell price (${form.currency})`}>
            <Input
              type="number"
              min={0}
              required
              value={form.total_price}
              onChange={(e) => set("total_price", e.target.value)}
            />
            <InrEquivalent amount={form.total_price} currency={form.currency} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Notes">
              <Textarea
                rows={2}
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
              />
            </Field>
          </div>
          <DialogFooter className="sm:col-span-2">
            <Button type="submit" disabled={create.isPending || updateBooking.isPending}>
              {create.isPending || updateBooking.isPending
                ? "Saving…"
                : record
                  ? "Save booking"
                  : "Create booking"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------- Payment ------------------------------- */

export function RecordPaymentDialog() {
  const [open, setOpen] = useState(false);
  const { data: bookings = [] } = useBookingOptions();
  const { data: suppliers = [] } = useSuppliers();
  const record = useRecordPayment();
  const { rates } = useCurrencyRates();

  const [form, setForm] = useState({
    direction: "inbound",
    booking_id: "",
    supplier_id: "",
    amount: "",
    currency: "INR",
    method: "upi",
    reference: "",
    paid_on: today(),
    notes: "",
  });

  function set(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const booking = bookings.find((b) => b.id === form.booking_id);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const amount = Number(form.amount) || 0;
    const amountInr = amount ? convertToInr(amount, form.currency as CurrencyCode, rates?.rates) : 0;
    if (amountInr === null) {
      toast.error("Live exchange rates are required to save this payment with its INR equivalent. Please try again.");
      return;
    }
    await record.mutateAsync({
      booking_id: form.booking_id || null,
      customer_id: form.direction === "inbound" ? (booking?.customer_id ?? null) : null,
      supplier_id: form.direction === "outbound" ? form.supplier_id || null : null,
      direction: form.direction,
      amount,
      amount_inr: amountInr,
      exchange_rate: amount > 0 ? amountInr / amount : 1,
      exchange_rate_updated_at: rates?.updatedAt ?? null,
      currency: form.currency,
      method: form.method,
      reference: form.reference || null,
      paid_on: form.paid_on,
      status: "completed",
      notes: form.notes || null,
    });
    setOpen(false);
    setForm((f) => ({ ...f, amount: "", reference: "", notes: "" }));
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 size-4" /> Record payment
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Record payment</DialogTitle>
          <DialogDescription>
            Receipts from travellers or payouts to suppliers. Booking collections update
            automatically.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-3">
          <Field label="Direction">
            <Select value={form.direction} onValueChange={(v) => set("direction", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="inbound">Received from customer</SelectItem>
                <SelectItem value="outbound">Paid to supplier</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Booking">
            <Select value={form.booking_id} onValueChange={(v) => set("booking_id", v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select booking (optional)" />
              </SelectTrigger>
              <SelectContent>
                {bookings.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.code ?? "—"} · {b.customers?.full_name ?? "—"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {form.direction === "outbound" && (
            <Field label="Supplier">
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
            </Field>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount">
              <Input
                type="number"
                min={0}
                required
                value={form.amount}
                onChange={(e) => set("amount", e.target.value)}
              />
              <InrEquivalent amount={form.amount} currency={form.currency} />
            </Field>
            <Field label="Currency">
              <Select value={form.currency} onValueChange={(v) => set("currency", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Method">
              <Select value={form.method} onValueChange={(v) => set("method", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {titleize(m)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Paid on">
              <Input
                type="date"
                value={form.paid_on}
                onChange={(e) => set("paid_on", e.target.value)}
              />
            </Field>
          </div>
          <Field label="Reference / UTR">
            <Input value={form.reference} onChange={(e) => set("reference", e.target.value)} />
          </Field>
          <Field label="Notes">
            <Textarea rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
          </Field>
          <DialogFooter>
            <Button type="submit" disabled={record.isPending}>
              {record.isPending ? "Saving…" : "Record payment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
