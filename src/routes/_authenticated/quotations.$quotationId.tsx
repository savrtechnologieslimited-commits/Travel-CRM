import { useMemo, useState } from "react";
import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { BedDouble, Car, FileDown, Plus, Ticket, Trash2 } from "lucide-react";
import { HotelServiceDialog } from "@/components/hotel-service-dialog";
import { TransportServiceDialog } from "@/components/transport-service-dialog";
import { ActivityServiceDialog } from "@/components/activity-service-dialog";
import { InrEquivalent, useCurrencyRates } from "@/components/currency-converter";
import { hotelDetailPairs, hotelOf } from "@/lib/hotel";
import { transportDetailPairs, transportOf } from "@/lib/transport";
import { activityDetailPairs, activityOf } from "@/lib/activity";
import { convertToInr, type CurrencyCode } from "@/lib/currency-converter";
import { toast } from "sonner";

import {
  useItineraryBuilder,
  useQuotation,
  useConvertQuotationToBooking,
  useQuotationItems,
  useSuppliers,
  useUpdateQuotation,
  useAppSettings,
} from "@/lib/data";
import {
  ITEM_TYPES,
  QUOTATION_STATUSES,
  computeTotals,
  formatDate,
  formatMoney,
  gstRateFor,
  titleize,
  FULFILMENT_MODES,
  FULFILMENT_LABELS,
  fulfilmentLabel,
} from "@/lib/crm";
import { printQuotation } from "@/lib/quotation-pdf";
import { PageHeader } from "@/components/app-shell";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

