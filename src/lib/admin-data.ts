import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { normalisePhone } from "./phone";
import {
  createTeamMemberFn,
  deleteTeamMemberFn,
  setTeamMemberTabsFn,
  TEAM_TAB_PATHS,
  type NewTeamMemberInput,
  type TeamRole,
  type TeamTabPath,
} from "./team-members";
import { getBusinessVisibleProfiles } from "./business-visible-users.data";

export { normalisePhone } from "./phone";

function isMissingTabPermissionTable(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error.code === "42P01" || error.code === "PGRST205")
  );
}

/** Finance rollups, role management and outbound messaging helpers. */

export function useFinanceOverview() {
  return useQuery({
    queryKey: ["finance-overview"],
    queryFn: async () => {
      const [bookings, payments, expenses, bills] = await Promise.all([
        supabase
          .from("bookings")
          .select(
            "id,code,booking_date,scope,status,payment_status,total_price,total_cost,amount_received,currency,customers(full_name),destinations(name)",
          )
          .is("deleted_at", null),
        supabase.from("payments").select("id,amount,direction,paid_on,status"),
        supabase.from("expenses").select("id,amount,category,expense_date"),
        supabase.from("supplier_bills").select("id,total_amount,amount_paid,due_date,status"),
      ]);
      if (bookings.error) throw bookings.error;
      return {
        bookings: bookings.data ?? [],
        payments: payments.data ?? [],
        expenses: expenses.data ?? [],
        bills: bills.data ?? [],
      };
    },
  });
}

/* ------------------------------------------------------------------ */
/* Roles                                                               */
/* ------------------------------------------------------------------ */

export function useUserRoles() {
  return useQuery({
    queryKey: ["user-roles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("id,user_id,role");
      if (error) throw error;
      return data.filter(({ role }) => role !== "developer");
    },
  });
}

export function useSetUserRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: TeamRole }) => {
      const { error: delErr } = await supabase.from("user_roles").delete().eq("user_id", userId);
      if (delErr) throw delErr;
      const { error } = await supabase
        .from("user_roles")
        .insert({ user_id: userId, role } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["user-roles"] });
      qc.invalidateQueries({ queryKey: ["current-user-tab-permissions"] });
      toast.success("Role updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useToggleProfileActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from("profiles")
        .update({ is_active } as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["profiles-full"] });
      toast.success("Team member updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useProfilesFull() {
  return useQuery({
    queryKey: ["profiles-full"],
    queryFn: () => getBusinessVisibleProfiles(true),
  });
}

export function useCreateTeamMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: NewTeamMemberInput) => createTeamMemberFn({ data }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["profiles-full"] });
      qc.invalidateQueries({ queryKey: ["user-roles"] });
      qc.invalidateQueries({ queryKey: ["user-tab-permissions"] });
      toast.success("Team member added. They can now sign in with their login ID or email.");
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useUserTabPermissions() {
  return useQuery({
    queryKey: ["user-tab-permissions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_tab_permissions")
        .select("user_id,tab_path")
        .order("tab_path");
      if (error) throw error;
      return data;
    },
  });
}

export function useCurrentUserTabPermissions() {
  return useQuery({
    queryKey: ["current-user-tab-permissions"],
    queryFn: async () => {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!authData.user) throw new Error("Could not identify the signed-in user.");

      const { data: isDeveloper, error: roleError } = await supabase.rpc("has_role", {
        _role: "developer",
        _user_id: authData.user.id,
      });
      if (roleError) throw roleError;
      if (isDeveloper) return [...TEAM_TAB_PATHS];

      const { data, error } = await supabase
        .from("user_tab_permissions")
        .select("tab_path")
        .eq("user_id", authData.user.id);
      if (error && isMissingTabPermissionTable(error)) {
        console.error(
          "Team tab access migration is not applied; allowing all tabs until it is installed.",
          error,
        );
        toast.error(
          "Tab restrictions are not active yet. Apply the team tab access database migration; all tabs remain visible for now.",
        );
        return [...TEAM_TAB_PATHS];
      }
      if (error) throw error;
      return data.map((permission) => permission.tab_path as TeamTabPath);
    },
    retry: (failureCount, error) => {
      return !isMissingTabPermissionTable(error) && failureCount < 2;
    },
  });
}

export function useSetTeamMemberTabs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, allowedTabs }: { userId: string; allowedTabs: TeamTabPath[] }) =>
      setTeamMemberTabsFn({ data: { userId, allowedTabs } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["user-tab-permissions"] });
      qc.invalidateQueries({ queryKey: ["current-user-tab-permissions"] });
      toast.success("Tab access updated");
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useDeleteTeamMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => deleteTeamMemberFn({ data: { userId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["profiles-full"] });
      qc.invalidateQueries({ queryKey: ["user-roles"] });
      qc.invalidateQueries({ queryKey: ["user-tab-permissions"] });
      toast.success("Team member deleted");
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

/* ------------------------------------------------------------------ */
/* Messaging                                                           */
/* ------------------------------------------------------------------ */

export function useMessageLog(limit = 100) {
  return useQuery({
    queryKey: ["message-log", limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("communications")
        .select(
          "id,channel,direction,subject,body,status,occurred_at,customers(full_name),leads(customer_name)",
        )
        .order("occurred_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data;
    },
  });
}

export function useSendMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      const { error } = await supabase.from("communications").insert(values as never);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["message-log"] });
      toast.success("Message logged");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/** Fill {{placeholders}} in a template body from a context record. */
export function renderTemplate(body: string, ctx: Record<string, string>) {
  return body.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, key: string) => ctx[key] ?? `{{${key}}}`);
}

export function whatsappLink(phone: string, text: string) {
  return `https://wa.me/${normalisePhone(phone)}?text=${encodeURIComponent(text)}`;
}

/**
 * Hands the message off to WhatsApp installed on the user's device.
 * Mobile devices deep-link into the app; desktop opens WhatsApp Desktop / Web.
 */
export function openWhatsApp(phone: string, text: string) {
  const to = normalisePhone(phone);
  if (!to) return false;
  const isMobile = /android|iphone|ipad|ipod/i.test(navigator.userAgent);
  const url = whatsappLink(to, text);
  if (isMobile) window.location.href = url;
  else window.open(url, "_blank", "noopener");
  return true;
}
