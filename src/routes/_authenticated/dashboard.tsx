import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { TrendingUp, Users, Plane, Wallet, CalendarClock, IndianRupee } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { DashboardRemindersDialog } from "@/components/dashboard-reminders-dialog";
import { TripCalendarDialog } from "@/components/trip-calendar-dialog";
import { StatusBadge, PriorityBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useDashboard } from "@/lib/data";
import { useFollowUps } from "@/lib/followup-data";
import { compactMoney, formatDate, titleize, KANBAN_STATUSES } from "@/lib/crm";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Operations Dashboard — SAVR Travels CRM" },
      {
        name: "description",
        content:
          "Live view of travel agency performance: leads, conversions, bookings, receivables and today's follow-ups.",
      },
      { property: "og:title", content: "Operations Dashboard — SAVR Travels CRM" },
      {
        property: "og:description",
        content: "Live travel agency KPIs: leads, conversions, bookings and receivables.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

function Dashboard() {
  const { data, isLoading } = useDashboard();
  const { data: followUps = [] } = useFollowUps({ view: "all" });

  if (isLoading || !data) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
    );
  }

  const { leads, bookings, payments } = data;
  const openLeads = leads.filter(
    (l) => !["confirmed", "lost", "cancelled"].includes(l.status ?? ""),
  );
  const confirmed = leads.filter((l) => l.status === "confirmed").length;
  const conversion = leads.length ? Math.round((confirmed / leads.length) * 100) : 0;
  const revenue = bookings.reduce((s, b) => s + Number(b.total_price ?? 0), 0);
  const margin = bookings.reduce(
    (s, b) => s + (Number(b.total_price ?? 0) - Number(b.total_cost ?? 0)),
    0,
  );
  const received = payments
    .filter((p) => p.direction === "in")
    .reduce((s, p) => s + Number(p.amount ?? 0), 0);
  const outstanding = Math.max(revenue - received, 0);
  const todayStr = new Date().toISOString().slice(0, 10);
  const openFollowUps = followUps.filter((f) => f.status !== "completed");
  const fuToday = openFollowUps.filter((f) => f.bucket === "today");
  const fuOverdue = openFollowUps.filter((f) => f.bucket === "overdue");
  const fuUpcoming = openFollowUps.filter((f) => f.bucket === "upcoming");
  const dueToday = [...fuOverdue, ...fuToday];

  const bySource = Object.entries(
    leads.reduce<Record<string, number>>((acc, l) => {
      acc[l.source] = (acc[l.source] ?? 0) + 1;
      return acc;
    }, {}),
  ).map(([name, value]) => ({ name: titleize(name), value }));

  const byStage = KANBAN_STATUSES.map((s) => ({
    name: titleize(s).replace("Requirement Collected", "Requirement"),
    value: leads.filter((l) => l.status === s).length,
  }));

  const scopeSplit = ["domestic", "international"].map((scope) => ({
    name: titleize(scope),
    value: leads.filter((l) => l.scope === scope).length,
  }));

  const kpis = [
    {
      label: "Active leads",
      value: String(openLeads.length),
      icon: Users,
      hint: `${leads.length} total`,
    },
    {
      label: "Conversion",
      value: `${conversion}%`,
      icon: TrendingUp,
      hint: `${confirmed} confirmed`,
    },
    { label: "Bookings", value: String(bookings.length), icon: Plane, hint: "this pipeline" },
    {
      label: "Booking value",
      value: compactMoney(revenue),
      icon: IndianRupee,
      hint: `margin ${compactMoney(margin)}`,
    },
    { label: "Received", value: compactMoney(received), icon: Wallet, hint: "payments in" },
    { label: "Outstanding", value: compactMoney(outstanding), icon: Wallet, hint: "to collect" },
    {
      label: "Follow-ups today",
      value: String(fuToday.length),
      icon: CalendarClock,
      hint: `${fuOverdue.length} overdue · ${fuUpcoming.length} upcoming`,
    },

    {
      label: "Upcoming travel",
      value: String(bookings.filter((b) => (b.travel_start ?? "") >= todayStr).length),
      icon: Plane,
      hint: "departures ahead",
    },
  ];

  return (
    <div>
      <PageHeader
        title="Operations dashboard"
        subtitle="Domestic and international pipeline health at a glance."
        actions={
          <>
            <DashboardRemindersDialog />
            <TripCalendarDialog />
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="stat-card p-4">
            <div className="flex items-start justify-between">
              <p className="text-sm text-muted-foreground">{k.label}</p>
              <k.icon className="size-4 text-primary" />
            </div>
            <p className="mt-2 font-display text-2xl font-semibold">{k.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{k.hint}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Pipeline by stage</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byStage} margin={{ left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  interval={0}
                  angle={-18}
                  textAnchor="end"
                  height={60}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: 10,
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="value" radius={[6, 6, 0, 0]} fill="var(--chart-1)" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Lead sources</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={bySource}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={45}
                  outerRadius={80}
                >
                  {bySource.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: 10,
                    fontSize: 12,
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">
              Follow-ups due ({fuOverdue.length} overdue · {fuToday.length} today)
            </CardTitle>
            <Link to="/follow-ups" className="text-xs font-medium text-primary hover:underline">
              View all
            </Link>
          </CardHeader>
          <CardContent className="space-y-2">
            {dueToday.length === 0 && (
              <p className="text-sm text-muted-foreground">Nothing pending. Clean desk.</p>
            )}
            {dueToday.slice(0, 6).map((t) => (
              <div
                key={t.key}
                className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{t.who}</p>
                  <p className="text-xs text-muted-foreground">
                    {t.title} · due {formatDate(t.dueDate)}
                    {t.bucket === "overdue" ? " (overdue)" : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <PriorityBadge priority={t.priority} />
                  <StatusBadge status={t.status} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Domestic vs international</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {scopeSplit.map((s, i) => {
              const pct = leads.length ? Math.round((s.value / leads.length) * 100) : 0;
              return (
                <div key={s.name}>
                  <div className="flex justify-between text-sm">
                    <span>{s.name}</span>
                    <span className="text-muted-foreground">
                      {s.value} · {pct}%
                    </span>
                  </div>
                  <div className="mt-1 h-2 rounded-full bg-muted">
                    <div
                      className="h-2 rounded-full"
                      style={{ width: `${pct}%`, background: CHART_COLORS[i] }}
                    />
                  </div>
                </div>
              );
            })}
            <div className="pt-2 text-xs text-muted-foreground">
              Quotations open: {data.quotations.filter((q) => q.status !== "accepted").length}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
