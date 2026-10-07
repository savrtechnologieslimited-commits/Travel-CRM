import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export function getWacrmDatabaseAdminClient(): SupabaseClient {
  if (client) return client;

  const url = process.env["WACRM_SUPABASE_URL"]?.trim();
  const serviceRoleKey = process.env["WACRM_SUPABASE_SERVICE_ROLE_KEY"]?.trim();
  if (!url || !serviceRoleKey) {
    throw new Error(
      "WACRM database access is not configured. Set WACRM_SUPABASE_URL and WACRM_SUPABASE_SERVICE_ROLE_KEY in the CRM server environment.",
    );
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error("WACRM_SUPABASE_URL must be a valid Supabase HTTPS URL.");
  }
  if (
    parsedUrl.protocol !== "https:" &&
    parsedUrl.hostname !== "localhost" &&
    parsedUrl.hostname !== "127.0.0.1"
  ) {
    throw new Error("WACRM_SUPABASE_URL must use HTTPS.");
  }

  client = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
  return client;
}
