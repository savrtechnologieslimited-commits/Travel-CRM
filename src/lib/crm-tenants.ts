import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type CreateCrmTenantInput = { name: string; slug: string };

export function validateCreateCrmTenantInput(input: CreateCrmTenantInput): CreateCrmTenantInput {
  const name = input.name.trim();
  const slug = input.slug.trim();
  if (!name || name.length > 120) throw new Error("Tenant name must contain 1–120 characters");
  if (!/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/.test(slug)) {
    throw new Error("Tenant slug must be 3–64 lowercase letters, numbers, or hyphens");
  }
  return { name, slug };
}

/** Create a tenant and owner membership via the auth-bound atomic database RPC. */
export const createCrmTenantFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: CreateCrmTenantInput) => validateCreateCrmTenantInput(data))
  .handler(async ({ data, context }) => {
    if (!context.userId) throw new Error("Authentication is required to create a CRM tenant");
    const { data: tenantId, error } = await context.supabase.rpc("create_crm_tenant", {
      p_name: data.name,
      p_slug: data.slug,
    });
    if (error) throw new Error("Failed to create CRM tenant");
    return { tenantId };
  });
