import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getBusinessVisibleProfiles } from "./business-visible-users.data";

/** Internal operations: team tasks, daily reports, ops jobs, supplier bills and expenses. */

export function useCurrentUser() {
  return useQuery({
    queryKey: ["current-user"],
    queryFn: async () => {
      const { data } = await supabase.auth.getUser();
      return data.user ?? null;
    },
    staleTime: 5 * 60 * 1000,
  });
}

/* ------------------------------------------------------------------ */
/* Team tasks                                                          */
/* ------------------------------------------------------------------ */

export function useTeamTasks(filters?: { assignee?: string; status?: string }) {
  return useQuery({
    queryKey: ["team-tasks", filters],
    queryFn: async () => {
      let q = supabase
        .from("tasks")
        .select(
          "id,title,description,assigned_to,due_date,due_time,priority,status,task_type,progress_note,not_done_reason,last_reported_at,completed_at,created_at,lead_id,booking_id,customer_id",
        )
        .order("due_date", { ascending: true, nullsFirst: false });
      if (filters?.assignee && filters.assignee !== "all")
        q = q.eq("assigned_to", filters.assignee);
      if (filters?.status && filters.status !== "all") q = q.eq("status", filters.status as never);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });
}

export function useAssignTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, values }: { id?: string; values: Record<string, unknown> }) => {
      if (id) {
        const { error } = await supabase
          .from("tasks")
          .update(values as never)
          .eq("id", id);
        if (error) throw error;
        return id;
      }
      const { data, error } = await supabase
        .from("tasks")
        .insert(values as never)
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["team-tasks"] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      toast.success("Task saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useReportTaskProgress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      status,
      progress_note,
      not_done_reason,
    }: {
      id: string;
      status: string;
      progress_note?: string | null;
      not_done_reason?: string | null;
    }) => {
      const { error } = await supabase
        .from("tasks")
        .update({
          status,
          progress_note: progress_note || null,
          not_done_reason: not_done_reason || null,
          last_reported_at: new Date().toISOString(),
          completed_at: status === "completed" ? new Date().toISOString() : null,
        } as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["team-tasks"] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      toast.success("Progress reported");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/* ------------------------------------------------------------------ */
/* Daily reports                                                       */
/* ------------------------------------------------------------------ */

export function useDailyReports(filters?: { user?: string; date?: string }) {
  return useQuery({
    queryKey: ["daily-reports", filters],
    queryFn: async () => {
      let reportsQuery = supabase
        .from("daily_reports")
        .select("*")
        .order("report_date", { ascending: false })
        .limit(200);
      if (filters?.user && filters.user !== "all")
        reportsQuery = reportsQuery.eq("user_id", filters.user);
      if (filters?.date) reportsQuery = reportsQuery.eq("report_date", filters.date);

      const [reports, visibleProfiles] = await Promise.all([
        reportsQuery,
        getBusinessVisibleProfiles(),
      ]);
      if (reports.error) throw reports.error;

      const visibleUserIds = new Set(visibleProfiles.map((profile) => profile.id));
      return reports.data.filter((report) => report.user_id && visibleUserIds.has(report.user_id));
    },
  });
}

export function useSubmitDailyReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      const { data, error } = await supabase
        .from("daily_reports")
        .insert(values as never)
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["daily-reports"] });
      toast.success("Daily report submitted");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/* ------------------------------------------------------------------ */
/* Ops jobs                                                            */
/* ------------------------------------------------------------------ */

