import { useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useReports } from "@/lib/data";
import { compactMoney, exportCsv, formatMoney, titleize } from "@/lib/crm";
import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({
    meta: [
      { title: "Reports & Analytics — SAVR Travels CRM" },
      {
        name: "description",
        content:
          "Revenue, margin, conversion and destination performance reports for domestic and international travel sales.",
      },
      { property: "og:title", content: "Reports & Analytics — SAVR Travels CRM" },
      {
        property: "og:description",
        content: "Monthly revenue, gross margin, lead conversion and team performance analytics.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ReportsPage,
});

const PALETTE = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
];

function monthKey(value?: string | null) {
  if (!value) return "";
  return value.slice(0, 7);
}

function monthLabel(key: string) {
  const [y, m] = key.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
}

function ReportsPage() {
  const { data, isLoading } = useReports();

  const model = useMemo(() => {
    const bookings = data?.bookings ?? [];
    const leads = data?.leads ?? [];
    const payments = data?.payments ?? [];
    const profiles = data?.profiles ?? [];

    const revenue = bookings.reduce((s, b) => s + Number(b.total_price ?? 0), 0);
    const cost = bookings.reduce((s, b) => s + Number(b.total_cost ?? 0), 0);
    const received = bookings.reduce((s, b) => s + Number(b.amount_received ?? 0), 0);
    const margin = revenue - cost;
    const marginPct = revenue ? (margin / revenue) * 100 : 0;
    const converted = leads.filter((l) => l.status === "confirmed").length;
    const conversion = leads.length ? (converted / leads.length) * 100 : 0;
    const outstanding = revenue - received;

    const monthly = new Map<string, { month: string; revenue: number; cost: number }>();
    bookings.forEach((b) => {
      const key = monthKey(b.booking_date);
      if (!key) return;
      const row = monthly.get(key) ?? { month: key, revenue: 0, cost: 0 };
      row.revenue += Number(b.total_price ?? 0);
      row.cost += Number(b.total_cost ?? 0);
      monthly.set(key, row);
    });
    const monthlySeries = [...monthly.values()]
      .sort((a, b) => a.month.localeCompare(b.month))
      .map((r) => ({
        month: monthLabel(r.month),
        revenue: Math.round(r.revenue),
        margin: Math.round(r.revenue - r.cost),
      }));

    const destMap = new Map<string, number>();
    bookings.forEach((b) => {
      const row = b as typeof b & { destinations?: { name?: string | null } | null };
      const name = row.destinations?.name ?? "Unassigned";
      destMap.set(name, (destMap.get(name) ?? 0) + Number(b.total_price ?? 0));
    });
    const destinations = [...destMap.entries()]
      .map(([name, value]) => ({ name, value: Math.round(value) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);

    const scopeMap = new Map<string, number>();
    bookings.forEach((b) => {
      scopeMap.set(b.scope, (scopeMap.get(b.scope) ?? 0) + Number(b.total_price ?? 0));
    });
    const scopeSplit = [...scopeMap.entries()].map(([name, value]) => ({
      name: titleize(name),
      value: Math.round(value),
    }));

    const nameOf = new Map(profiles.map((p) => [p.id, p.full_name]));
    const teamMap = new Map<string, { name: string; leads: number; revenue: number }>();
    leads.forEach((l) => {
      if (l.assigned_to && !nameOf.has(l.assigned_to)) return;
      const key = l.assigned_to ?? "unassigned";
      const row = teamMap.get(key) ?? {
        name: nameOf.get(key) ?? "Unassigned",
        leads: 0,
        revenue: 0,
      };
      row.leads += 1;
      teamMap.set(key, row);
    });
    bookings.forEach((b) => {
      if (b.assigned_to && !nameOf.has(b.assigned_to)) return;
      const key = b.assigned_to ?? "unassigned";
      const row = teamMap.get(key) ?? {
        name: nameOf.get(key) ?? "Unassigned",
        leads: 0,
        revenue: 0,
      };
      row.revenue += Number(b.total_price ?? 0);
      teamMap.set(key, row);
    });
    const team = [...teamMap.values()].sort((a, b) => b.revenue - a.revenue);

    const inbound = payments
      .filter((p) => p.direction === "inbound")
      .reduce((s, p) => s + Number(p.amount ?? 0), 0);
    const outbound = payments
      .filter((p) => p.direction === "outbound")
      .reduce((s, p) => s + Number(p.amount ?? 0), 0);

    return {
      revenue,
      margin,
      marginPct,
      conversion,
      outstanding,
      monthlySeries,
      destinations,
      scopeSplit,
      team,
      inbound,
      outbound,
      bookingCount: bookings.length,
      leadCount: leads.length,
    };
  }, [data]);

  return (
    <div>
      <PageHeader
        title="Reports & analytics"
        subtitle="Revenue, margin, conversion and destination performance across the agency."
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={!data?.bookings?.length}
              onClick={() =>
                exportCsv(
                  "bookings-report",
                  (data?.bookings ?? []).map((b) => ({
                    Booking: b.code ?? b.id,
                    Date: b.booking_date,
                    Scope: b.scope,
                    Status: b.status,
                    Revenue: Number(b.total_price ?? 0),
                    Cost: Number(b.total_cost ?? 0),
                    Margin: Number(b.total_price ?? 0) - Number(b.total_cost ?? 0),
                    Received: Number(b.amount_received ?? 0),
                  })),
                )
              }
            >
              Export bookings
            </Button>
            <Button variant="outline" onClick={() => window.print()}>
              Print report
            </Button>
          </div>
        }
      />

      {isLoading ? (
        <Card className="p-10 text-center text-muted-foreground">Crunching numbers…</Card>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi
              label="Booked revenue"
              value={compactMoney(model.revenue)}
              hint={`${model.bookingCount} bookings`}
            />
            <Kpi
              label="Gross margin"
              value={compactMoney(model.margin)}
              hint={`${model.marginPct.toFixed(1)}% of revenue`}
            />
            <Kpi
              label="Lead conversion"
              value={`${model.conversion.toFixed(1)}%`}
              hint={`${model.leadCount} leads captured`}
            />
            <Kpi
              label="Outstanding"
              value={compactMoney(model.outstanding)}
              hint="Still to collect from customers"
            />
          </div>

          <Card className="p-5">
            <p className="mb-4 font-display font-semibold">Revenue vs margin by month</p>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={model.monthlySeries}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                  <XAxis dataKey="month" fontSize={12} />
                  <YAxis fontSize={12} tickFormatter={(v) => compactMoney(Number(v))} />
                  <Tooltip formatter={(v) => formatMoney(Number(v))} />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="revenue"
                    stroke="var(--color-chart-1)"
                    strokeWidth={2}
                  />
                  <Line
                    type="monotone"
                    dataKey="margin"
                    stroke="var(--color-chart-2)"
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-5">
              <p className="mb-4 font-display font-semibold">Top destinations by revenue</p>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={model.destinations} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                    <XAxis
                      type="number"
                      fontSize={12}
                      tickFormatter={(v) => compactMoney(Number(v))}
                    />
                    <YAxis type="category" dataKey="name" width={110} fontSize={12} />
                    <Tooltip formatter={(v) => formatMoney(Number(v))} />
                    <Bar dataKey="value" fill="var(--color-chart-1)" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card className="p-5">
              <p className="mb-4 font-display font-semibold">Domestic vs international</p>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={model.scopeSplit}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={3}
                    >
                      {model.scopeSplit.map((entry, i) => (
                        <Cell key={entry.name} fill={PALETTE[i % PALETTE.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => formatMoney(Number(v))} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-5">
              <p className="mb-4 font-display font-semibold">Team performance</p>
              <div className="space-y-3">
                {model.team.length === 0 && (
                  <p className="text-sm text-muted-foreground">No assignments recorded yet.</p>
                )}
                {model.team.map((t) => (
                  <div key={t.name} className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-medium">{t.name}</span>
                    <span className="text-muted-foreground">
                      {t.leads} leads · {compactMoney(t.revenue)}
                    </span>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-5">
              <p className="mb-4 font-display font-semibold">Cash movement</p>
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Received from customers</dt>
                  <dd className="font-medium">{formatMoney(model.inbound)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Paid to suppliers</dt>
                  <dd className="font-medium">{formatMoney(model.outbound)}</dd>
                </div>
                <div className="flex justify-between border-t border-border pt-3">
                  <dt className="font-medium">Net in hand</dt>
                  <dd className="font-display font-semibold">
                    {formatMoney(model.inbound - model.outbound)}
                  </dd>
                </div>
              </dl>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="p-5">
      <p className="text-xs tracking-wide text-muted-foreground uppercase">{label}</p>
      <p className="font-display mt-1 text-2xl font-semibold">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </Card>
  );
}
