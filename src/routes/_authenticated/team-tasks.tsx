import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useProfiles } from "@/lib/data";
import { useAssignTask, useCurrentUser, useReportTaskProgress, useTeamTasks } from "@/lib/ops-data";
import { PRIORITIES, TASK_STATUSES, formatDate, statusTone, titleize, today } from "@/lib/crm";
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

const TASK_TYPES = [
  "call",
  "whatsapp",
  "email",
  "meeting",
  "document",
  "payment",
  "operations",
  "internal",
];

export const Route = createFileRoute("/_authenticated/team-tasks")({
  head: () => ({
    meta: [
      { title: "Team Tasks — SAVR Travels CRM" },
      {
        name: "description",
        content:
          "Assign work to sales and operations staff, track done / not-done status and read daily progress notes.",
      },
      { property: "og:title", content: "Team Tasks — SAVR Travels CRM" },
      {
        property: "og:description",
        content: "Owner-to-employee task assignment with progress and not-done reasons.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TeamTasksPage,
});

function TeamTasksPage() {
  const [assignee, setAssignee] = useState("all");
  const [status, setStatus] = useState("all");
  const { data: tasks = [], isLoading } = useTeamTasks({ assignee, status });
  const { data: profiles = [] } = useProfiles();
  const { data: user } = useCurrentUser();

  const nameOf = useMemo(() => {
    const map = new Map(profiles.map((p) => [p.id, p.full_name]));
    return (id?: string | null) => (id ? (map.get(id) ?? "Unavailable team member") : "Unassigned");
  }, [profiles]);

  const stats = useMemo(() => {
    const t = today();
    return {
      total: tasks.length,
      dueToday: tasks.filter((x) => x.due_date === t && x.status !== "completed").length,
      overdue: tasks.filter((x) => x.due_date && x.due_date < t && x.status !== "completed").length,
      done: tasks.filter((x) => x.status === "completed").length,
    };
  }, [tasks]);

  return (
    <div>
      <PageHeader
        title="Team Tasks"
        subtitle="Assign work to your team and see what got done — and what didn't."
        actions={<AssignTaskDialog />}
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <StatCard label="Assigned" value={stats.total} />
        <StatCard label="Due today" value={stats.dueToday} />
        <StatCard label="Overdue" value={stats.overdue} tone="destructive" />
        <StatCard label="Completed" value={stats.done} />
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <Select value={assignee} onValueChange={setAssignee}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Assignee" />
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
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {TASK_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {titleize(s)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {user && (
          <Button
            variant={assignee === user.id ? "default" : "outline"}
            onClick={() => setAssignee(assignee === user.id ? "all" : user.id)}
          >
            My tasks
          </Button>
        )}
      </div>

      <div className="grid gap-3">
        {isLoading && <Card className="p-4 text-sm text-muted-foreground">Loading tasks…</Card>}
        {!isLoading && tasks.length === 0 && (
          <Card className="p-6 text-sm text-muted-foreground">No tasks match these filters.</Card>
        )}
        {tasks.map((t) => (
          <Card key={t.id} className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{t.title}</p>
                  <Badge variant={statusTone(t.status) as never}>{titleize(t.status)}</Badge>
                  <Badge variant="outline">{titleize(t.priority)}</Badge>
                  <Badge variant="secondary">{titleize(t.task_type)}</Badge>
                </div>
                {t.description && (
                  <p className="mt-1 text-sm text-muted-foreground">{t.description}</p>
                )}
                <p className="mt-2 text-xs text-muted-foreground">
                  {nameOf(t.assigned_to)} · Due {formatDate(t.due_date)} {t.due_time ?? ""}
                </p>
                {t.progress_note && (
                  <p className="mt-2 rounded-md bg-muted p-2 text-xs">
                    <span className="font-medium">Progress:</span> {t.progress_note}
                  </p>
                )}
                {t.not_done_reason && (
                  <p className="mt-2 rounded-md bg-destructive/10 p-2 text-xs text-destructive">
                    <span className="font-medium">Not done:</span> {t.not_done_reason}
                  </p>
                )}
              </div>
              <ReportDialog task={t} />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={
          "font-display text-2xl font-semibold " +
          (tone === "destructive" ? "text-destructive" : "")
        }
      >
        {value}
      </p>
    </Card>
  );
}

function AssignTaskDialog() {
  const [open, setOpen] = useState(false);
  const assign = useAssignTask();
  const { data: profiles = [] } = useProfiles();
  const [form, setForm] = useState({
    title: "",
    description: "",
    assigned_to: "",
    due_date: today(),
    due_time: "",
    priority: "medium",
    task_type: "internal",
  });

  function set(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await assign.mutateAsync({
      values: {
        title: form.title,
        description: form.description || null,
        assigned_to: form.assigned_to || null,
        due_date: form.due_date || null,
        due_time: form.due_time || null,
        priority: form.priority,
        task_type: form.task_type,
        status: "pending",
      },
    });
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 size-4" /> Assign task
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Assign a task</DialogTitle>
          <DialogDescription>Give an employee clear work with a deadline.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="t-title">Task</Label>
            <Input
              id="t-title"
              required
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="t-desc">Details</Label>
            <Textarea
              id="t-desc"
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
            />
          </div>
          <div>
            <Label>Assign to</Label>
            <Select value={form.assigned_to} onValueChange={(v) => set("assigned_to", v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select employee" />
              </SelectTrigger>
              <SelectContent>
                {profiles.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Type</Label>
            <Select value={form.task_type} onValueChange={(v) => set("task_type", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TASK_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {titleize(t)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="t-date">Due date</Label>
            <Input
              id="t-date"
              type="date"
              value={form.due_date}
              onChange={(e) => set("due_date", e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="t-time">Due time</Label>
            <Input
              id="t-time"
              type="time"
              value={form.due_time}
              onChange={(e) => set("due_time", e.target.value)}
            />
          </div>
          <div>
            <Label>Priority</Label>
            <Select value={form.priority} onValueChange={(v) => set("priority", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRIORITIES.map((p) => (
                  <SelectItem key={p} value={p}>
                    {titleize(p)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter className="sm:col-span-2">
            <Button type="submit" disabled={assign.isPending}>
              {assign.isPending ? "Saving…" : "Assign task"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ReportDialog({
  task,
}: {
  task: {
    id: string;
    status: string;
    progress_note: string | null;
    not_done_reason: string | null;
  };
}) {
  const [open, setOpen] = useState(false);
  const report = useReportTaskProgress();
  const [status, setStatus] = useState(task.status);
  const [note, setNote] = useState(task.progress_note ?? "");
  const [reason, setReason] = useState(task.not_done_reason ?? "");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await report.mutateAsync({
      id: task.id,
      status,
      progress_note: note,
      not_done_reason: status === "completed" ? null : reason,
    });
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Report status
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Report work status</DialogTitle>
          <DialogDescription>
            Say what was done, or why it could not be completed.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          <div>
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TASK_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {titleize(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="r-note">Work done / progress</Label>
            <Textarea id="r-note" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          {status !== "completed" && (
            <div>
              <Label htmlFor="r-reason">Reason if not done</Label>
              <Textarea id="r-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
          )}
          <DialogFooter>
            <Button type="submit" disabled={report.isPending}>
              {report.isPending ? "Saving…" : "Submit"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
