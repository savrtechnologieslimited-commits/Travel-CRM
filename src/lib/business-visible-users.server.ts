import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { filterBusinessVisibleUsers } from "./business-visible-users";

export async function getBusinessVisibleEmployeeIds(employeeIds: string[]) {
  if (employeeIds.length === 0) return new Set<string>();

  const [profiles, developerRoles] = await Promise.all([
    supabaseAdmin
      .from("profiles")
      .select("id,is_active")
      .eq("is_active", true)
      .in("id", employeeIds),
    supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("role", "developer")
      .in("user_id", employeeIds),
  ]);
  if (profiles.error) throw profiles.error;
  if (developerRoles.error) throw developerRoles.error;

  const visibleUsers = filterBusinessVisibleUsers(
    profiles.data ?? [],
    new Set((developerRoles.data ?? []).map(({ user_id }) => user_id)),
  );
  return new Set(visibleUsers.map(({ id }) => id));
}
