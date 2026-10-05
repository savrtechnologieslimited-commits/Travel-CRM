import { createClient } from "@supabase/supabase-js";
import {
  TEAM_TAB_PATHS,
  TEAM_ROLES,
  type NewTeamMemberInput,
  type StoredTeamRole,
  type TeamTabPath,
} from "./team-members";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const VALID_ROLES = new Set<StoredTeamRole>([...TEAM_ROLES, "developer"]);
const VALID_TABS = new Set<string>(TEAM_TAB_PATHS);

function normalizedInput(input: NewTeamMemberInput): NewTeamMemberInput {
  const fullName = input.fullName.trim();
  const mobile = input.mobile.trim();
  const email = input.email.trim().toLowerCase();
  const loginId = input.loginId.trim().toLowerCase();
  if (!fullName || fullName.length > 120) throw new Error("Enter a valid team member name.");
  if (!mobile || mobile.length > 32) throw new Error("Enter a valid mobile number.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new Error("Enter a valid email address.");
  }
  if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(loginId)) {
    throw new Error(
      "Login ID must be 3–32 characters using letters, numbers, dots, underscores, or hyphens.",
    );
  }
  if (loginId.includes("@")) throw new Error("Login ID cannot be an email address.");
  if (input.password.length < 8 || input.password.length > 128) {
    throw new Error("Password must be at least 8 characters.");
  }
  if (!VALID_ROLES.has(input.role)) throw new Error("Choose a valid team role.");
  const allowedTabs = input.role === "developer" ? [...TEAM_TAB_PATHS] : input.allowedTabs;
  if (
    !Array.isArray(allowedTabs) ||
    allowedTabs.length === 0 ||
    allowedTabs.some((path) => !VALID_TABS.has(path))
  ) {
    throw new Error("Select at least one valid tab for the team member.");
  }
  return { ...input, fullName, mobile, email, loginId, allowedTabs };
}

async function replaceTeamMemberTabs(userId: string, allowedTabs: TeamTabPath[]) {
  if (!Array.isArray(allowedTabs) || allowedTabs.length === 0) {
    throw new Error("Select at least one tab for the team member.");
  }
  if (allowedTabs.some((path) => !VALID_TABS.has(path))) {
    throw new Error("Choose only valid CRM tabs.");
  }

  const { error } = await supabaseAdmin.rpc("replace_user_tab_permissions", {
    p_user_id: userId,
    p_tab_paths: [...new Set(allowedTabs)],
  });
  if (error) throw new Error(error.message || "Could not update the team member's tab access.");
}

export async function setTeamMemberTabs(userId: string, allowedTabs: TeamTabPath[]) {
  await replaceTeamMemberTabs(userId, allowedTabs);
  return { id: userId };
}

export async function deleteTeamMember(userId: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
    throw new Error("Choose a valid team member.");
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();
  if (profileError) throw new Error("Could not verify the team member account.");
  if (!profile) throw new Error("That team member no longer exists.");

  const { data: adminAssignments, error: rolesError } = await supabaseAdmin
    .from("user_roles")
    .select("user_id")
    .in("role", ["admin", "developer"]);
  if (rolesError) throw new Error("Could not verify administrator accounts.");

  const adminIds = [...new Set(adminAssignments.map((assignment) => assignment.user_id))];
  if (adminIds.includes(userId)) {
    const otherAdminIds = adminIds.filter((id) => id !== userId);
    const { data: activeAdmins, error: activeAdminsError } = otherAdminIds.length
      ? await supabaseAdmin
          .from("profiles")
          .select("id")
          .in("id", otherAdminIds)
          .eq("is_active", true)
          .limit(1)
      : { data: [], error: null };

    if (activeAdminsError) throw new Error("Could not verify remaining administrator accounts.");
    if (!activeAdmins.length) {
      throw new Error("The last active administrator cannot be deleted.");
    }
  }

  const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (deleteError) {
    if (deleteError.message.toLowerCase().includes("user not found")) {
      const { data: deletedProfile, error: profileDeleteError } = await supabaseAdmin
        .from("profiles")
        .delete()
        .eq("id", userId)
        .select("id")
        .maybeSingle();

      if (profileDeleteError) {
        console.error("Could not remove the orphaned team member profile:", profileDeleteError);
        throw new Error(profileDeleteError.message || "Could not remove the team member profile.");
      }
      if (!deletedProfile) throw new Error("That team member profile no longer exists.");

      return { id: userId };
    }

    console.error("Could not delete the team member Auth account:", deleteError.message);
    throw new Error(deleteError.message || "Could not delete the team member account.");
  }

  return { id: userId };
}

export async function createTeamMember(untrustedInput: NewTeamMemberInput) {
  const input = normalizedInput(untrustedInput);
  const { data: existingLogin, error: loginCheckError } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("login_id", input.loginId)
    .maybeSingle();
  if (loginCheckError) {
    throw new Error(loginCheckError.message || "Could not verify the login ID.");
  }
  if (existingLogin) throw new Error("That email or login ID is already in use.");

  const { data: created, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: { full_name: input.fullName, login_id: input.loginId },
  });
  if (authError || !created.user) {
    if (authError?.message.toLowerCase().includes("already")) {
      throw new Error("That email or login ID is already in use.");
    }
    throw new Error(authError?.message ?? "Could not create the team member account.");
  }

  const userId = created.user.id;
  try {
    const { error: profileError } = await supabaseAdmin.from("profiles").upsert(
      {
        id: userId,
        full_name: input.fullName,
        email: input.email,
        phone: input.mobile,
        login_id: input.loginId,
        is_active: true,
      },
      { onConflict: "id" },
    );
    if (profileError) {
      if (profileError.code === "23505")
        throw new Error("That email or login ID is already in use.");
      throw new Error(profileError.message || "Could not save the team member profile.");
    }

    const { error: clearRolesError } = await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", userId);
    if (clearRolesError)
      throw new Error(clearRolesError.message || "Could not clear the team member role.");

    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: userId, role: input.role });
    if (roleError) throw new Error(roleError.message || "Could not assign the team member role.");
    await replaceTeamMemberTabs(userId, input.allowedTabs);
  } catch (error) {
    const { error: cleanupError } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (cleanupError) {
      console.error("Could not roll back the partially created Auth account:", cleanupError);
      const cause = error instanceof Error ? error.message : "Unknown provisioning error";
      throw new Error(`${cause}. Cleanup also failed: ${cleanupError.message}`);
    }
    throw error;
  }

  return { id: userId };
}

function createPublicAuthClient() {
  const url = process.env["SUPABASE_URL"]?.trim();
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]?.trim();
  if (!url || !key) throw new Error("Supabase sign-in is not configured.");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export async function signInWithLoginId({
  identifier,
  password,
}: {
  identifier: string;
  password: string;
}) {
  const value = identifier.trim();
  if (!value || !password) throw new Error("Enter your login ID and password.");

  let email = value.toLowerCase();
  if (!email.includes("@")) {
    const { data: profile, error } = await supabaseAdmin
      .from("profiles")
      .select("email,is_active")
      .eq("login_id", email)
      .maybeSingle();
    if (error) {
      console.error("Login ID lookup failed in Supabase profiles:", error.message);
      throw new Error(
        "Could not verify the login ID. The app's Supabase server URL and service key may point to different projects.",
      );
    }
    if (!profile?.email || !profile.is_active) {
      throw new Error("Invalid login ID or password.");
    }
    email = profile.email;
  }

  const { data, error } = await createPublicAuthClient().auth.signInWithPassword({
    email,
    password,
  });
  if (error || !data.session) throw new Error("Invalid login ID or password.");
  return {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  };
}