export function useOpsJobs(filters?: { status?: string; assignee?: string }) {
  return useQuery({
    queryKey: ["ops-jobs", filters],
    queryFn: async () => {
      let q = supabase
        .from("ops_jobs")
        .select(
          "id,title,service_type,service_date,city,status,cost_amount,confirmation_number,notes,assigned_to,supplier_id,booking_id,booking_item_id,created_at,suppliers(name),bookings(code),booking_items(id,title,fulfilment_mode,suppliers(name,supplier_types,category),transport_services(*, suppliers(name)),activity_services(*, suppliers(name)))",
        )

        .order("service_date", { ascending: true, nullsFirst: false });
      if (filters?.status && filters.status !== "all") q = q.eq("status", filters.status);
      if (filters?.assignee && filters.assignee !== "all")
        q = q.eq("assigned_to", filters.assignee);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });
}

export function useUpsertOpsJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, values }: { id?: string; values: Record<string, unknown> }) => {
      if (id) {
        const { error } = await supabase
          .from("ops_jobs")
          .update(values as never)
          .eq("id", id);
        if (error) throw error;
        return id;
      }
      const { data, error } = await supabase
        .from("ops_jobs")
        .insert(values as never)
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ops-jobs"] });
      toast.success("Job saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/* ------------------------------------------------------------------ */
/* Supplier bills (payables)                                           */
/* ------------------------------------------------------------------ */

export function useSupplierBills(status?: string) {
  return useQuery({
    queryKey: ["supplier-bills", status],
    queryFn: async () => {
      let q = supabase
        .from("supplier_bills")
        .select(
          "id,code,bill_number,bill_date,due_date,currency,amount,amount_inr,tax_amount,tax_amount_inr,total_amount,total_amount_inr,amount_paid,amount_paid_inr,status,service_type,notes,supplier_id,booking_id,suppliers(name),bookings(code)",
        )
        .order("bill_date", { ascending: false });
      if (status && status !== "all") q = q.eq("status", status);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });
}

export function useUpsertSupplierBill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, values }: { id?: string; values: Record<string, unknown> }) => {
      if (id) {
        const { error } = await supabase
          .from("supplier_bills")
          .update(values as never)
          .eq("id", id);
        if (error) throw error;
        return id;
      }
      const { data, error } = await supabase
        .from("supplier_bills")
        .insert(values as never)
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["supplier-bills"] });
      toast.success("Bill saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function usePaySupplierBill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      bill,
      amount,
      amount_inr,
      exchange_rate,
      exchange_rate_updated_at,
      method,
      reference,
      paid_on,
    }: {
      bill: {
        id: string;
        supplier_id: string | null;
        booking_id: string | null;
        amount_paid: number;
        amount_paid_inr?: number | null;
        total_amount: number;
        currency: string;
      };
      amount: number;
      amount_inr: number;
      exchange_rate: number;
      exchange_rate_updated_at: string | null;
      method: string;
      reference?: string;
      paid_on: string;
    }) => {
      const { error: payErr } = await supabase.from("payments").insert({
        supplier_id: bill.supplier_id,
        booking_id: bill.booking_id,
        direction: "outbound",
        amount,
        amount_inr,
        currency: bill.currency,
        exchange_rate,
        exchange_rate_updated_at,
        method,
        reference: reference || null,
        paid_on,
        status: "completed",
      } as never);
      if (payErr) throw payErr;

      const paid = Number(bill.amount_paid) + amount;
      const status = paid >= Number(bill.total_amount) ? "paid" : "partially_paid";
      const { error } = await supabase
        .from("supplier_bills")
        .update({
          amount_paid: paid,
          amount_paid_inr: (Number(bill.amount_paid_inr) || 0) + amount_inr,
          status,
        } as never)
        .eq("id", bill.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["supplier-bills"] });
      qc.invalidateQueries({ queryKey: ["payments"] });
      toast.success("Payout recorded");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/* ------------------------------------------------------------------ */
/* Expenses                                                            */
/* ------------------------------------------------------------------ */

export function useExpenses(category?: string) {
  return useQuery({
    queryKey: ["expenses", category],
    queryFn: async () => {
      let q = supabase
        .from("expenses")
        .select("*")
        .order("expense_date", { ascending: false })
        .limit(300);
      if (category && category !== "all") q = q.eq("category", category);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });
}

export function useAddExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      const { error } = await supabase.from("expenses").insert(values as never);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expenses"] });
      toast.success("Expense recorded");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
