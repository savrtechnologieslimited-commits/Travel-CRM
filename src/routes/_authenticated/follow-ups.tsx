import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarClock, CheckCircle2 } from "lucide-react";
import { TASK_STATUSES, formatDate, titleize } from "@/lib/crm";
import {
  useCompleteFollowUp,
  useFollowUps,
  useRescheduleFollowUp,
  todayISO,
  type FollowUpItem,
  type FollowUpView,
} from "@/lib/followup-data";
import { useCurrentUser } from "@/lib/ops-data";
import { OwnerFilter, useAssigneeNames } from "@/components/assignee-select";
import { PageHeader } from "@/components/app-shell";
import { PriorityBadge, StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/follow-ups")({
  head: () => ({
    meta: [
      { title: "Follow-ups & Reminders — SAVR Travels CRM" },
      {
        name: "description",
        content:
          "Today, overdue and upcoming follow-ups for the travel team, with reschedule and completion.",
      },
      { property: "og:title", content: "Follow-ups & Reminders — SAVR Travels CRM" },
      {
        property: "og:description",
        content: "Daily follow-up queue for travel sales and operations.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: FollowUpsPage,
});

const VIEWS: Array<{ value: FollowUpView; label: string }> = [
  { value: "today", label: "Today" },
  { value: "overdue", label: "Overdue" },
  { value: "upcoming", label: "Upcoming" },
  { value: "all", label: "All" },
];

function FollowUpsPage() {
  const [view, setView] = useState<FollowUpView>("today");
  const [status, setStatus] = useState("all");
  const [owner, setOwner] = useState("all");
  const [search, setSearch] = useState("");
  const [active, setActive] = useState<{
    item: FollowUpItem;
    mode: "reschedule" | "complete";
  } | null>(null);

  const { data: user } = useCurrentUser();
  const nameOf = useAssigneeNames();
  const { data: items = [], isLoading } = useFollowUps({
    view,
    status,
    owner,
    ownerId: user?.id ?? null,
    search,
  });

  return (
    <div>
      <PageHeader
        title="Follow-ups"
        subtitle="Calls, reminders and document chases — today, overdue and ahead."
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Tabs value={view} onValueChange={(v) => setView(v as FollowUpView)}>
          <TabsList>
            {VIEWS.map((v) => (
              <TabsTrigger key={v.value} value={v.value}>
                {v.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search customer, lead or note"
          className="w-64"
        />
        <OwnerFilter value={owner} onChange={setOwner} mineLabel="My follow-ups" />
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
      </div>

      <Card className="overflow-x-auto p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer / Lead</TableHead>
              <TableHead>Linked to</TableHead>
              <TableHead>Assigned</TableHead>
              <TableHead>Due</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Notes</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={8}>Loading follow-ups…</TableCell>
              </TableRow>
            )}
            {!isLoading && items.length === 0 && (
              <TableRow>
                <TableCell colSpan={8}>Nothing in this queue.</TableCell>
              </TableRow>
            )}
            {items.map((item) => (
              <TableRow key={item.key}>
                <TableCell>
                  <p className="font-medium">{item.who}</p>
                  <p className="text-xs text-muted-foreground">{item.title}</p>
                </TableCell>
                <TableCell className="text-sm">
                  {item.leadId ? (
                    <Link
                      to="/leads/$leadId"
                      params={{ leadId: item.leadId }}
                      className="text-primary hover:underline"
                    >
                      {item.leadCode ?? "Lead"}
                    </Link>
                  ) : item.enquiryId ? (
                    <Link to="/enquiries" className="text-primary hover:underline">
                      {item.enquiryCode ?? "Enquiry"}
                    </Link>
                  ) : item.customerId ? (
                    <Link
                      to="/customers/$customerId"
                      params={{ customerId: item.customerId }}
                      className="text-primary hover:underline"
                    >
                      Customer
                    </Link>
                  ) : item.bookingId ? (
                    <Link
                      to="/bookings/$bookingId"
                      params={{ bookingId: item.bookingId }}
                      className="text-primary hover:underline"
                    >
                      Booking
                    </Link>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell className="text-sm">{nameOf(item.assignedTo)}</TableCell>
                <TableCell className="text-sm">
                  {formatDate(item.dueDate)}
                  <span className="block text-xs text-muted-foreground">
                    {item.dueTime ? `${item.dueTime} · ` : ""}
                    {titleize(item.bucket)}
                  </span>
                </TableCell>
                <TableCell>
                  <PriorityBadge priority={item.priority} />
                </TableCell>
                <TableCell>
                  <StatusBadge status={item.status} />
                </TableCell>
                <TableCell className="max-w-52 text-xs text-muted-foreground">
                  <span className="line-clamp-2">{item.notes ?? "—"}</span>
                </TableCell>
                <TableCell className="text-right">
                  {item.status === "completed" ? (
                    <span className="text-xs text-muted-foreground">Done</span>
                  ) : (
                    <div className="flex justify-end gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setActive({ item, mode: "reschedule" })}
                      >
                        <CalendarClock className="size-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setActive({ item, mode: "complete" })}
                      >
                        <CheckCircle2 className="size-4" />
                      </Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {active && (
        <FollowUpDialog item={active.item} mode={active.mode} onClose={() => setActive(null)} />
      )}
    </div>
  );
}

function FollowUpDialog({
  item,
  mode,
  onClose,
}: {
  item: FollowUpItem;
  mode: "reschedule" | "complete";
  onClose: () => void;
}) {
  const reschedule = useRescheduleFollowUp();
  const complete = useCompleteFollowUp();
  const [date, setDate] = useState(item.dueDate ?? todayISO());
  const [time, setTime] = useState(item.dueTime ?? "");
  const [note, setNote] = useState("");
  const [nextDate, setNextDate] = useState("");
  const [nextTime, setNextTime] = useState("");

  async function submit() {
    if (mode === "reschedule") {
      if (!date) return;
      await reschedule.mutateAsync({ item, dueDate: date, dueTime: time || null });
    } else {
      await complete.mutateAsync({
        item,
        note: note || undefined,
        nextDate: nextDate || null,
        nextTime: nextTime || null,
      });
    }
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {mode === "reschedule" ? "Reschedule follow-up" : "Complete follow-up"} · {item.who}
          </DialogTitle>
        </DialogHeader>

        {mode === "reschedule" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="fu-date">New date</Label>
              <Input
                id="fu-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="fu-time">Time</Label>
              <Input
                id="fu-time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                disabled={item.kind === "lead"}
              />
            </div>
          </div>
        ) : (
          <div className="grid gap-3">
            <div>
              <Label htmlFor="fu-note">Outcome note</Label>
              <Textarea
                id="fu-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="What happened on this follow-up?"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="fu-next">Next follow-up date</Label>
                <Input
                  id="fu-next"
                  type="date"
                  value={nextDate}
                  onChange={(e) => setNextDate(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="fu-next-time">Next time</Label>
                <Input
                  id="fu-next-time"
                  type="time"
                  value={nextTime}
                  onChange={(e) => setNextTime(e.target.value)}
                  disabled={item.kind === "lead"}
                />
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={reschedule.isPending || complete.isPending}>
            {mode === "reschedule" ? "Save" : "Mark completed"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
