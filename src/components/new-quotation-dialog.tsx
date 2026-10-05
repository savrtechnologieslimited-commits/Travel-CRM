import { useState } from "react";
import { DestinationInput, useDestinationResolver } from "@/components/destination-input";
import { InrEquivalent, useCurrencyRates } from "@/components/currency-converter";
import { FilePlus2 } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useCreateQuotation, useEnquiries } from "@/lib/data";
import { toast } from "sonner";
import { CURRENCIES, titleize, today } from "@/lib/crm";
import { convertToInr, type CurrencyCode } from "@/lib/currency-converter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

export function NewQuotationDialog() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const create = useCreateQuotation();
  const resolveDestination = useDestinationResolver();
  const { data: enquiries = [] } = useEnquiries("all");
  const { rates } = useCurrencyRates();

  const [form, setForm] = useState({
    title: "",
    enquiry_id: "",
    scope: "domestic",
    destination_name: "",
    travel_start: "",
    travel_end: "",
    adults: "2",
    children: "0",
    currency: "INR",
    valid_until: "",
  });

  function set(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function pickEnquiry(id: string) {
    const enquiry = enquiries.find((e) => e.id === id);
    setForm((f) => ({
      ...f,
      enquiry_id: id,
      scope: enquiry?.scope ?? f.scope,
      travel_start: enquiry?.departure_date ?? f.travel_start,
      travel_end: enquiry?.return_date ?? f.travel_end,
      adults: String(enquiry?.adults ?? f.adults),
      children: String(enquiry?.children ?? f.children),
      currency: enquiry?.currency ?? f.currency,
      title:
        f.title ||
        `${enquiry?.destinations?.name ?? "Trip"} — ${enquiry?.customers?.full_name ?? "Guest"}`,
    }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const exchangeRate = convertToInr(1, form.currency as CurrencyCode, rates?.rates);
    if (exchangeRate === null) {
      toast.error("Live exchange rates are required to create a quotation with an INR snapshot. Please try again.");
      return;
    }
    const destinationId = await resolveDestination(form.destination_name, form.scope);
    const id = await create.mutateAsync({
      title: form.title || "New quotation",
      enquiry_id: form.enquiry_id || null,
      scope: form.scope,
      destination_id: destinationId,
      travel_start: form.travel_start || null,
      travel_end: form.travel_end || null,
      adults: Number(form.adults) || 1,
      children: Number(form.children) || 0,
      currency: form.currency,
      exchange_rate: exchangeRate,
      exchange_rate_updated_at: rates?.updatedAt ?? null,
      valid_until: form.valid_until || null,
      status: "draft",
    });
    setOpen(false);
    navigate({ to: "/quotations/$quotationId", params: { quotationId: id } });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <FilePlus2 className="mr-2 size-4" /> New quotation
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create quotation</DialogTitle>
          <DialogDescription>
            Start from an enquiry to pull travel dates and pax, or build one from scratch.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>Link enquiry</Label>
            <Select value={form.enquiry_id} onValueChange={pickEnquiry}>
              <SelectTrigger>
                <SelectValue placeholder="Optional — pick an enquiry" />
              </SelectTrigger>
              <SelectContent>
                {enquiries.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.customers?.full_name ?? "Guest"} · {e.destinations?.name ?? "—"} ({e.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="sm:col-span-2">
            <Label htmlFor="q-title">Quotation title</Label>
            <Input
              id="q-title"
              required
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="Kerala Backwaters — Reddy Family"
            />
          </div>

          <div>
            <Label>Scope</Label>
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

          <div>
            <Label>Destination</Label>
            <DestinationInput
              value={form.destination_name}
              onChange={(v) => set("destination_name", v)}
              scope={form.scope}
            />
          </div>

          <div>
            <Label htmlFor="q-start">Travel start</Label>
            <Input
              id="q-start"
              type="date"
              value={form.travel_start}
              onChange={(e) => set("travel_start", e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="q-end">Travel end</Label>
            <Input
              id="q-end"
              type="date"
              value={form.travel_end}
              onChange={(e) => set("travel_end", e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="q-adults">Adults</Label>
            <Input
              id="q-adults"
              type="number"
              min={1}
              value={form.adults}
              onChange={(e) => set("adults", e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="q-children">Children</Label>
            <Input
              id="q-children"
              type="number"
              min={0}
              value={form.children}
              onChange={(e) => set("children", e.target.value)}
            />
          </div>

          <div>
            <Label>Currency</Label>
            <Select value={form.currency} onValueChange={(v) => set("currency", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {titleize(c)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <InrEquivalent amount="1" currency={form.currency} />
          </div>
          <div>
            <Label htmlFor="q-valid">Valid until</Label>
            <Input
              id="q-valid"
              type="date"
              min={today()}
              value={form.valid_until}
              onChange={(e) => set("valid_until", e.target.value)}
            />
          </div>

          <DialogFooter className="sm:col-span-2">
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? "Creating…" : "Create & open builder"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
