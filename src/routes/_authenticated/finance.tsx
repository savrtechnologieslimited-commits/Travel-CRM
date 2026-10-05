import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useFinanceOverview } from "@/lib/admin-data";
import { compactMoney, exportCsv, formatMoney, titleize, today } from "@/lib/crm";
import { PageHeader } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

export const Route = createFileRoute("/_authenticated/finance")({
  head: () => ({
    meta: [
      { title: "Finance Dashboard — SAVR Travels CRM" },
      {
        name: "description",
        content:
          "Owner view of revenue, supplier cost, office expenses, per-booking margin and receivables vs payables ageing.",
      },
      { property: "og:title", content: "Finance Dashboard — SAVR Travels CRM" },
      {
        property: "og:description",
        content: "Profit and loss, margin per booking, and cash position for the travel agency.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: FinancePage,
});

function monthKey(date?: string | null) {
  return date ? date.slice(0, 7) : "";
}

function FinancePage() {
  const { data, isLoading } = useFinanceOverview();
  const [months, setMonths] = useState("6");

  const model = useMemo(() => {
    const bookings = data?.bookings ?? [];
    const expenses = data?.expenses ?? [];
    const bills = data?.bills ?? [];
    const payments = data?.payments ?? [];

    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - (Number(months) - 1));
    const cutoffKey = cutoff.toISOString().slice(0, 7);

    const inRange = bookings.filter((b) => monthKey(b.booking_date) >= cutoffKey);
    const revenue = inRange.reduce((s, b) => s + Number(b.total_price ?? 0), 0);
    const cost = inRange.reduce((s, b) => s + Number(b.total_cost ?? 0), 0);
    const opex = expenses
      .filter((e) => monthKey(e.expense_date) >= cutoffKey)
      .reduce((s, e) => s + Number(e.amount ?? 0), 0);
    const grossMargin = revenue - cost;
    const netProfit = grossMargin - opex;

    const received = bookings.reduce((s, b) => s + Number(b.amount_received ?? 0), 0);
    const receivable = bookings.reduce(
      (s, b) => s + Math.max(0, Number(b.total_price ?? 0) - Number(b.amount_received ?? 0)),
      0,
    );
    const payable = bills.reduce(
      (s, b) => s + Math.max(0, Number(b.total_amount ?? 0) - Number(b.amount_paid ?? 0)),
      0,
    );
    const t = today();
    const overduePayable = bills
      .filter((b) => b.due_date && b.due_date < t && Number(b.amount_paid) < Number(b.total_amount))
      .reduce((s, b) => s + (Number(b.total_amount) - Number(b.amount_paid)), 0);
    const cashIn = payments
      .filter((p) => p.direction === "inbound" && p.status !== "failed")
      .reduce((s, p) => s + Number(p.amount ?? 0), 0);
    const cashOut = payments
      .filter((p) => p.direction === "outbound" && p.status !== "failed")
      .reduce((s, p) => s + Number(p.amount ?? 0), 0);

    const byMonth = new Map<string, { month: string; revenue: number; cost: number; expenses: number }>();
    for (const b of inRange) {
      const k = monthKey(b.booking_date);
      const row = byMonth.get(k) ?? { month: k, revenue: 0, cost: 0, expenses: 0 };
      row.revenue += Number(b.total_price ?? 0);
      row.cost += Number(b.total_cost ?? 0);
      byMonth.set(k, row);
    }
    for (const e of expenses) {
      const k = monthKey(e.expense_date);
      if (k < cutoffKey) continue;
      const row = byMonth.get(k) ?? { month: k, revenue: 0, cost: 0, expenses: 0 };
      row.expenses += Number(e.amount ?? 0);
      byMonth.set(k, row);
    }
    const trend = [...byMonth.values()]
      .sort((a, b) => a.month.localeCompare(b.month))
      .map((r) => ({ ...r, profit: r.revenue - r.cost - r.expenses }));

    const expenseByCategory = Object.entries(
      expenses.reduce<Record<string, number>>((acc, e) => {
        acc[e.category] = (acc[e.category] ?? 0) + Number(e.amount ?? 0);
        return acc;
      }, {}),
    )
      .map(([category, amount]) => ({ category: titleize(category), amount }))
      .sort((a, b) => b.amount - a.amount);

    const marginRows = inRange
      .map((b) => {
        const rev = Number(b.total_price ?? 0);
        const c = Number(b.total_cost ?? 0);
        return {
          id: b.id,
          code: b.code ?? "—",
          customer: b.customers?.full_name ?? "—",
          destination: b.destinations?.name ?? "—",
          revenue: rev,
          cost: c,
          margin: rev - c,
          pct: rev ? ((rev - c) / rev) * 100 : 0,
        };
      })
      .sort((a, b) => b.margin - a.margin);

    return {
      revenue,
      cost,
      opex,
      grossMargin,
      netProfit,
      received,
      receivable,
      payable,
      overduePayable,
      cashIn,
      cashOut,
      trend,
      expenseByCategory,
      marginRows,
    };
  }, [data, months]);

  return (
    <div>
      <PageHeader
        title="Finance Dashboard"
        subtitle="Revenue, supplier cost, running expenses and true profit."
        actions={
          <>
            <Select value={months} onValueChange={setMonths}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="3">Last 3 months</SelectItem>
                <SelectItem value="6">Last 6 months</SelectItem>
                <SelectItem value="12">Last 12 months</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={() => exportCsv("booking-margins.csv", model.marginRows)}>
              Export margins
            </Button>
          </>
        }
      />

      {isLoading && <Card className="p-4 text-sm text-muted-foreground">Loading finance data…</Card>}

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi label="Revenue" value={model.revenue} />
        <Kpi label="Supplier cost" value={model.cost} />
        <Kpi label="Gross margin" value={model.grossMargin} tone="success" />
        <Kpi label="Office expenses" value={model.opex} />
        <Kpi label="Net profit" value={model.netProfit} tone={model.netProfit >= 0 ? "success" : "destructive"} />
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-4">
        <Kpi label="Cash received" value={model.cashIn} />
        <Kpi label="Cash paid out" value={model.cashOut} />
        <Kpi label="Receivable from customers" value={model.receivable} />
        <Kpi label="Payable to suppliers" value={model.payable} tone={model.overduePayable > 0 ? "destructive" : undefined} />
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <Card className="p-4 lg:col-span-2">
          <p className="mb-3 text-sm font-medium">Revenue, cost and profit by month</p>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={model.trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" fontSize={11} />
                <YAxis fontSize={11} tickFormatter={(v: number) => compactMoney(v)} />
                <Tooltip formatter={(v: number) => formatMoney(v)} />
                <Legend />
                <Line type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={2} />
                <Line type="monotone" dataKey="cost" stroke="hsl(var(--muted-foreground))" strokeWidth={2} />
                <Line type="monotone" dataKey="profit" stroke="hsl(var(--accent))" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="p-4">
          <p className="mb-3 text-sm font-medium">Expenses by category</p>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={model.expenseByCategory}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="category" fontSize={10} interval={0} angle={-25} textAnchor="end" height={60} />
                <YAxis fontSize={11} tickFormatter={(v: number) => compactMoney(v)} />
                <Tooltip formatter={(v: number) => formatMoney(v)} />
                <Bar dataKey="amount" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card className="overflow-x-auto p-0">
        <div className="flex items-center justify-between p-4">
          <p className="text-sm font-medium">Margin per booking</p>
          <Badge variant="secondary">{model.marginRows.length} bookings</Badge>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Booking</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Destination</TableHead>
              <TableHead className="text-right">Revenue</TableHead>
              <TableHead className="text-right">Cost</TableHead>
              <TableHead className="text-right">Margin</TableHead>
              <TableHead className="text-right">Margin %</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {model.marginRows.length === 0 && (
              <TableRow>
                <TableCell colSpan={7}>No bookings in this period.</TableCell>
              </TableRow>
            )}
            {model.marginRows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.code}</TableCell>
                <TableCell>{r.customer}</TableCell>
                <TableCell>{r.destination}</TableCell>
                <TableCell className="text-right">{formatMoney(r.revenue)}</TableCell>
                <TableCell className="text-right">{formatMoney(r.cost)}</TableCell>
                <TableCell className="text-right font-medium">{formatMoney(r.margin)}</TableCell>
                <TableCell className="text-right">{r.pct.toFixed(1)}%</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number; tone?: string | undefined }) {
  const cls =
    tone === "success" ? "text-success" : tone === "destructive" ? "text-destructive" : "text-foreground";
  return (
    <Card className="p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`font-display text-xl font-semibold ${cls}`}>{formatMoney(value)}</p>
    </Card>
  );
}
