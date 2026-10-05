import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useCurrentUser } from "@/lib/ops-data";

/**
 * Follow-up queue built on the existing `tasks` rows and `leads.next_follow_up`
 * field. No new reminder architecture: tasks stay the activity record, leads keep
 * their own next-follow-up date, notifications reuse the existing table.
 */

export type FollowUpView = "today" | "overdue" | "upcoming" | "all";

export type FollowUpItem = {
  key: string;
  kind: "task" | "lead";
  id: string;
  title: string;
  notes: string | null;
  taskType: string | null;
  who: string;
  leadId: string | null;
  leadCode: string | null;
  enquiryId: string | null;
  enquiryCode: string | null;
  customerId: string | null;
  bookingId: string | null;
  assignedTo: string | null;
  dueDate: string | null;
  dueTime: string | null;
  priority: string;
  status: string;
  bucket: FollowUpView;
};

export function todayISO() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "00";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function indiaTimeNow() {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date());
}

export function useUpcomingReminders() {
  return useQuery({
    queryKey: ["upcoming-reminders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("id,title,due_date,due_time,status,created_at")
        .eq("task_type", "reminder")
        .neq("status", "completed")
        .gte("due_date", todayISO())
        .order("due_date", { ascending: true })
        .order("due_time", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 60_000,
  });
}

export function useCreateReminder() {
  const qc = useQueryClient();
  const { data: user } = useCurrentUser();
  return useMutation({
    mutationFn: async (input: { title: string; dueDate: string; dueTime: string }) => {
      if (!user?.id) throw new Error("You must be signed in to create a reminder");
      const { error } = await supabase.from("tasks").insert({
        title: input.title.trim(),
        task_type: "reminder",
        status: "pending",
        priority: "medium",
        due_date: input.dueDate,
        due_time: input.dueTime,
        assigned_to: user.id,
        created_by: user.id,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries();
      toast.success("Reminder created");
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useLeadReminders(leadId: string) {
  return useQuery({
    queryKey: ["lead-reminders", leadId],
    enabled: Boolean(leadId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select(
          "id,title,due_date,due_time,description,progress_note,status,created_at,created_by,assigned_to",
        )
        .eq("lead_id", leadId)
        .eq("task_type", "follow_up")
        .order("due_date", { ascending: true })
        .order("due_time", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useAddLeadReminder() {
  const qc = useQueryClient();
  const { data: user } = useCurrentUser();
  return useMutation({
    mutationFn: async (input: {
      leadId: string;
      title: string;
      dueDate: string;
      dueTime: string;
      assignedTo: string | null;
    }) => {
      const { error } = await supabase.from("tasks").insert({
        lead_id: input.leadId,
        title: input.title.trim(),
        task_type: "follow_up",
        status: "pending",
        priority: "medium",
        due_date: input.dueDate,
        due_time: input.dueTime,
        assigned_to: input.assignedTo ?? user?.id ?? null,
        created_by: user?.id ?? null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries();
      toast.success("Reminder added");
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useCompleteLeadReminder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (reminderId: string) => {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from("tasks")
        .update({ status: "completed", completed_at: now, last_reported_at: now } as never)
        .eq("id", reminderId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries();
      toast.success("Reminder completed");
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

function bucketOf(due: string | null, status: string): Exclude<FollowUpView, "all"> {
  const today = todayISO();
  if (status === "completed") return "upcoming";
  if (!due) return "upcoming";
  if (due < today) return "overdue";
  if (due === today) return "today";
  return "upcoming";
}

export function useFollowUps(filters?: {
  view?: FollowUpView;
  owner?: string;
  ownerId?: string | null;
  status?: string;
  search?: string;
}) {
  const view = filters?.view ?? "today";
  const owner = filters?.owner ?? "all";
  const status = filters?.status ?? "all";
  const search = (filters?.search ?? "").trim().toLowerCase();

  return useQuery({
    queryKey: ["follow-ups", view, owner, filters?.ownerId, status, search],
    queryFn: async () => {
      const [tasks, leads] = await Promise.all([
        supabase
          .from("tasks")
          .select(
            "id,title,description,task_type,status,priority,due_date,due_time,progress_note,assigned_to,lead_id,enquiry_id,customer_id,booking_id,completed_at,leads(id,code,customer_name),enquiries(id,code),customers(id,full_name)",
          )
          .order("due_date", { ascending: true }),
        supabase
          .from("leads")
          .select("id,code,customer_name,next_follow_up,priority,status,assigned_to,notes")
          .is("deleted_at", null)
          .not("next_follow_up", "is", null)
          .order("next_follow_up", { ascending: true }),
      ]);
      if (tasks.error) throw tasks.error;
      if (leads.error) throw leads.error;

      const items: FollowUpItem[] = [];

      for (const t of tasks.data ?? []) {
        items.push({
          key: `task:${t.id}`,
          kind: "task",
          id: t.id,
          title: t.title,
          notes: t.progress_note ?? t.description ?? null,
          taskType: t.task_type ?? null,
          who:
            t.leads?.customer_name ??
            t.customers?.full_name ??
            (t.enquiries?.code ? `Enquiry ${t.enquiries.code}` : "—"),
          leadId: t.lead_id ?? null,
          leadCode: t.leads?.code ?? null,
          enquiryId: t.enquiry_id ?? null,
          enquiryCode: t.enquiries?.code ?? null,
          customerId: t.customer_id ?? null,
          bookingId: t.booking_id ?? null,
          assignedTo: t.assigned_to ?? null,
          dueDate: t.due_date ?? null,
          dueTime: t.due_time ?? null,
          priority: t.priority ?? "medium",
          status: t.status ?? "pending",
          bucket: bucketOf(t.due_date ?? null, t.status ?? "pending"),
        });
      }

      for (const l of leads.data ?? []) {
        items.push({
          key: `lead:${l.id}`,
          kind: "lead",
          id: l.id,
          title: `Follow up · ${l.customer_name}`,
          notes: l.notes ?? null,
          taskType: "follow_up",
          who: l.customer_name,
          leadId: l.id,
          leadCode: l.code ?? null,
          enquiryId: null,
          enquiryCode: null,
          customerId: null,
          bookingId: null,
          assignedTo: l.assigned_to ?? null,
          dueDate: l.next_follow_up ?? null,
          dueTime: null,
          priority: l.priority ?? "medium",
          status: "pending",
          bucket: bucketOf(l.next_follow_up ?? null, "pending"),
        });
      }

      let rows = items;
      if (view !== "all") rows = rows.filter((r) => r.bucket === view && r.status !== "completed");
      if (status !== "all") rows = rows.filter((r) => r.status === status);
      if (owner === "mine" && filters?.ownerId)
        rows = rows.filter((r) => r.assignedTo === filters.ownerId);
      if (owner === "unassigned") rows = rows.filter((r) => !r.assignedTo);
      if (search)
        rows = rows.filter((r) =>
          [r.title, r.who, r.leadCode, r.enquiryCode, r.notes]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(search)),
        );

      return rows.sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));
    },
    refetchInterval:
      view === "all" && owner === "mine" && status === "all" && !search ? 60_000 : false,
  });
}

/** Move a follow-up to a new date/time without losing its record. */
export function useRescheduleFollowUp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { item: FollowUpItem; dueDate: string; dueTime?: string | null }) => {
      const { item, dueDate, dueTime } = input;
      if (item.kind === "task") {
        const { error } = await supabase
          .from("tasks")
          .update({
            due_date: dueDate,
            due_time: dueTime ?? null,
            status: "pending",
          } as never)
          .eq("id", item.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("leads")
          .update({ next_follow_up: dueDate } as never)
          .eq("id", item.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries();
      toast.success("Follow-up rescheduled");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/**
 * Completion keeps history: task rows are marked completed (never deleted) and a
 * lead follow-up writes a completed task row before the next date is set.
 */
export function useCompleteFollowUp() {
  const qc = useQueryClient();
  const { data: user } = useCurrentUser();
  return useMutation({
    mutationFn: async (input: {
      item: FollowUpItem;
      note?: string | undefined;
      nextDate?: string | null;
      nextTime?: string | null;
    }) => {
      const { item, note, nextDate, nextTime } = input;
      const now = new Date().toISOString();

      if (item.kind === "task") {
        const { error } = await supabase
          .from("tasks")
          .update({
            status: "completed",
            completed_at: now,
            last_reported_at: now,
            ...(note ? { progress_note: note } : {}),
          } as never)
          .eq("id", item.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("tasks").insert({
          title: item.title,
          task_type: "follow_up",
          status: "completed",
          priority: item.priority,
          due_date: item.dueDate,
          completed_at: now,
          last_reported_at: now,
          progress_note: note ?? null,
          lead_id: item.leadId,
          assigned_to: item.assignedTo,
          created_by: user?.id ?? null,
        } as never);
        if (error) throw error;
        const { error: leadError } = await supabase
          .from("leads")
          .update({ next_follow_up: nextDate ?? null } as never)
          .eq("id", item.id);
        if (leadError) throw leadError;
      }

      // A next follow-up on a task becomes a fresh task row in the same queue.
      if (item.kind === "task" && nextDate) {
        const { error } = await supabase.from("tasks").insert({
          title: item.title,
          task_type: item.taskType ?? "follow_up",
          status: "pending",
          priority: item.priority,
          due_date: nextDate,
          due_time: nextTime ?? null,
          lead_id: item.leadId,
          enquiry_id: item.enquiryId,
          customer_id: item.customerId,
          booking_id: item.bookingId,
          assigned_to: item.assignedTo,
          created_by: user?.id ?? null,
        } as never);
        if (error) throw error;
        if (item.leadId) {
          await supabase
            .from("leads")
            .update({ next_follow_up: nextDate } as never)
            .eq("id", item.leadId);
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries();
      toast.success("Follow-up completed");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/**
 * App-wide notifications for the signed-in employee's due/overdue follow-ups.
 * Scheduled reminders are checked once a minute using India-local date/time.
 * Duplicates are avoided by a deterministic link (`follow-up key + due date`)
 * that is checked against the existing notifications table before inserting.
 */
export function useFollowUpReminders() {
  const qc = useQueryClient();
  const { data: user } = useCurrentUser();
  const { data: mine = [] } = useFollowUps({
    view: "all",
    owner: "mine",
    ownerId: user?.id ?? null,
  });

  const currentTime = indiaTimeNow();
  const due = mine.filter(
    (i) =>
      i.status !== "completed" &&
      (i.bucket === "overdue" ||
        (i.bucket === "today" && (!i.dueTime || i.dueTime.slice(0, 5) <= currentTime))),
  );

  return useQuery({
    queryKey: ["follow-up-reminders", user?.id, due.map((d) => `${d.key}@${d.dueDate}`).join(",")],
    enabled: Boolean(user?.id) && due.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const links = due.map((i) => `/follow-ups?item=${i.key}&due=${i.dueDate}`);
      const { data: existing, error } = await supabase
        .from("notifications")
        .select("link")
        .eq("user_id", user!.id)
        .eq("category", "follow_up")
        .in("link", links);
      if (error) throw error;
      const seen = new Set((existing ?? []).map((n) => n.link));
      const rows = due
        .filter((i) => !seen.has(`/follow-ups?item=${i.key}&due=${i.dueDate}`))
        .map((i) => ({
          user_id: user!.id,
          title:
            i.taskType === "reminder"
              ? `Reminder: ${i.title}`
              : i.bucket === "overdue"
                ? `Overdue follow-up: ${i.who}`
                : `Follow-up today: ${i.who}`,
          body:
            i.taskType === "reminder"
              ? `Scheduled for ${i.dueDate}${i.dueTime ? ` at ${i.dueTime.slice(0, 5)}` : ""}`
              : i.title,
          category: "follow_up",
          link: `/follow-ups?item=${i.key}&due=${i.dueDate}`,
        }));
      if (rows.length) {
        const { error: insertError } = await supabase.from("notifications").insert(rows as never);
        if (insertError) throw insertError;
        qc.invalidateQueries({ queryKey: ["notifications"] });
        for (const row of rows) toast.info(row.title, { description: row.body });
      }
      return rows.length;
    },
  });
}
