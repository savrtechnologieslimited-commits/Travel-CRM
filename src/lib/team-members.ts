import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const TEAM_ROLES = ["admin", "manager", "operations", "read_only"] as const;

export type TeamRole = (typeof TEAM_ROLES)[number];
export type StoredTeamRole = TeamRole | "developer";

export const TEAM_TAB_PATHS = [
  "/dashboard",
  "/leads",
  "/customers",
  "/itinerary-proposals",
  "/itinerary-library",
  "/quotations",
  "/bookings",
  "/payments",
  "/suppliers",
  "/packages",
  "/groups",
  "/wacrm",
  "/gmail",
  "/operations",
  "/team-tasks",
  "/reports",
  "/activity",
  "/team",
  "/settings",
  "/payables",
  "/invoices",
  "/finance",
] as const;

export type TeamTabPath = (typeof TEAM_TAB_PATHS)[number];

export type NewTeamMemberInput = {
  fullName: string;
  mobile: string;
  email: string;
  loginId: string;
  password: string;
  role: StoredTeamRole;
  allowedTabs: TeamTabPath[];
};

export const createTeamMemberFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: NewTeamMemberInput) => data)
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error } = await context.supabase.rpc("has_role", {
      _role: "admin",
      _user_id: context.userId,
    });
    if (error || !isAdmin) throw new Error("Only administrators can add team members.");

    const { createTeamMember } = await import("./team-members.server");
    return createTeamMember(data);
  });

export const setTeamMemberTabsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { userId: string; allowedTabs: TeamTabPath[] }) => data)
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error } = await context.supabase.rpc("has_role", {
      _role: "admin",
      _user_id: context.userId,
    });
    if (error || !isAdmin) throw new Error("Only administrators can manage team tab access.");

    const { setTeamMemberTabs } = await import("./team-members.server");
    return setTeamMemberTabs(data.userId, data.allowedTabs);
  });

export const deleteTeamMemberFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { userId: string }) => data)
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error } = await context.supabase.rpc("has_role", {
      _role: "admin",
      _user_id: context.userId,
    });
    if (error || !isAdmin) throw new Error("Only administrators can delete team members.");
    if (data.userId === context.userId) throw new Error("You cannot delete your own account.");

    const { deleteTeamMember } = await import("./team-members.server");
    return deleteTeamMember(data.userId);
  });

export const signInWithLoginIdFn = createServerFn({ method: "POST" })
  .validator((data: { identifier: string; password: string }) => data)
  .handler(async ({ data }) => {
    const { signInWithLoginId } = await import("./team-members.server");
    return signInWithLoginId(data);
  });
