import { useState } from "react";
import { Bell, CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  indiaTimeNow,
  todayISO,
  useCreateReminder,
  useUpcomingReminders,
} from "@/lib/followup-data";
import { formatDate } from "@/lib/crm";

export function DashboardRemindersDialog() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(todayISO());
  const [time, setTime] = useState("");
  const [validationError, setValidationError] = useState("");
  const createReminder = useCreateReminder();
  const { data: reminders = [], isLoading } = useUpcomingReminders();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim() || !date || !time) {
      setValidationError("Enter a title, date, and time for the reminder.");
      return;
    }
    if (date < todayISO() || (date === todayISO() && time <= indiaTimeNow())) {
      setValidationError("Choose a future date and time.");
      return;
    }
    setValidationError("");
    createReminder.mutate(
      { title: title.trim(), dueDate: date, dueTime: time },
      {
        onSuccess: () => {
          setTitle("");
          setDate(todayISO());
          setTime("");
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <CalendarClock />
          Reminders
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create reminder</DialogTitle>
          <DialogDescription>
            Set a title and schedule. You’ll get an alert in Notifications when it’s due.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="dashboard-reminder-title">Title</Label>
            <Input
              id="dashboard-reminder-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="What do you need to remember?"
              maxLength={200}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="dashboard-reminder-date">Date</Label>
            <Input
              id="dashboard-reminder-date"
              type="date"
              min={todayISO()}
              value={date}
              onChange={(event) => setDate(event.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="dashboard-reminder-time">Time (India)</Label>
            <Input
              id="dashboard-reminder-time"
              type="time"
              value={time}
              onChange={(event) => setTime(event.target.value)}
              required
            />
          </div>
          {validationError && (
            <p role="alert" className="text-sm text-destructive sm:col-span-2">
              {validationError}
            </p>
          )}
          <div className="flex justify-end sm:col-span-2">
            <Button type="submit" disabled={createReminder.isPending}>
              <Bell className="mr-2 size-4" />
              {createReminder.isPending ? "Creating…" : "Create reminder"}
            </Button>
          </div>
        </form>

        <section className="border-t pt-4">
          <h3 className="font-semibold">Upcoming reminders</h3>
          <p className="mb-3 mt-1 text-sm text-muted-foreground">
            Scheduled reminders assigned to you.
          </p>
          {isLoading ? (
            <p className="py-3 text-sm text-muted-foreground">Loading reminders…</p>
          ) : reminders.length === 0 ? (
            <p className="py-3 text-sm text-muted-foreground">No upcoming reminders.</p>
          ) : (
            <ul className="max-h-64 divide-y overflow-y-auto rounded-md border">
              {reminders.map((reminder) => (
                <li
                  key={reminder.id}
                  className="flex flex-wrap items-center justify-between gap-2 p-3"
                >
                  <p className="font-medium">{reminder.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {formatDate(reminder.due_date)}
                    {reminder.due_time ? ` · ${reminder.due_time.slice(0, 5)} India time` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </DialogContent>
    </Dialog>
  );
}
