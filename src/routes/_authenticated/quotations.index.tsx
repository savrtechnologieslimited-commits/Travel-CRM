import { useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuotations } from "@/lib/data";
import { QUOTATION_STATUSES, formatDate, formatMoney, titleize } from "@/lib/crm";
import { PageHeader } from "@/components/app-shell";
import { StatusBadge } from "@/components/status-badge";
import { QuotationConvertButton } from "@/components/convert-actions";
import { NewQuotationDialog } from "@/components/new-quotation-dialog";
import { Card } from "@/components/ui/card";
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

export const Route = createFileRoute("/_authenticated/quotations/")({
  head: () => ({
    meta: [
      { title: "Quotations — SAVR Travels CRM" },
      {
        name: "description",
        content:
          "Build, version and track travel quotations with cost, markup, GST and margin for every trip.",
      },
      { property: "og:title", content: "Quotations — SAVR Travels CRM" },
      {
        property: "og:description",
        content:
          "Quotation builder with item-wise costing, markup and GST for Indian travel agencies.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: QuotationsPage,
});

function QuotationsPage() {
  const [status, setStatus] = useState("all");
  const { data: quotations = [], isLoading } = useQuotations(status);

  const pipelineValue = quotations
    .filter((q) => !["rejected", "expired"].includes(q.status ?? ""))
    .reduce((s, q) => s + Number(q.total_price ?? 0), 0);

  return (
    <div>
      <PageHeader
        title="Quotations"
        subtitle="Item-wise costing, markup, GST and versioned proposals."
        actions={<NewQuotationDialog />}
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-52">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {QUOTATION_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {titleize(s)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-sm text-muted-foreground">
          {quotations.length} quotations · live value{" "}
          <span className="font-medium text-foreground">{formatMoney(pipelineValue)}</span>
        </p>
      </div>

      <Card className="overflow-x-auto p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Quotation</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Travel</TableHead>
              <TableHead>Pax</TableHead>
              <TableHead className="text-right">Cost</TableHead>
              <TableHead className="text-right">Sell</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Convert</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={8}>Loading quotations…</TableCell>
              </TableRow>
            )}
            {!isLoading && quotations.length === 0 && (
              <TableRow>
                <TableCell colSpan={8}>No quotations yet — create your first one.</TableCell>
              </TableRow>
            )}
            {quotations.map((q) => (
              <TableRow key={q.id} className="cursor-pointer">
                <TableCell>
                  <Link
                    to="/quotations/$quotationId"
                    params={{ quotationId: q.id }}
                    className="font-medium hover:underline"
                  >
                    {q.title}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    Quotation No: {q.code ?? "Not issued"} · v{q.version} · {titleize(q.scope)}
                    {q.destinations?.name ? ` · ${q.destinations.name}` : ""}
                  </p>
                </TableCell>
                <TableCell>{q.customers?.full_name ?? "—"}</TableCell>
                <TableCell className="text-sm">
                  {formatDate(q.travel_start)} → {formatDate(q.travel_end)}
                  <span className="block text-xs text-muted-foreground">
                    Valid till {formatDate(q.valid_until)}
                  </span>
                </TableCell>
                <TableCell>
                  {q.adults ?? 0}A · {q.children ?? 0}C
                </TableCell>
                <TableCell className="text-right">
                  {formatMoney(q.total_cost, q.currency ?? "INR")}
                </TableCell>
                <TableCell className="text-right font-medium">
                  {formatMoney(q.total_price, q.currency ?? "INR")}
                </TableCell>
                <TableCell>
                  <StatusBadge status={q.status} />
                </TableCell>
                <TableCell className="text-right">
                  <QuotationConvertButton quotationId={q.id} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
