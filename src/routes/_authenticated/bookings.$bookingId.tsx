import { useState } from "react";
import { createFileRoute, useParams } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Trash2 } from "lucide-react";
import {
  useAddTravellerToBooking,
  useBooking,
  useRecordPayment,
  useRemoveTravellerFromBooking,
  useTravellerOptions,
  useUpdateBooking,
  useUpdateBookingItem,
} from "@/lib/data";
import {
  BOOKING_STATUSES,
  PAYMENT_METHODS,
  VISA_STATUSES,
  formatDate,
  formatMoney,
  titleize,
  today,
} from "@/lib/crm";
import { hotelDetailPairs, hotelOf, hotelStayLine } from "@/lib/hotel";
import { transportDetailPairs, transportLine, transportOf, transportRoute } from "@/lib/transport";
import { activityDetailPairs, activityLine, activityOf, activityTitle } from "@/lib/activity";
import { PageHeader } from "@/components/app-shell";
import { BookingFulfilmentEditor } from "@/components/fulfilment-fields";
import { HotelServiceDialog } from "@/components/hotel-service-dialog";
import { TransportServiceDialog } from "@/components/transport-service-dialog";
import { ActivityServiceDialog } from "@/components/activity-service-dialog";
import { buildItineraryFromBookingFn } from "@/lib/ai-booking-itinerary";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
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

