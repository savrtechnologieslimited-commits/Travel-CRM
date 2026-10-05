import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileDown, Receipt, Ticket } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAppSettings, useBookings, usePayments } from "@/lib/data";
import { printInvoice, printReceipt, printVoucher } from "@/lib/invoice-pdf";
import { formatDate, formatMoney, gstRateFor, titleize } from "@/lib/crm";
import { PageHeader } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/invoices")({
  head: () => ({
    meta: [
      { title: "Invoices & Vouchers — SAVR Travels CRM" },
      {
        name: "description",
        content:
          "Generate GST tax invoices, money receipts and traveller service vouchers for confirmed bookings.",
      },
      { property: "og:title", content: "Invoices & Vouchers — SAVR Travels CRM" },
      {
        property: "og:description",
        content: "GST-ready invoices, receipts and vouchers for Indian travel agency bookings.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: InvoicesPage,
});

function useAgency() {
  const { data: settings = [] } = useAppSettings();
  return (settings.find((s) => s.key === "agency")?.value ?? {}) as Record<string, unknown>;
}

function InvoicesPage() {
  return (
    <div>
      <PageHeader
        title="Invoices & Vouchers"
        subtitle="GST tax invoices, money receipts and traveller service vouchers."
      />
      <Tabs defaultValue="invoices">
        <TabsList className="mb-4">
          <TabsTrigger value="invoices">Invoices & vouchers</TabsTrigger>
          <TabsTrigger value="receipts">Receipts</TabsTrigger>
        </TabsList>
        <TabsContent value="invoices">
          <InvoiceTab />
        </TabsContent>
        <TabsContent value="receipts">
          <ReceiptTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function InvoiceTab() {
  const [search, setSearch] = useState("");
  const { data: bookings = [], isLoading } = useBookings();
  const agency = useAgency();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);

  const rows = bookings.filter((b) =>
    search
      ? `${b.code ?? ""} ${b.customers?.full_name ?? ""}`
          .toLowerCase()
          .includes(search.toLowerCase())
      : true,
  );

  async function load(id: string) {
    const [booking, items, payments] = await Promise.all([
      supabase
        .from("bookings")
        .select("*, customers(full_name,mobile,email), destinations(name,country)")
        .eq("id", id)
        .maybeSingle(),
      supabase
        .from("booking_items")
        .select("*, suppliers(name), hotel_bookings(*, suppliers(name)), transport_services(*, suppliers(name))")
        .eq("booking_id", id)
        .order("start_date"),

      supabase.from("payments").select("*").eq("booking_id", id).order("paid_on"),
    ]);
    return { booking: booking.data, items: items.data ?? [], payments: payments.data ?? [] };
  }

  async function doInvoice(id: string, scope: string) {
    setBusy(id);
    try {
      const d = await load(id);
      if (!d.booking) return;
      let booking = d.booking;
      if (!booking.invoice_code) {
        const { data: code, error } = await supabase.rpc("issue_invoice_number", {
          p_booking_id: id,
        });
        if (error) {
          toast.error(error.message || "Could not issue invoice number");
          return;
        }
        booking = { ...booking, invoice_code: code, invoice_date: booking.invoice_date ?? null };
        await qc.invalidateQueries({ queryKey: ["bookings"] });
      }
      printInvoice({
        booking,
        items: d.items,
        payments: d.payments,
        agency,
        gstRate: gstRateFor(scope),
      });
    } finally {
      setBusy(null);
    }
  }

  async function doVoucher(id: string) {
    setBusy(id);
    const d = await load(id);
    setBusy(null);
    if (!d.booking) return;
    printVoucher({ booking: d.booking, items: d.items, agency });
  }

  return (
    <div>
      <Input
        className="mb-4 max-w-sm"
        placeholder="Search booking or customer…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <Card className="overflow-x-auto p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Invoice No</TableHead>
              <TableHead>Booking No</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Travel</TableHead>
              <TableHead className="text-right">Invoice value</TableHead>
              <TableHead className="text-right">Balance</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Documents</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={8}>Loading bookings…</TableCell>
              </TableRow>
            )}
            {!isLoading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={8}>No bookings to invoice yet.</TableCell>
              </TableRow>
            )}
            {rows.map((b) => {
              const balance = Number(b.total_price) - Number(b.amount_received);
              return (
                <TableRow key={b.id}>
                  <TableCell className="font-medium">
                    {b.invoice_code ?? <span className="text-muted-foreground">Not issued</span>}
                    {b.invoice_code && (
                      <span className="block text-xs text-muted-foreground">
                        {formatDate(b.invoice_date)}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    {b.code ?? "—"}
                    <span className="block text-xs text-muted-foreground">
                      {formatDate(b.booking_date)}
                    </span>
                  </TableCell>
                  <TableCell>{b.customers?.full_name ?? "—"}</TableCell>
                  <TableCell className="text-sm">
                    {b.destinations?.name ?? "—"}
                    <span className="block text-xs text-muted-foreground">
                      {formatDate(b.travel_start)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    {formatMoney(Number(b.total_price), b.currency)}
                  </TableCell>
                  <TableCell className="text-right">{formatMoney(balance, b.currency)}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{titleize(b.payment_status)}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy === b.id}
                        onClick={() => doInvoice(b.id, b.scope)}
                      >
                        <FileDown className="mr-1 size-4" /> Invoice
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy === b.id}
                        onClick={() => doVoucher(b.id)}
                      >
                        <Ticket className="mr-1 size-4" /> Voucher
                      </Button>
                    </div>
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

function ReceiptTab() {
  const { data: payments = [], isLoading } = usePayments("inbound");
  const agency = useAgency();

  return (
    <Card className="overflow-x-auto p-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Receipt no</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Customer</TableHead>
            <TableHead>Booking</TableHead>
            <TableHead>Method</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead className="text-right">Receipt</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading && (
            <TableRow>
              <TableCell colSpan={7}>Loading payments…</TableCell>
            </TableRow>
          )}
          {!isLoading && payments.length === 0 && (
            <TableRow>
              <TableCell colSpan={7}>No customer receipts recorded yet.</TableCell>
            </TableRow>
          )}
          {payments.map((p) => (
            <TableRow key={p.id}>
              <TableCell className="font-medium">
                {p.receipt_code ?? <span className="text-muted-foreground">Not issued</span>}
                <span className="block text-xs text-muted-foreground">{p.code ?? "—"}</span>
              </TableCell>
              <TableCell className="text-sm">{formatDate(p.paid_on)}</TableCell>
              <TableCell>{p.customers?.full_name ?? "—"}</TableCell>
              <TableCell className="text-sm">{p.bookings?.code ?? "—"}</TableCell>
              <TableCell className="text-sm">{titleize(p.method)}</TableCell>
              <TableCell className="text-right">
                {formatMoney(Number(p.amount), p.currency)}
              </TableCell>
              <TableCell className="text-right">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => printReceipt({ payment: p, agency })}
                >
                  <Receipt className="mr-1 size-4" /> Print
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
