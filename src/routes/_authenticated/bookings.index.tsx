import { useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useBookings } from "@/lib/data";
import { BOOKING_STATUSES, PAYMENT_STATUSES, formatDate, formatMoney, titleize } from "@/lib/crm";
import { PageHeader } from "@/components/app-shell";
import { NewBookingDialog } from "@/components/entity-dialogs";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
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

export const Route = createFileRoute("/_authenticated/bookings/")({
  head: () => ({
    meta: [
      { title: "Bookings — SAVR Travels CRM" },
      {
        name: "description",
        content:
          "Confirmed travel bookings with service confirmations, collection status, visa tracking and travel dates.",
      },
      { property: "og:title", content: "Bookings — SAVR Travels CRM" },
      {
        property: "og:description",
        content:
          "Track confirmed trips, payments collected and visa status in one operations board.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: BookingsPage,
});

function BookingsPage() {
  const [status, setStatus] = useState("all");
  const [payment, setPayment] = useState("all");
  const { data: bookings = [], isLoading } = useBookings({ status, payment });

  const totalValue = bookings.reduce((s, b) => s + Number(b.total_price ?? 0), 0);
  const collected = bookings.reduce((s, b) => s + Number(b.amount_received ?? 0), 0);

  return (
    <div>
      <PageHeader
        title="Bookings"
        subtitle="Confirmed trips, collections and travel operations."
        actions={<NewBookingDialog />}
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs tracking-wide text-muted-foreground uppercase">Booking value</p>
            <p className="mt-1 text-xl font-semibold">{formatMoney(totalValue)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs tracking-wide text-muted-foreground uppercase">Collected</p>
            <p className="mt-1 text-xl font-semibold">{formatMoney(collected)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs tracking-wide text-muted-foreground uppercase">Outstanding</p>
            <p className="mt-1 text-xl font-semibold">{formatMoney(totalValue - collected)}</p>
          </CardContent>
        </Card>
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-52">
            <SelectValue placeholder="Booking status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All booking statuses</SelectItem>
            {BOOKING_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {titleize(s)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={payment} onValueChange={setPayment}>
          <SelectTrigger className="w-52">
            <SelectValue placeholder="Payment status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All payment statuses</SelectItem>
            {PAYMENT_STATUSES.map((s) => (
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
              <TableHead>Booking</TableHead>
              <TableHead>Travel</TableHead>
              <TableHead>Pax</TableHead>
              <TableHead className="w-48">Collection</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Visa</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={6}>Loading bookings…</TableCell>
              </TableRow>
            )}
            {!isLoading && bookings.length === 0 && (
              <TableRow>
                <TableCell colSpan={6}>
                  No bookings yet — accept a quotation to convert it into a booking.
                </TableCell>
              </TableRow>
            )}
            {bookings.map((b) => {
              const total = Number(b.total_price ?? 0);
              const received = Number(b.amount_received ?? 0);
              const pct = total > 0 ? Math.min((received / total) * 100, 100) : 0;
              return (
                <TableRow key={b.id}>
                  <TableCell>
                    <Link
                      to="/bookings/$bookingId"
                      params={{ bookingId: b.id }}
                      className="font-medium hover:underline"
                    >
                      {b.customers?.full_name ?? "Guest"}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      Booking No: {b.code ?? "Not issued"} ·{" "}
                      {b.destinations?.name ?? titleize(b.scope)}
                    </p>
                  </TableCell>
                  <TableCell className="text-sm">
                    {formatDate(b.travel_start)} → {formatDate(b.travel_end)}
                    <span className="block text-xs text-muted-foreground">
                      Booked {formatDate(b.booking_date)}
                    </span>
                  </TableCell>
                  <TableCell>
                    {b.adults ?? 0}A · {b.children ?? 0}C
                  </TableCell>
                  <TableCell>
                    <Progress value={pct} className="h-2" />
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatMoney(received, b.currency ?? "INR")} of{" "}
                      {formatMoney(total, b.currency ?? "INR")}
                    </p>
                  </TableCell>
                  <TableCell className="space-y-1">
                    <StatusBadge status={b.status} />
                    <StatusBadge status={b.payment_status} />
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={b.visa_status} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
