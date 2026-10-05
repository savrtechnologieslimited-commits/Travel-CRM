import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useProfiles } from "@/lib/data";
import { useCurrentUser, useDailyReports, useSubmitDailyReport } from "@/lib/ops-data";
import { formatDate, today, titleize, exportCsv } from "@/lib/crm";
import { PageHeader } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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

export const Route = createFileRoute("/_authenticated/daily-reports")({
  head: () => ({
    meta: [
      { title: "Daily Reports — SAVR Travels CRM" },
      {
        name: "description",
        content:
          "End-of-day staff reporting: work completed, pending items, blockers, calls made and hours worked.",
      },
      { property: "og:title", content: "Daily Reports — SAVR Travels CRM" },
      {
        property: "og:description",
        content: "Team daily work reports with blockers and productivity metrics.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DailyReportsPage,
});

function DailyReportsPage() {
  const [user, setUser] = useState("all");
  const [date, setDate] = useState("");
  const { data: reports = [], isLoading } = useDailyReports({ user, ...(date ? { date } : {}) });
  const { data: profiles = [] } = useProfiles();

  const nameOf = useMemo(() => {
    const map = new Map(profiles.map((p) => [p.id, p.full_name]));
    return (id?: string | null) => (id ? (map.get(id) ?? "Team member") : "Former team member");
  }, [profiles]);

  const totals = useMemo(
    () => ({
      count: reports.length,
      calls: reports.reduce((s, r) => s + (r.calls_made ?? 0), 0),
      meetings: reports.reduce((s, r) => s + (r.meetings_count ?? 0), 0),
      hours: reports.reduce((s, r) => s + Number(r.hours_worked ?? 0), 0),
    }),
    [reports],
  );

  return (
    <div>
      <PageHeader
        title="Daily Reports"
        subtitle="What each team member did today — work done, pending, and blockers."
        actions={
          <>
            <Button
              variant="outline"
              onClick={() =>
                exportCsv(
                  "daily-reports.csv",
                  reports.map((r) => ({
                    date: r.report_date,
                    member: nameOf(r.user_id),
                    work_done: r.work_done ?? "",
                    pending: r.pending_work ?? "",
                    blockers: r.blockers ?? "",
                    calls: r.calls_made,
                    meetings: r.meetings_count,
                    hours: r.hours_worked,
                  })),
                )
              }
            >
              Export CSV
            </Button>
            <SubmitReportDialog />
          </>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <Stat label="Reports" value={totals.count} />
        <Stat label="Calls made" value={totals.calls} />
        <Stat label="Meetings" value={totals.meetings} />
        <Stat label="Hours logged" value={totals.hours} />
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <Select value={user} onValueChange={setUser}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Team member" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All team members</SelectItem>
            {profiles.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.full_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="date"
          className="w-44"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        {date && (
          <Button variant="ghost" onClick={() => setDate("")}>
            Clear date
          </Button>
        )}
      </div>

      <div className="grid gap-3">
        {isLoading && <Card className="p-4 text-sm text-muted-foreground">Loading reports…</Card>}
        {!isLoading && reports.length === 0 && (
          <Card className="p-6 text-sm text-muted-foreground">No daily reports submitted yet.</Card>
        )}
        {reports.map((r) => (
          <Card key={r.id} className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <p className="font-medium">{nameOf(r.user_id)}</p>
                <Badge variant="secondary">{formatDate(r.report_date)}</Badge>
                <Badge variant="outline">{titleize(r.status)}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {r.calls_made} calls · {r.meetings_count} meetings · {r.hours_worked} hrs
              </p>
            </div>
            {r.summary && <p className="mt-2 text-sm">{r.summary}</p>}
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <Block title="Work done" body={r.work_done} />
              <Block title="Pending" body={r.pending_work} />
              <Block title="Blockers" body={r.blockers} tone="destructive" />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-display text-2xl font-semibold">{value}</p>
    </Card>
  );
}

function Block({ title, body, tone }: { title: string; body?: string | null; tone?: string }) {
  return (
    <div
      className={
        "rounded-md p-3 text-xs " + (tone === "destructive" ? "bg-destructive/10" : "bg-muted")
      }
    >
      <p className="mb-1 font-medium">{title}</p>
      <p className="text-muted-foreground whitespace-pre-line">{body || "—"}</p>
    </div>
  );
}

function SubmitReportDialog() {
  const [open, setOpen] = useState(false);
  const submitReport = useSubmitDailyReport();
  const { data: user } = useCurrentUser();
  const [form, setForm] = useState({
    report_date: today(),
    summary: "",
    work_done: "",
    pending_work: "",
    blockers: "",
    calls_made: "0",
    meetings_count: "0",
    hours_worked: "8",
  });

  function set(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    await submitReport.mutateAsync({
      user_id: user.id,
      report_date: form.report_date,
      summary: form.summary || null,
      work_done: form.work_done || null,
      pending_work: form.pending_work || null,
      blockers: form.blockers || null,
      calls_made: Number(form.calls_made || 0),
      meetings_count: Number(form.meetings_count || 0),
      hours_worked: Number(form.hours_worked || 0),
      status: "submitted",
    });
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 size-4" /> Submit report
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Daily work report</DialogTitle>
          <DialogDescription>Log today's work, pending items and blockers.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="d-date">Date</Label>
            <Input
              id="d-date"
              type="date"
              value={form.report_date}
              onChange={(e) => set("report_date", e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="d-hours">Hours worked</Label>
            <Input
              id="d-hours"
              type="number"
              step="0.5"
              value={form.hours_worked}
              onChange={(e) => set("hours_worked", e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="d-calls">Calls made</Label>
            <Input
              id="d-calls"
              type="number"
              value={form.calls_made}
              onChange={(e) => set("calls_made", e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="d-meet">Meetings</Label>
            <Input
              id="d-meet"
              type="number"
              value={form.meetings_count}
              onChange={(e) => set("meetings_count", e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="d-sum">Summary</Label>
            <Input
              id="d-sum"
              value={form.summary}
              onChange={(e) => set("summary", e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="d-done">Work done</Label>
            <Textarea
              id="d-done"
              value={form.work_done}
              onChange={(e) => set("work_done", e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="d-pend">Pending work</Label>
            <Textarea
              id="d-pend"
              value={form.pending_work}
              onChange={(e) => set("pending_work", e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="d-block">Blockers</Label>
            <Textarea
              id="d-block"
              value={form.blockers}
              onChange={(e) => set("blockers", e.target.value)}
            />
          </div>
          <DialogFooter className="sm:col-span-2">
            <Button type="submit" disabled={submitReport.isPending}>
              {submitReport.isPending ? "Submitting…" : "Submit report"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
