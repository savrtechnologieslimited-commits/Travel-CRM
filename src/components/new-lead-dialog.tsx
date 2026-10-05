import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useConvertLeadToCustomer, useUpsert } from "@/lib/data";
import { AssigneeSelect, useCanAssign } from "@/components/assignee-select";
import {
  LEAD_SOURCES,
  CURRENCIES,
  PRIORITIES,
  TRIP_TYPES,
  titleize,
  validateTravelDateRange,
  validateTravellerCounts,
} from "@/lib/crm";
import { toast } from "sonner";
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
import { PhoneNumberInput } from "@/components/phone-number-input";
import { parseValidPhoneNumber } from "@/lib/phone-number";

function getNextDate(date: string) {
  const next = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(next.getTime())) return "";
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

type CityNightStay = { city: string; nights: string };

function getCityNightStays(value: unknown): CityNightStay[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const stay = item as Record<string, unknown>;
    return [
      {
        city: typeof stay["city"] === "string" ? stay["city"] : "",
        nights:
          Number.isInteger(stay["nights"]) && Number(stay["nights"]) >= 1
            ? String(stay["nights"])
            : "1",
      },
    ];
  });
}

export function NewLeadDialog({
  record,
  trigger,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  record?: Record<string, any> | null;
  trigger?: React.ReactNode;
} = {}) {
  const [open, setOpen] = useState(false);
  const upsert = useUpsert("leads", "Lead");
  const createCustomer = useConvertLeadToCustomer();
  const { rates } = useCurrencyRates();
  const { canAssign } = useCanAssign();
  const [assignedTo, setAssignedTo] = useState<string | null>(
    (record?.["assigned_to"] as string | null) ?? null,
  );

  const v = (key: string, fallback = "") => {
    const raw = record?.[key];
    return raw === null || raw === undefined ? fallback : String(raw);
  };
  const [form, setForm] = useState({
    customer_name: v("customer_name"),
    mobile: v("mobile"),
    email: v("email"),
    source: v("source", "whatsapp"),
    scope: v("scope", "domestic"),
    trip_name: v("destination_text") || String(record?.["destinations"]?.name ?? ""),
    travel_start: v("travel_start"),
    travel_end: v("travel_end"),
    adults: v("adults", "2"),
    children: v("children", "0"),
    budget: v("budget"),
    currency: v("currency", "INR"),
    priority: v("priority", "medium"),
    trip_type: v("trip_type", "family"),
    client_requirement: v("special_requirements"),
    notes: v("notes"),
  });
  const [cityNightStays, setCityNightStays] = useState<CityNightStay[]>(() =>
    getCityNightStays(record?.["city_nights"]),
  );

  function set(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function updateCityNightStay(index: number, key: keyof CityNightStay, value: string) {
    setCityNightStays((stays) =>
      stays.map((stay, stayIndex) => (stayIndex === index ? { ...stay, [key]: value } : stay)),
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const dateError = validateTravelDateRange(form.travel_start, form.travel_end);
    const travellerError = validateTravellerCounts(form.adults, form.children);
    if (dateError) {
      toast.error(dateError);
      return;
    }
    if (form.travel_start && form.travel_end && form.travel_end <= form.travel_start) {
      toast.error("Trip end date must be after travel start date.");
      return;
    }
    if (travellerError) {
      toast.error(travellerError);
      return;
    }
    const mobile = form.mobile.trim() ? parseValidPhoneNumber(form.mobile) : null;
    if (form.mobile.trim() && !mobile) {
      toast.error("Enter a valid mobile number for the selected country.");
      return;
    }
    if (
      cityNightStays.some(
        (stay) => !stay.city.trim() || !/^\d+$/.test(stay.nights) || Number(stay.nights) < 1,
      )
    ) {
      toast.error("Enter a city and at least one night for each stay.");
      return;
    }
    const budgetInr = form.budget ? convertToInr(Number(form.budget), form.currency as CurrencyCode, rates?.rates) : null;
    if (form.budget && budgetInr === null) {
      toast.error("Live exchange rates are required to save this budget with its INR equivalent. Please try again.");
      return;
    }
    const leadId = await upsert.mutateAsync({
      id: record?.["id"] as string | undefined,
      values: {
        customer_name: form.customer_name,
        mobile,
        email: form.email || null,
        source: form.source,
        scope: form.scope,
        destination_id: (record?.["destination_id"] as string | null | undefined) ?? null,
        destination_text: form.trip_name.trim() || null,
        travel_start: form.travel_start || null,
        travel_end: form.travel_end || null,
        city_nights: cityNightStays.map((stay) => ({
          city: stay.city.trim(),
          nights: Number(stay.nights),
        })),
        adults: Number(form.adults) || 1,
        children: Number(form.children) || 0,
        budget: form.budget ? Number(form.budget) : null,
        currency: form.currency,
        budget_inr: budgetInr,
        exchange_rate: budgetInr !== null && Number(form.budget) > 0 ? budgetInr / Number(form.budget) : 1,
        exchange_rate_updated_at: rates?.updatedAt ?? null,
        priority: form.priority,
        trip_type: form.trip_type,
        special_requirements: form.client_requirement || null,
        notes: form.notes || null,
        ...(canAssign ? { assigned_to: assignedTo } : {}),
        ...(record ? {} : { status: "new" }),
      },
    });
    if (!record && leadId) {
      try {
        await createCustomer.mutateAsync(leadId);
      } catch {
        toast.error("Lead saved, but its customer profile could not be created. Open the lead to retry.");
      }
    }
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <Plus className="mr-2 size-4" /> New lead
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-display">
            {record ? "Edit lead" : "Capture a new lead"}
          </DialogTitle>
          <DialogDescription>
            Log an enquiry from WhatsApp, a call, Instagram or a walk-in.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="lead-name">Customer name</Label>
            <Input
              id="lead-name"
              required
              value={form.customer_name}
              onChange={(e) => set("customer_name", e.target.value)}
              placeholder="Ramesh Reddy"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lead-mobile">Mobile</Label>
            <PhoneNumberInput
              id="lead-mobile"
              value={form.mobile}
              onChange={(value) => set("mobile", value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lead-email">Email</Label>
            <Input
              id="lead-email"
              type="email"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Source</Label>
            <Select value={form.source} onValueChange={(v) => set("source", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LEAD_SOURCES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {titleize(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Trip scope</Label>
            <Select value={form.scope} onValueChange={(v) => set("scope", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="domestic">Domestic</SelectItem>
                <SelectItem value="international">International</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="lead-trip-name">Trip name</Label>
            <Input
              id="lead-trip-name"
              value={form.trip_name}
              onChange={(event) => set("trip_name", event.target.value)}
              placeholder="e.g. Kerala family holiday"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lead-date">Travel start</Label>
            <Input
              id="lead-date"
              type="date"
              value={form.travel_start}
              onChange={(e) => set("travel_start", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lead-end-date">Trip end</Label>
            <Input
              id="lead-end-date"
              type="date"
              min={form.travel_start ? getNextDate(form.travel_start) : undefined}
              value={form.travel_end}
              onChange={(e) => set("travel_end", e.target.value)}
            />
          </div>
          <div className="space-y-3 sm:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <Label>City / night stays</Label>
                <p className="text-xs text-muted-foreground">
                  Add each city and the number of nights spent there.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setCityNightStays((stays) => [...stays, { city: "", nights: "1" }])
                }
              >
                <Plus className="size-4" /> Add city
              </Button>
            </div>
            {cityNightStays.map((stay, index) => (
              <div
                key={index}
                className="grid grid-cols-[minmax(0,1fr)_7rem_auto] items-end gap-2"
              >
                <div className="space-y-2">
                  <Label htmlFor={`lead-stay-city-${index}`}>City</Label>
                  <Input
                    id={`lead-stay-city-${index}`}
                    required
                    value={stay.city}
                    onChange={(event) => updateCityNightStay(index, "city", event.target.value)}
                    placeholder="e.g. Jaipur"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`lead-stay-nights-${index}`}>Nights</Label>
                  <Input
                    id={`lead-stay-nights-${index}`}
                    type="number"
                    min={1}
                    step={1}
                    required
                    value={stay.nights}
                    onChange={(event) =>
                      updateCityNightStay(index, "nights", event.target.value)
                    }
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove ${stay.city || `city ${index + 1}`} stay`}
                  onClick={() =>
                    setCityNightStays((stays) => stays.filter((_, i) => i !== index))
                  }
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="lead-adults">Adults</Label>
              <Input
                id="lead-adults"
                type="number"
                min={1}
                value={form.adults}
                onChange={(e) => set("adults", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lead-children">Children</Label>
              <Input
                id="lead-children"
                type="number"
                min={0}
                value={form.children}
                onChange={(e) => set("children", e.target.value)}
              />
            </div>
          </div>
          {!record && (
            <div className="sm:col-span-2 grid gap-3">
              <div className="space-y-2">
                <Label htmlFor="lead-client-requirement">Client requirement</Label>
                <Textarea
                  id="lead-client-requirement"
                  rows={3}
                  value={form.client_requirement}
                  onChange={(e) => set("client_requirement", e.target.value)}
                  placeholder="Family trip with 4-star hotel and airport transfers"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lead-notes">Internal notes</Label>
                <Textarea
                  id="lead-notes"
                  rows={3}
                  value={form.notes}
                  onChange={(e) => set("notes", e.target.value)}
                  placeholder="Compare two suppliers and call after 6 PM"
                />
              </div>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="lead-budget">Budget ({form.currency})</Label>
            <Input
              id="lead-budget"
              type="number"
              min={0}
              value={form.budget}
              onChange={(e) => set("budget", e.target.value)}
              placeholder="150000"
            />
            <InrEquivalent amount={form.budget} currency={form.currency} />
          </div>
          <div className="space-y-2"><Label>Budget currency</Label><Select value={form.currency} onValueChange={(value) => set("currency", value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CURRENCIES.map((currency) => <SelectItem key={currency} value={currency}>{currency}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-2">
            <Label>Trip type</Label>
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
          </div>
          <div className="space-y-2">
            <Label>Priority</Label>
            <Select value={form.priority} onValueChange={(v) => set("priority", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRIORITIES.map((p) => (
                  <SelectItem key={p} value={p}>
                    {titleize(p)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Assigned to</Label>
            <AssigneeSelect value={assignedTo} onChange={setAssignedTo} disabled={!canAssign} />
          </div>
          <DialogFooter className="sm:col-span-2">
            <Button type="submit" disabled={upsert.isPending}>
              Save lead
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
