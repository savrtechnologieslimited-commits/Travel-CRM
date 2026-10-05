import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { usePayments } from "@/lib/data";
import { formatDate, formatMoney, titleize } from "@/lib/crm";
import { PageHeader } from "@/components/app-shell";
import { RecordPaymentDialog } from "@/components/entity-dialogs";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent } from "@/components/ui/card";
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

export const Route = createFileRoute("/_authenticated/payments")({
  head: () => ({
    meta: [
      { title: "Payments — SAVR Travels CRM" },
      {
        name: "description",
        content:
          "Customer receipts and supplier payouts with UPI, bank transfer and card references for every booking.",
      },
      { property: "og:title", content: "Payments — SAVR Travels CRM" },
      {
        property: "og:description",
        content: "Track money in from travellers and money out to suppliers, booking by booking.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PaymentsPage,
});

function PaymentsPage() {
  const [direction, setDirection] = useState("all");
  const { data: payments = [], isLoading } = usePayments(direction);

  const inbound = payments
    .filter((p) => p.direction === "inbound")
    .reduce((s, p) => s + Number(p.amount ?? 0), 0);
  const outbound = payments
    .filter((p) => p.direction === "outbound")
    .reduce((s, p) => s + Number(p.amount ?? 0), 0);

  return (
    <div>
      <PageHeader
        title="Payments"
        subtitle="Receipts from travellers and payouts to suppliers."
        actions={<RecordPaymentDialog />}
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs tracking-wide text-muted-foreground uppercase">Money in</p>
            <p className="mt-1 text-xl font-semibold">{formatMoney(inbound)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs tracking-wide text-muted-foreground uppercase">Money out</p>
            <p className="mt-1 text-xl font-semibold">{formatMoney(outbound)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs tracking-wide text-muted-foreground uppercase">Net</p>
            <p className="mt-1 text-xl font-semibold">{formatMoney(inbound - outbound)}</p>
          </CardContent>
        </Card>
      </div>

      <Select value={direction} onValueChange={setDirection}>
        <SelectTrigger className="mb-4 w-52">
          <SelectValue placeholder="Direction" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All payments</SelectItem>
          <SelectItem value="inbound">Received</SelectItem>
          <SelectItem value="outbound">Paid out</SelectItem>
        </SelectContent>
      </Select>

      <Card className="overflow-x-auto p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Number</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Party</TableHead>
              <TableHead>Booking</TableHead>
              <TableHead>Method</TableHead>
              <TableHead>Reference</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={8}>Loading payments…</TableCell>
              </TableRow>
            )}
            {!isLoading && payments.length === 0 && (
              <TableRow>
                <TableCell colSpan={8}>No payments recorded yet.</TableCell>
              </TableRow>
            )}
            {payments.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium text-sm">
                  {p.code ?? "—"}
                  {p.receipt_code ? (
                    <span className="block text-xs text-muted-foreground">Receipt {p.receipt_code}</span>
                  ) : null}
                </TableCell>
                <TableCell>{formatDate(p.paid_on)}</TableCell>
                <TableCell>
                  <p className="font-medium">
                    {p.direction === "inbound"
                      ? (p.customers?.full_name ?? "Customer")
                      : (p.suppliers?.name ?? "Supplier")}
                  </p>
                  <p className="text-xs text-muted-foreground">{titleize(p.direction)}</p>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {p.bookings?.code ?? "—"}
                </TableCell>
                <TableCell>{titleize(p.method)}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{p.reference ?? "—"}</TableCell>
                <TableCell
                  className={`text-right font-medium ${
                    p.direction === "inbound" ? "text-success" : "text-foreground"
                  }`}
                >
                  {p.direction === "outbound" ? "- " : ""}
                  {formatMoney(p.amount, p.currency ?? "INR")}
                </TableCell>
                <TableCell>
                  <StatusBadge status={p.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
