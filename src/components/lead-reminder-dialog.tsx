import { useEffect, useState } from "react";
import { Bell, Check, Clock3 } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { useProfiles } from "@/lib/data";
import { formatDate, titleize } from "@/lib/crm";
import { useAddLeadReminder, useCompleteLeadReminder, useLeadReminders } from "@/lib/followup-data";

const REMINDER_TIMES = Array.from({ length: 32 }, (_, index) => {
  const totalMinutes = 8 * 60 + index * 30;
  const hour = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
});

function displayTime(value: string | null) {
  if (!value) return "—";
  const [hourString, minuteString] = value.split(":");
  const hour = Number(hourString);
  const minute = Number(minuteString);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return value;
  return new Date(2000, 0, 1, hour, minute).toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
  });
}

type LeadReminderDialogProps = {
  leadId: string;
  customerName: string;
  mobile: string | null;
  destination: string | null;
  travelStart: string | null;
  travelEnd: string | null;
  assignedTo: string | null;
  status: string | null;
};

export function LeadReminderDialog({
  leadId,
  customerName,
  mobile,
  destination,
  travelStart,
  travelEnd,
  assignedTo,
  status,
}: LeadReminderDialogProps) {
  const [open, setOpen] = useState(false);
  const [details, setDetails] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("08:00");
  const [validationError, setValidationError] = useState("");
  const { data: reminders = [], isLoading } = useLeadReminders(leadId);
  const { data: profiles = [] } = useProfiles();
  const addReminder = useAddLeadReminder();
  const completeReminder = useCompleteLeadReminder();
  const assigneeName =
    profiles.find((profile) => profile.id === assignedTo)?.full_name ??
    (assignedTo ? "Unavailable team member" : "Unassigned");

  useEffect(() => {
    if (open) {
      setDetails("");
      setDate("");
      setTime("08:00");
      setValidationError("");
    }
  }, [open]);

  async function submitReminder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!details.trim() || !date || !time) {
      setValidationError("Reminder details, date, and time should not be empty");
      return;
    }
    setValidationError("");
    try {
      await addReminder.mutateAsync({
        leadId,
        title: details.trim(),
        dueDate: date,
        dueTime: time,
        assignedTo,
      });
      setDetails("");
      setDate("");
    } catch {
      // The mutation displays the save error.
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8"
          aria-label={`Add reminder for ${customerName}`}
          title="Add reminder"
        >
          <Bell />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] w-[min(96vw,1100px)] max-w-5xl overflow-y-auto p-0">
        <div className="p-6 sm:p-8">
          <DialogHeader className="mb-5">
            <div className="flex flex-wrap items-start justify-between gap-3 pr-8">
              <div>
                <DialogTitle className="text-xl">Set Reminders</DialogTitle>
                <DialogDescription className="mt-4 text-base font-medium text-foreground">
                  {customerName}
                  {destination ? ` · ${destination}` : ""}
                  {mobile ? ` · ${mobile}` : ""}
                </DialogDescription>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <span>Team Member: {assigneeName}</span>
                <span>Status: {titleize(status)}</span>
              </div>
            </div>
            {(travelStart || travelEnd) && (
              <p className="pt-2 text-right text-sm text-muted-foreground">
                Trip Dates: {formatDate(travelStart)} – {formatDate(travelEnd)}
              </p>
            )}
          </DialogHeader>

          <form
            onSubmit={submitReminder}
            className="grid gap-x-8 gap-y-4 border-y py-5 md:grid-cols-[1.2fr_0.9fr]"
          >
            <div className="space-y-2">
              <Label htmlFor={`reminder-details-${leadId}`}>Reminder Details</Label>
              <Textarea
                id={`reminder-details-${leadId}`}
                rows={3}
                value={details}
                onChange={(event) => setDetails(event.target.value)}
                placeholder="Amount to be collected from client"
              />
              <Button type="submit" disabled={addReminder.isPending}>
                {addReminder.isPending ? "Adding…" : "Add reminder"}
              </Button>
              {validationError && (
                <p role="alert" className="text-sm text-destructive">
                  {validationError}
                </p>
              )}
            </div>
            <div className="grid content-start gap-4 sm:grid-cols-2 md:grid-cols-1">
              <div className="space-y-2">
                <Label htmlFor={`reminder-date-${leadId}`}>Reminder Date</Label>
                <Input
                  id={`reminder-date-${leadId}`}
                  type="date"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`reminder-time-${leadId}`}>Reminder Time (India)</Label>
                <div className="relative">
                  <Clock3 className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <select
                    id={`reminder-time-${leadId}`}
                    className="h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    value={time}
                    onChange={(event) => setTime(event.target.value)}
                  >
                    {REMINDER_TIMES.map((timeOption) => (
                      <option key={timeOption} value={timeOption}>
                        {displayTime(timeOption)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </form>

          <div className="mt-4 overflow-x-auto rounded-md border">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-muted/70 text-left">
                <tr>
                  <th className="px-4 py-3 font-semibold">Reminder Text</th>
                  <th className="px-4 py-3 font-semibold">Reminder Date</th>
                  <th className="px-4 py-3 font-semibold">Notes</th>
                  <th className="px-4 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                      Loading reminders…
                    </td>
                  </tr>
                )}
                {!isLoading && reminders.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                      No reminders for this lead
                    </td>
                  </tr>
                )}
                {reminders.map((reminder) => (
                  <tr key={reminder.id} className="border-t">
                    <td
                      className={`max-w-sm px-4 py-3 ${reminder.status === "completed" ? "text-muted-foreground line-through" : ""}`}
                    >
                      {reminder.title}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {formatDate(reminder.due_date)}
                      {reminder.due_time ? ` · ${displayTime(reminder.due_time)}` : ""}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {reminder.description ?? reminder.progress_note ?? titleize(reminder.status)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {reminder.status !== "completed" ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-8 text-emerald-700"
                          aria-label="Mark reminder complete"
                          title="Mark complete"
                          disabled={completeReminder.isPending}
                          onClick={() => completeReminder.mutate(reminder.id)}
                        >
                          <Check className="size-4" />
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">Completed</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