export const Route = createFileRoute("/_authenticated/quotations/$quotationId")({
  head: () => ({
    meta: [
      { title: "Quotation builder — SAVR Travels CRM" },
      {
        name: "description",
        content:
          "Build a travel quotation item by item with supplier cost, sell price, markup, discount and GST, plus a day-wise itinerary.",
      },
      { property: "og:title", content: "Quotation builder — SAVR Travels CRM" },
      {
        property: "og:description",
        content: "Item-wise costing and day-wise itinerary builder for travel proposals.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: QuotationBuilderPage,
});

function QuotationBuilderPage() {
  const { quotationId } = useParams({ from: "/_authenticated/quotations/$quotationId" });
  const { data, isLoading } = useQuotation(quotationId);
  const quotation = data?.quotation;
  const items = data?.items ?? [];
  const settings = useAppSettings();
  const agencySettings = (settings.data?.find((row) => row.key === "agency")?.value ??
    null) as Record<string, unknown> | null;

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading quotation…</p>;
  if (!quotation) return <p className="text-sm text-muted-foreground">Quotation not found.</p>;

  return (
    <div>
      <PageHeader
        title={quotation.title}
        subtitle={`Quotation No: ${quotation.code ?? "Not issued"} · v${quotation.version} · ${titleize(quotation.scope)}${
          quotation.destinations?.name ? ` · ${quotation.destinations.name}` : ""
        }`}
        actions={
          <div className="flex items-center gap-3">
            <StatusBadge status={quotation.status} />
            <Button
              variant="outline"
              onClick={() =>
                printQuotation({
                  quotation,
                  items,
                  days: (data?.days ?? []) as Record<string, unknown>[],
                  agency: agencySettings,
                })
              }
            >
              <FileDown className="size-4" /> Download PDF
            </Button>
            <ConvertButton quotationId={quotationId} />
          </div>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryTile label="Customer" value={quotation.customers?.full_name ?? "—"} />
        <SummaryTile
          label="Travel window"
          value={`${formatDate(quotation.travel_start)} → ${formatDate(quotation.travel_end)}`}
        />
        <SummaryTile
          label="Pax"
          value={`${quotation.adults ?? 0} adults · ${quotation.children ?? 0} children`}
        />
        <SummaryTile label="Valid until" value={formatDate(quotation.valid_until)} />
      </div>

      <Tabs defaultValue="items">
        <TabsList>
          <TabsTrigger value="items">Costing</TabsTrigger>
          <TabsTrigger value="itinerary">Itinerary</TabsTrigger>
          <TabsTrigger value="terms">Pricing & terms</TabsTrigger>
        </TabsList>

        <TabsContent value="items" className="mt-4">
          <ItemsPanel quotationId={quotationId} items={items} currency={quotation.currency} />
        </TabsContent>

        <TabsContent value="itinerary" className="mt-4">
          <ItineraryPanel
            quotationId={quotationId}
            title={quotation.title}
            itineraryId={data?.itinerary?.id ?? null}
            days={data?.days ?? []}
          />
        </TabsContent>

        <TabsContent value="terms" className="mt-4">
          <PricingPanel quotation={quotation} items={items} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ConvertButton({ quotationId }: { quotationId: string }) {
  const convert = useConvertQuotationToBooking();
  const navigate = useNavigate();
  return (
    <Button
      onClick={async () => {
        const id = await convert.mutateAsync(quotationId);
        navigate({ to: "/bookings/$bookingId", params: { bookingId: id } });
      }}
      disabled={convert.isPending}
    >
      {convert.isPending ? "Converting…" : "Convert to booking"}
    </Button>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-xs tracking-wide text-muted-foreground uppercase">{label}</p>
        <p className="mt-1 font-medium">{value}</p>
      </CardContent>
    </Card>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Item = any;

function ItemsPanel({
  quotationId,
  items,
  currency,
}: {
  quotationId: string;
  items: Item[];
  currency?: string | null;
}) {
  const { add, remove } = useQuotationItems(quotationId);
  const { rates } = useCurrencyRates();
  const { data: suppliers = [] } = useSuppliers();
  const [form, setForm] = useState({
    item_type: "hotel",
    title: "",
    city: "",
    supplier_id: "",
    fulfilment_mode: "direct",
    quantity: "1",
    nights: "",
    cost_price: "",
    sell_price: "",
    description: "",
  });

  function set(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const code = (currency ?? "INR") as CurrencyCode;
    const costPrice = Number(form.cost_price) || 0;
    const sellPrice = Number(form.sell_price) || 0;
    const costPriceInr = costPrice ? convertToInr(costPrice, code, rates?.rates) : 0;
    const sellPriceInr = sellPrice ? convertToInr(sellPrice, code, rates?.rates) : 0;
    if (costPriceInr === null || sellPriceInr === null) {
      toast.error("Live exchange rates are required to save quotation prices with their INR equivalents. Please try again.");
      return;
    }
    await add.mutateAsync({
      item_type: form.item_type,
      title: form.title,
      city: form.city || null,
      supplier_id: form.fulfilment_mode === "supplier" ? form.supplier_id || null : null,
      fulfilment_mode:
        form.fulfilment_mode === "supplier" && form.supplier_id ? "supplier" : "direct",
      quantity: Number(form.quantity) || 1,
      nights: form.nights ? Number(form.nights) : null,
      cost_price: costPrice,
      cost_price_inr: costPriceInr,
      sell_price: sellPrice,
      sell_price_inr: sellPriceInr,
      exchange_rate: costPrice > 0 ? costPriceInr / costPrice : sellPrice > 0 ? sellPriceInr / sellPrice : 1,
      exchange_rate_updated_at: rates?.updatedAt ?? null,
      description: form.description || null,
      sort_order: items.length + 1,
    });
    setForm((f) => ({ ...f, title: "", cost_price: "", sell_price: "", description: "" }));
  }

  const totals = computeTotals(items, {});

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <Card className="overflow-x-auto p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Component</TableHead>
              <TableHead>Qty</TableHead>
              <TableHead className="text-right">Cost</TableHead>
              <TableHead className="text-right">Sell</TableHead>
              <TableHead className="text-right">Margin</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 && (
              <TableRow>
                <TableCell colSpan={6}>
                  No components yet — add hotels, flights, transfers.
                </TableCell>
              </TableRow>
            )}
            {items.map((item) => {
              const hotel = hotelOf(item);
              const transport = transportOf(item);
              const activity = activityOf(item);
              return (
                <TableRow key={item.id}>
                  <TableCell>
                    <p className="font-medium">{item.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {titleize(item.item_type)}
                      {item.city ? ` · ${item.city}` : ""}
                      {item.nights ? ` · ${item.nights} nights` : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Fulfilment: {fulfilmentLabel(item.fulfilment_mode, item.suppliers)}
                    </p>
                    {hotel && (
                      <dl className="mt-2 grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
                        {hotelDetailPairs(hotel).map(([label, value]) => (
                          <div key={label} className="flex gap-1">
                            <dt className="text-muted-foreground">{label}:</dt>
                            <dd className="font-medium">{value}</dd>
                          </div>
                        ))}
                      </dl>
                    )}
                    {transport && (
                      <dl className="mt-2 grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
                        {transportDetailPairs(transport).map(([label, value]) => (
                          <div key={label} className="flex min-w-0 gap-1">
                            <dt className="shrink-0 text-muted-foreground">{label}:</dt>
                            <dd className="min-w-0 break-words font-medium">{value}</dd>
                          </div>
                        ))}
                      </dl>
                    )}
                    {activity && (
                      <dl className="mt-2 grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
                        {activityDetailPairs(activity).map(([label, value]) => (
                          <div key={label} className="flex min-w-0 gap-1">
                            <dt className="shrink-0 text-muted-foreground">{label}:</dt>
                            <dd className="min-w-0 break-words font-medium">{value}</dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </TableCell>
                  <TableCell>{Number(item.quantity ?? 1)}</TableCell>
                  <TableCell className="text-right">
                    {formatMoney(
                      Number(item.cost_price) * Number(item.quantity ?? 1),
                      currency ?? "INR",
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatMoney(
                      Number(item.sell_price) * Number(item.quantity ?? 1),
                      currency ?? "INR",
                    )}
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    {formatMoney(
                      (Number(item.sell_price) - Number(item.cost_price)) *
                        Number(item.quantity ?? 1),
                      currency ?? "INR",
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      {transport && (
                        <TransportServiceDialog
                          parent="quotation"
                          parentId={quotationId}
                          currency={currency ?? "INR"}
                          item={item}
                          trigger={
                            <Button variant="ghost" size="sm">
                              Edit
                            </Button>
                          }
                        />
                      )}
                      {activity && (
                        <ActivityServiceDialog
                          parent="quotation"
                          parentId={quotationId}
                          currency={currency ?? "INR"}
                          item={item}
                          trigger={
                            <Button variant="ghost" size="sm">
                              Edit
                            </Button>
                          }
                        />
                      )}
                      {hotel && (
                        <HotelServiceDialog
                          parent="quotation"
                          parentId={quotationId}
                          currency={currency ?? "INR"}
                          item={item}
                          trigger={
                            <Button variant="ghost" size="sm">
                              Edit
                            </Button>
                          }
                        />
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => remove.mutate(item.id)}
                        aria-label="Remove item"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}

            {items.length > 0 && (
              <TableRow className="bg-muted/40 font-medium">
                <TableCell colSpan={2}>Subtotal</TableCell>
                <TableCell className="text-right">
                  {formatMoney(totals.cost, currency ?? "INR")}
                </TableCell>
                <TableCell className="text-right">
                  {formatMoney(totals.sell, currency ?? "INR")}
                </TableCell>
                <TableCell className="text-right">
                  {formatMoney(totals.sell - totals.cost, currency ?? "INR")}
                </TableCell>
                <TableCell />
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-base">Add component</CardTitle>
          <HotelServiceDialog
            parent="quotation"
            parentId={quotationId}
            currency={currency ?? "INR"}
            trigger={
              <Button variant="outline" size="sm">
                <BedDouble className="mr-2 size-4" /> Add hotel
              </Button>
            }
          />
          <TransportServiceDialog
            parent="quotation"
            parentId={quotationId}
            currency={currency ?? "INR"}
            trigger={
              <Button variant="outline" size="sm">
                <Car className="mr-2 size-4" /> Add transport
              </Button>
            }
          />
          <ActivityServiceDialog
            parent="quotation"
            parentId={quotationId}
            currency={currency ?? "INR"}
            trigger={
              <Button variant="outline" size="sm">
                <Ticket className="mr-2 size-4" /> Add activity
              </Button>
            }
          />
        </CardHeader>

        <CardContent>
          <form onSubmit={submit} className="grid gap-3">
            <div>
              <Label>Type</Label>
              <Select value={form.item_type} onValueChange={(v) => set("item_type", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ITEM_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {titleize(t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="i-title">Title</Label>
              <Input
                id="i-title"
                required
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder="Taj Malabar — Deluxe room"
              />
            </div>
            <div>
              <Label>Fulfilment</Label>
              <Select
                value={form.fulfilment_mode}
                onValueChange={(v) => {
                  set("fulfilment_mode", v);
                  if (v === "direct") set("supplier_id", "");
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FULFILMENT_MODES.map((m) => (
                    <SelectItem key={m} value={m}>
                      {FULFILMENT_LABELS[m]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {form.fulfilment_mode === "supplier" && (
              <div>
                <Label>Fulfilment partner</Label>
                <Select value={form.supplier_id} onValueChange={(v) => set("supplier_id", v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select partner (DMC, hotel, transport…)" />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name} · {titleize(s.supplier_types?.[0] ?? s.category)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label htmlFor="i-city">City</Label>
                <Input
                  id="i-city"
                  value={form.city}
                  onChange={(e) => set("city", e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="i-qty">Qty</Label>
                <Input
                  id="i-qty"
                  type="number"
                  min={1}
                  value={form.quantity}
                  onChange={(e) => set("quantity", e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="i-nights">Nights</Label>
                <Input
                  id="i-nights"
                  type="number"
                  min={0}
                  value={form.nights}
                  onChange={(e) => set("nights", e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="i-cost">Cost price</Label>
                <Input
                  id="i-cost"
                  type="number"
                  min={0}
                  value={form.cost_price}
                  onChange={(e) => set("cost_price", e.target.value)}
                />
                <InrEquivalent amount={form.cost_price} currency={currency ?? "INR"} />
              </div>
              <div>
                <Label htmlFor="i-sell">Sell price</Label>
                <Input
                  id="i-sell"
                  type="number"
                  min={0}
                  value={form.sell_price}
                  onChange={(e) => set("sell_price", e.target.value)}
                />
                <InrEquivalent amount={form.sell_price} currency={currency ?? "INR"} />
              </div>
            </div>
            <div>
              <Label htmlFor="i-desc">Notes</Label>
              <Textarea
                id="i-desc"
                rows={2}
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
              />
            </div>
            <Button type="submit" disabled={add.isPending}>
              <Plus className="mr-2 size-4" /> Add component
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function ItineraryPanel({
  quotationId,
  title,
  itineraryId,
  days,
}: {
  quotationId: string;
  title: string;
  itineraryId: string | null;
  days: Item[];
}) {
  const { ensure, addDay, removeDay } = useItineraryBuilder(quotationId);
  const [form, setForm] = useState({
    city: "",
    title: "",
    activities: "",
    meals: "Breakfast",
    hotel: "",
    transport: "",
    notes: "",
  });

  function set(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const id = itineraryId ?? (await ensure.mutateAsync(title));
    await addDay.mutateAsync({
      itinerary_id: id,
      day_number: days.length + 1,
      city: form.city || null,
      title: form.title,
      activities: form.activities
        ? form.activities
            .split(",")
            .map((a) => a.trim())
            .filter(Boolean)
        : [],
      meals: form.meals || null,
      hotel: form.hotel || null,
      transport: form.transport || null,
      notes: form.notes || null,
    });
    setForm((f) => ({ ...f, title: "", activities: "", notes: "" }));
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <div className="space-y-3">
        {days.length === 0 && (
          <Card>
            <CardContent className="pt-6 text-sm text-muted-foreground">
              No days added yet. Build the day-wise plan on the right.
            </CardContent>
          </Card>
        )}
        {days.map((day) => (
          <Card key={day.id}>
            <CardContent className="flex gap-4 pt-6">
              <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-sm font-semibold text-primary">
                D{day.day_number}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium">{day.title ?? `Day ${day.day_number}`}</p>
                <p className="text-xs text-muted-foreground">
                  {day.city ?? "—"}
                  {day.hotel ? ` · ${day.hotel}` : ""}
                  {day.meals ? ` · ${day.meals}` : ""}
                </p>
                {Array.isArray(day.activities) && day.activities.length > 0 && (
                  <ul className="mt-2 list-inside list-disc text-sm text-muted-foreground">
                    {day.activities.map((a: string) => (
                      <li key={a}>{a}</li>
                    ))}
                  </ul>
                )}
                {day.notes && <p className="mt-2 text-sm">{day.notes}</p>}
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeDay.mutate(day.id)}
                aria-label="Remove day"
              >
                <Trash2 className="size-4" />
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add day {days.length + 1}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="grid gap-3">
            <div>
              <Label htmlFor="d-title">Day title</Label>
              <Input
                id="d-title"
                required
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder="Arrival & Fort Kochi walk"
              />
            </div>
            <div>
              <Label htmlFor="d-city">City</Label>
              <Input id="d-city" value={form.city} onChange={(e) => set("city", e.target.value)} />
            </div>
            <div>
              <Label htmlFor="d-act">Activities (comma separated)</Label>
              <Textarea
                id="d-act"
                rows={2}
                value={form.activities}
                onChange={(e) => set("activities", e.target.value)}
                placeholder="Chinese fishing nets, Kathakali show"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="d-hotel">Hotel</Label>
                <Input
                  id="d-hotel"
                  value={form.hotel}
                  onChange={(e) => set("hotel", e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="d-meals">Meals</Label>
                <Input
                  id="d-meals"
                  value={form.meals}
                  onChange={(e) => set("meals", e.target.value)}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="d-transport">Transport</Label>
              <Input
                id="d-transport"
                value={form.transport}
                onChange={(e) => set("transport", e.target.value)}
                placeholder="Innova Crysta — airport pickup"
              />
            </div>
            <div>
              <Label htmlFor="d-notes">Notes</Label>
              <Textarea
                id="d-notes"
                rows={2}
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
              />
            </div>
            <Button type="submit" disabled={addDay.isPending || ensure.isPending}>
              <Plus className="mr-2 size-4" /> Add day
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function PricingPanel({ quotation, items }: { quotation: Item; items: Item[] }) {
  const update = useUpdateQuotation();
  const { rates } = useCurrencyRates();
  const [form, setForm] = useState({
    markup_amount: String(quotation.markup_amount ?? 0),
    service_charge: String(quotation.service_charge ?? 0),
    discount: String(quotation.discount ?? 0),
    gst_rate: String(gstRateFor(quotation.scope)),
    status: quotation.status ?? "draft",
    terms: quotation.terms ?? "",
    notes: quotation.notes ?? "",
  });

  function set(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const totals = useMemo(
    () =>
      computeTotals(items, {
        markup: Number(form.markup_amount) || 0,
        serviceCharge: Number(form.service_charge) || 0,
        discount: Number(form.discount) || 0,
        gstRate: Number(form.gst_rate) || 0,
      }),
    [items, form],
  );

  const currency = quotation.currency ?? "INR";
  const pax = Math.max(Number(quotation.adults ?? 0) + Number(quotation.children ?? 0), 1);

  async function save() {
    const totalCostInr = convertToInr(totals.cost, currency as CurrencyCode, rates?.rates);
    const totalPriceInr = convertToInr(totals.total, currency as CurrencyCode, rates?.rates);
    const exchangeRate = convertToInr(1, currency as CurrencyCode, rates?.rates);
    if (totalCostInr === null || totalPriceInr === null || exchangeRate === null) {
      toast.error("Live exchange rates are required to save this quotation's INR totals. Please try again.");
      return;
    }
    await update.mutateAsync({
      id: quotation.id,
      values: {
        markup_amount: Number(form.markup_amount) || 0,
        service_charge: Number(form.service_charge) || 0,
        discount: Number(form.discount) || 0,
        tax_amount: totals.tax,
        total_cost: totals.cost,
        total_cost_inr: totalCostInr,
        total_price: totals.total,
        total_price_inr: totalPriceInr,
        exchange_rate: exchangeRate,
        exchange_rate_updated_at: rates?.updatedAt ?? null,
        status: form.status,
        terms: form.terms || null,
        notes: form.notes || null,
        ...(form.status === "sent" ? { sent_at: new Date().toISOString() } : {}),
        ...(form.status === "accepted" ? { accepted_at: new Date().toISOString() } : {}),
      },
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pricing</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="p-markup">Markup</Label>
              <Input
                id="p-markup"
                type="number"
                value={form.markup_amount}
                onChange={(e) => set("markup_amount", e.target.value)}
              />
              <InrEquivalent amount={form.markup_amount} currency={currency} />
            </div>
            <div>
              <Label htmlFor="p-service">Service charge</Label>
              <Input
                id="p-service"
                type="number"
                value={form.service_charge}
                onChange={(e) => set("service_charge", e.target.value)}
              />
              <InrEquivalent amount={form.service_charge} currency={currency} />
            </div>
            <div>
              <Label htmlFor="p-discount">Discount</Label>
              <Input
                id="p-discount"
                type="number"
                value={form.discount}
                onChange={(e) => set("discount", e.target.value)}
              />
              <InrEquivalent amount={form.discount} currency={currency} />
            </div>
            <div>
              <Label htmlFor="p-gst">GST %</Label>
              <Input
                id="p-gst"
                type="number"
                value={form.gst_rate}
                onChange={(e) => set("gst_rate", e.target.value)}
              />
            </div>
          </div>

          <div>
            <Label>Status</Label>
            <Select value={form.status} onValueChange={(v) => set("status", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {QUOTATION_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {titleize(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="p-terms">Terms & conditions</Label>
            <Textarea
              id="p-terms"
              rows={4}
              value={form.terms}
              onChange={(e) => set("terms", e.target.value)}
              placeholder="50% advance on confirmation, balance 15 days before departure…"
            />
          </div>
          <div>
            <Label htmlFor="p-notes">Internal notes</Label>
            <Textarea
              id="p-notes"
              rows={2}
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
            />
          </div>

          <Button onClick={save} disabled={update.isPending}>
            {update.isPending ? "Saving…" : "Save quotation"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Row label="Supplier cost" value={formatMoney(totals.cost, currency)} />
          <Row label="Component sell" value={formatMoney(totals.sell, currency)} />
          <Row label="Markup" value={formatMoney(totals.markup, currency)} />
          <Row label="Service charge" value={formatMoney(totals.serviceCharge, currency)} />
          <Row label="Discount" value={`- ${formatMoney(totals.discount, currency)}`} />
          <Row label="Taxable value" value={formatMoney(totals.taxable, currency)} />
          <Row label={`GST @ ${totals.rate}%`} value={formatMoney(totals.tax, currency)} />
          <div className="border-t border-border pt-2">
            <Row
              label="Total payable"
              value={formatMoney(totals.total, currency)}
              className="text-base font-semibold"
            />
            <Row
              label={`Per person (${pax} pax)`}
              value={formatMoney(totals.total / pax, currency)}
            />
            <Row
              label="Gross margin"
              value={`${formatMoney(totals.margin, currency)} (${
                totals.taxable ? ((totals.margin / totals.taxable) * 100).toFixed(1) : "0.0"
              }%)`}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={`flex items-center justify-between gap-4 ${className ?? ""}`}>
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