export const Route = createFileRoute("/_authenticated/bookings/$bookingId")({
  head: () => ({
    meta: [
      { title: "Booking detail — SAVR Travels CRM" },
      {
        name: "description",
        content:
          "Manage a confirmed booking: service confirmations, payment collection schedule, visa status and travel documents.",
      },
      { property: "og:title", content: "Booking detail — SAVR Travels CRM" },
      {
        property: "og:description",
        content: "Operations view for a confirmed trip with services, payments and documents.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: BookingDetailPage,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

function BookingDetailPage() {
  const { bookingId } = useParams({ from: "/_authenticated/bookings/$bookingId" });
  const { data, isLoading } = useBooking(bookingId);
  const booking = data?.booking;
  const buildItinerary = useServerFn(buildItineraryFromBookingFn);
  const [generatingItinerary, setGeneratingItinerary] = useState(false);

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading booking…</p>;
  if (!booking) return <p className="text-sm text-muted-foreground">Booking not found.</p>;

  const currency = booking.currency ?? "INR";
  const total = Number(booking.total_price ?? 0);
  const received = Number(booking.amount_received ?? 0);
  const pct = total > 0 ? Math.min((received / total) * 100, 100) : 0;

  async function generateItinerary() {
    setGeneratingItinerary(true);
    try {
      const result = await buildItinerary({ data: { bookingId } });
      sessionStorage.setItem("itinerary-booking-draft", JSON.stringify(result));
      window.location.assign("/itinerary-builder?bookingDraft=1");
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Unable to generate itinerary.");
    } finally {
      setGeneratingItinerary(false);
    }
  }

  return (
    <div>
      <PageHeader
        title={booking.customers?.full_name ?? "Booking"}
        subtitle={`Booking No: ${booking.code ?? "Not issued"}${booking.invoice_code ? ` · Invoice No: ${booking.invoice_code}` : ""} · ${booking.destinations?.name ?? titleize(booking.scope)} · ${formatDate(
          booking.travel_start,
        )} → ${formatDate(booking.travel_end)}`}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => void generateItinerary()} disabled={generatingItinerary}>
              {generatingItinerary ? "Generating…" : "Generate itinerary"}
            </Button>
            <StatusBadge status={booking.status} />
            <StatusBadge status={booking.payment_status} />
          </div>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Booking value" value={formatMoney(total, currency)} />
        <Tile label="Collected" value={formatMoney(received, currency)} />
        <Tile label="Balance" value={formatMoney(total - received, currency)} />
        <Tile label="Payment deadline" value={formatDate(booking.payment_deadline)} />
      </div>

      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Collection progress</span>
            <span className="font-medium">{pct.toFixed(0)}%</span>
          </div>
          <Progress value={pct} className="mt-2 h-2" />
        </CardContent>
      </Card>

      <Tabs defaultValue="services">
        <TabsList>
          <TabsTrigger value="services">Services</TabsTrigger>
          <TabsTrigger value="travellers">Travellers</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="ops">Status & visa</TabsTrigger>
        </TabsList>

        <TabsContent value="services" className="mt-4 space-y-4">
          <HotelsPanel bookingId={booking.id} items={data?.items ?? []} currency={currency} />
          <TransportPanel bookingId={booking.id} items={data?.items ?? []} currency={currency} />
          <ActivitiesPanel bookingId={booking.id} items={data?.items ?? []} currency={currency} />
          <ServicesPanel items={data?.items ?? []} currency={currency} />
        </TabsContent>

        <TabsContent value="travellers" className="mt-4">
          <TravellersPanel bookingId={booking.id} links={data?.travellers ?? []} />
        </TabsContent>

        <TabsContent value="payments" className="mt-4">
          <PaymentsPanel booking={booking} payments={data?.payments ?? []} currency={currency} />
        </TabsContent>

        <TabsContent value="ops" className="mt-4">
          <OpsPanel booking={booking} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-xs tracking-wide text-muted-foreground uppercase">{label}</p>
        <p className="mt-1 font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}

/** Structured hotel stays on this booking — operations-ready, no raw JSON. */
function HotelsPanel({
  bookingId,
  items,
  currency,
}: {
  bookingId: string;
  items: Row[];
  currency: string;
}) {
  const hotels = items.filter((i: Row) => hotelOf(i));

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Hotels</CardTitle>
        <HotelServiceDialog parent="booking" parentId={bookingId} currency={currency} />
      </CardHeader>
      <CardContent className="space-y-3">
        {hotels.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No hotel stays yet. Add one to capture rooms, meal plan and supplier confirmation.
          </p>
        )}
        {hotels.map((item: Row) => {
          const h = hotelOf(item);
          return (
            <div key={item.id} className="rounded-lg border border-border p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium">
                    {h.hotel_name}
                    {h.city ? ` — ${h.city}` : ""}
                    {h.star_category ? ` · ${h.star_category}` : ""}
                  </p>
                  <p className="text-sm text-muted-foreground">{hotelStayLine(h)}</p>
                  <dl className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                    {hotelDetailPairs(h).map(([label, value]) => (
                      <div key={label} className="flex gap-1">
                        <dt className="text-muted-foreground">{label}:</dt>
                        <dd className="font-medium">{value}</dd>
                      </div>
                    ))}
                  </dl>

                  {h.address && <p className="text-xs text-muted-foreground">{h.address}</p>}
                  {h.notes && <p className="mt-1 text-sm">{h.notes}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={h.status ?? item.status} />
                  <span className="text-sm font-medium">
                    {formatMoney(item.sell_price, currency)}
                  </span>
                  <HotelServiceDialog
                    parent="booking"
                    parentId={bookingId}
                    currency={currency}
                    item={item}
                    trigger={
                      <Button variant="ghost" size="sm">
                        Edit
                      </Button>
                    }
                  />
                </div>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

/** Structured transport services on this booking — vehicle, driver, route. */
function TransportPanel({
  bookingId,
  items,
  currency,
}: {
  bookingId: string;
  items: Row[];
  currency: string;
}) {
  const services = items.filter((i: Row) => transportOf(i));

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Transport</CardTitle>
        <TransportServiceDialog parent="booking" parentId={bookingId} currency={currency} />
      </CardHeader>
      <CardContent className="space-y-3">
        {services.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No transport services yet. Add one to capture vehicle, driver and supplier confirmation.
          </p>
        )}
        {services.map((item: Row) => {
          const t = transportOf(item);
          return (
            <div key={item.id} className="rounded-lg border border-border p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium">
                    {t.transport_type}
                    {transportRoute(t) ? ` — ${transportRoute(t)}` : ""}
                  </p>
                  <p className="text-sm text-muted-foreground">{transportLine(t)}</p>
                  <dl className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                    {transportDetailPairs(t).map(([label, value]) => (
                      <div key={label} className="flex min-w-0 gap-1">
                        <dt className="shrink-0 text-muted-foreground">{label}:</dt>
                        <dd className="min-w-0 break-words font-medium">{value}</dd>
                      </div>
                    ))}
                  </dl>
                  {t.notes && <p className="mt-1 text-sm">{t.notes}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={t.status ?? item.status} />
                  <span className="text-sm font-medium">
                    {formatMoney(item.sell_price, currency)}
                  </span>
                  <TransportServiceDialog
                    parent="booking"
                    parentId={bookingId}
                    currency={currency}
                    item={item}
                    trigger={
                      <Button variant="ghost" size="sm">
                        Edit
                      </Button>
                    }
                  />
                </div>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

/** Structured activity / sightseeing services on this booking. */
function ActivitiesPanel({
  bookingId,
  items,
  currency,
}: {
  bookingId: string;
  items: Row[];
  currency: string;
}) {
  const services = items.filter((i: Row) => activityOf(i));

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Activities</CardTitle>
        <ActivityServiceDialog parent="booking" parentId={bookingId} currency={currency} />
      </CardHeader>
      <CardContent className="space-y-3">
        {services.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No activities yet. Add one to capture sightseeing, meeting point and confirmation.
          </p>
        )}
        {services.map((item: Row) => {
          const a = activityOf(item);
          return (
            <div key={item.id} className="rounded-lg border border-border p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium">{activityTitle(a)}</p>
                  <p className="text-sm text-muted-foreground">{activityLine(a)}</p>
                  <dl className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                    {activityDetailPairs(a).map(([label, value]) => (
                      <div key={label} className="flex min-w-0 gap-1">
                        <dt className="shrink-0 text-muted-foreground">{label}:</dt>
                        <dd className="min-w-0 break-words font-medium">{value}</dd>
                      </div>
                    ))}
                  </dl>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Fulfilment: <BookingFulfilmentEditor item={item} />
                  </p>
                  {a.notes && <p className="mt-1 text-sm">{a.notes}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={a.status ?? item.status} />
                  <span className="text-sm font-medium">
                    {formatMoney(item.sell_price, currency)}
                  </span>
                  <ActivityServiceDialog
                    parent="booking"
                    parentId={bookingId}
                    currency={currency}
                    item={item}
                    trigger={
                      <Button variant="ghost" size="sm">
                        Edit
                      </Button>
                    }
                  />
                </div>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function ServicesPanel({ items, currency }: { items: Row[]; currency: string }) {
  const update = useUpdateBookingItem();

  return (
    <Card className="overflow-x-auto p-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Service</TableHead>
            <TableHead>Fulfilment partner</TableHead>
            <TableHead>Dates</TableHead>
            <TableHead className="text-right">Cost</TableHead>
            <TableHead className="text-right">Sell</TableHead>
            <TableHead className="w-44">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 && (
            <TableRow>
              <TableCell colSpan={6}>No services on this booking yet.</TableCell>
            </TableRow>
          )}
          {items.map((item: Row) => (
            <TableRow key={item.id}>
              <TableCell>
                <p className="font-medium">{item.title}</p>
                <p className="text-xs text-muted-foreground">
                  {titleize(item.item_type)}
                  {item.confirmation_number ? ` · ${item.confirmation_number}` : ""}
                </p>
              </TableCell>
              <TableCell className="text-sm">
                <BookingFulfilmentEditor item={item} />
              </TableCell>
              <TableCell className="text-sm">
                {formatDate(item.start_date)} → {formatDate(item.end_date)}
              </TableCell>
              <TableCell className="text-right">{formatMoney(item.cost_price, currency)}</TableCell>
              <TableCell className="text-right">{formatMoney(item.sell_price, currency)}</TableCell>
              <TableCell>
                <Select
                  value={item.status ?? "pending"}
                  onValueChange={(v) => update.mutate({ id: item.id, values: { status: v } })}
                >
                  <SelectTrigger className="h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["pending", "requested", "confirmed", "cancelled"].map((s) => (
                      <SelectItem key={s} value={s}>
                        {titleize(s)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

function PaymentsPanel({
  booking,
  payments,
  currency,
}: {
  booking: Row;
  payments: Row[];
  currency: string;
}) {
  const record = useRecordPayment();
  const [form, setForm] = useState({
    amount: "",
    method: "upi",
    reference: "",
    paid_on: today(),
    direction: "inbound",
    notes: "",
  });

  function set(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await record.mutateAsync({
      booking_id: booking.id,
      customer_id: form.direction === "inbound" ? booking.customer_id : null,
      direction: form.direction,
      amount: Number(form.amount) || 0,
      currency,
      method: form.method,
      reference: form.reference || null,
      paid_on: form.paid_on,
      status: "completed",
      notes: form.notes || null,
    });
    setForm((f) => ({ ...f, amount: "", reference: "", notes: "" }));
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      <Card className="overflow-x-auto p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Direction</TableHead>
              <TableHead>Method</TableHead>
              <TableHead>Reference</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {payments.length === 0 && (
              <TableRow>
                <TableCell colSpan={5}>No payments recorded yet.</TableCell>
              </TableRow>
            )}
            {payments.map((p: Row) => (
              <TableRow key={p.id}>
                <TableCell>{formatDate(p.paid_on)}</TableCell>
                <TableCell>{titleize(p.direction)}</TableCell>
                <TableCell>{titleize(p.method)}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {p.reference ?? "—"}
                </TableCell>
                <TableCell className="text-right font-medium">
                  {formatMoney(p.amount, p.currency ?? currency)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Record payment</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="grid gap-3">
            <div>
              <Label>Direction</Label>
              <Select value={form.direction} onValueChange={(v) => set("direction", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="inbound">Received from customer</SelectItem>
                  <SelectItem value="outbound">Paid to supplier</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="pay-amount">Amount ({currency})</Label>
              <Input
                id="pay-amount"
                type="number"
                min={0}
                required
                value={form.amount}
                onChange={(e) => set("amount", e.target.value)}
              />
            </div>
            <div>
              <Label>Method</Label>
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
            </div>
            <div>
              <Label htmlFor="pay-ref">Reference / UTR</Label>
              <Input
                id="pay-ref"
                value={form.reference}
                onChange={(e) => set("reference", e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="pay-date">Paid on</Label>
              <Input
                id="pay-date"
                type="date"
                value={form.paid_on}
                onChange={(e) => set("paid_on", e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="pay-notes">Notes</Label>
              <Textarea
                id="pay-notes"
                rows={2}
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
              />
            </div>
            <Button type="submit" disabled={record.isPending}>
              <Plus className="mr-2 size-4" /> Record payment
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function OpsPanel({ booking }: { booking: Row }) {
  const update = useUpdateBooking();
  const [form, setForm] = useState({
    status: booking.status ?? "pending",
    visa_status: booking.visa_status ?? "not_required",
    payment_deadline: booking.payment_deadline ?? "",
    notes: booking.notes ?? "",
  });

  function set(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle className="text-base">Operations status</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div>
          <Label>Booking status</Label>
          <Select value={form.status} onValueChange={(v) => set("status", v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BOOKING_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {titleize(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Visa status</Label>
          <Select value={form.visa_status} onValueChange={(v) => set("visa_status", v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {VISA_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {titleize(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="ops-deadline">Payment deadline</Label>
          <Input
            id="ops-deadline"
            type="date"
            value={form.payment_deadline}
            onChange={(e) => set("payment_deadline", e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="ops-notes">Operations notes</Label>
          <Textarea
            id="ops-notes"
            rows={3}
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
          />
        </div>
        <Button
          onClick={() =>
            update.mutate({
              id: booking.id,
              values: {
                status: form.status,
                visa_status: form.visa_status,
                payment_deadline: form.payment_deadline || null,
                notes: form.notes || null,
              },
            })
          }
          disabled={update.isPending}
        >
          {update.isPending ? "Saving…" : "Save booking"}
        </Button>
      </CardContent>
    </Card>
  );
}

function TravellersPanel({ bookingId, links }: { bookingId: string; links: Row[] }) {
  const add = useAddTravellerToBooking(bookingId);
  const remove = useRemoveTravellerFromBooking(bookingId);
  const options = useTravellerOptions();
  const [existingId, setExistingId] = useState("");
  const [newTraveller, setNewTraveller] = useState({ full_name: "", traveller_type: "adult" });

  const linkedIds = new Set(links.map((l: Row) => l.traveller_id));
  const available = (options.data ?? []).filter((t) => !linkedIds.has(t.id));

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      <Card className="overflow-x-auto p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Traveller</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Passport</TableHead>
              <TableHead>Visa</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {links.length === 0 && (
              <TableRow>
                <TableCell colSpan={5}>No travellers linked to this booking yet.</TableCell>
              </TableRow>
            )}
            {links.map((link: Row) => (
              <TableRow key={link.id}>
                <TableCell className="font-medium">{link.travellers?.full_name ?? "—"}</TableCell>
                <TableCell>{titleize(link.travellers?.traveller_type ?? "")}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {link.travellers?.passport_number ?? "—"}
                  {link.travellers?.passport_expiry
                    ? ` · exp ${formatDate(link.travellers.passport_expiry)}`
                    : ""}
                </TableCell>
                <TableCell>
                  <StatusBadge status={link.travellers?.visa_status ?? "not_required"} />
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Remove from this booking"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(link.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add traveller</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label>Existing traveller</Label>
            <Select value={existingId} onValueChange={setExistingId}>
              <SelectTrigger>
                <SelectValue placeholder="Select traveller" />
              </SelectTrigger>
              <SelectContent>
                {available.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="secondary"
              disabled={!existingId || add.isPending}
              onClick={() => {
                add.mutate({ traveller_id: existingId });
                setExistingId("");
              }}
            >
              Add to booking
            </Button>
          </div>

          <div className="grid gap-2 border-t pt-4">
            <Label htmlFor="new-traveller">New traveller</Label>
            <Input
              id="new-traveller"
              placeholder="Full name"
              value={newTraveller.full_name}
              onChange={(e) => setNewTraveller((f) => ({ ...f, full_name: e.target.value }))}
            />
            <Select
              value={newTraveller.traveller_type}
              onValueChange={(v) => setNewTraveller((f) => ({ ...f, traveller_type: v }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["adult", "child", "infant"].map((t) => (
                  <SelectItem key={t} value={t}>
                    {titleize(t)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              disabled={!newTraveller.full_name.trim() || add.isPending}
              onClick={() => {
                add.mutate({
                  values: {
                    full_name: newTraveller.full_name.trim(),
                    traveller_type: newTraveller.traveller_type,
                  },
                });
                setNewTraveller({ full_name: "", traveller_type: "adult" });
              }}
            >
              <Plus className="mr-2 size-4" /> Create & add
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
