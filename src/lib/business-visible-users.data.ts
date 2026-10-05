import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { filterBusinessVisibleUsers } from "./business-visible-users";

let warnedAboutMissingVisibilityMigration = false;

function isMissingVisibilityFunction(error: { code?: string }) {
  return error.code === "PGRST202" || error.code === "42883";
}

export async function getBusinessVisibleProfiles(includeInactive = false) {
  const { data, error } = await supabase.rpc("get_business_visible_profiles", {
    p_include_inactive: includeInactive,
  });
  if (!error) return data;
  if (!isMissingVisibilityFunction(error)) throw error;

  const [profiles, developerRoles] = await Promise.all([
    supabase
      .from("profiles")
      .select("id,full_name,email,phone,login_id,job_title,is_active,created_at")
      .order("full_name"),
    supabase.from("user_roles").select("user_id").eq("role", "developer"),
  ]);
  if (profiles.error) throw profiles.error;
  if (developerRoles.error) throw developerRoles.error;

  if (!warnedAboutMissingVisibilityMigration) {
    console.error(
      "Developer visibility migration is not applied; using filtered compatibility queries until it is installed.",
      error,
    );
    toast.error(
      "Account visibility is being filtered in compatibility mode. Apply the latest CRM database migration to enable server-side filtering.",
    );
    warnedAboutMissingVisibilityMigration = true;
  }

  return filterBusinessVisibleUsers(
    profiles.data,
    new Set(developerRoles.data.map(({ user_id }) => user_id)),
    includeInactive,
  );
}
