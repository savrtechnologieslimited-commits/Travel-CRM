import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { TenantWhatsAppConnection } from "./whatsapp-tenant-routing";

export type ResolvedWhatsAppConnection = TenantWhatsAppConnection & {
  business_name: string | null;
  waba_id: string | null;
  display_phone_number: string | null;
  access_token_secret_ref: string | null;
};

export async function findWhatsAppConnectionByPhoneNumberId(
  phoneNumberId: string,
): Promise<ResolvedWhatsAppConnection | null> {
  const { data, error } = await supabaseAdmin
    .from("whatsapp_connections")
    .select("id,tenant_id,phone_number_id,connection_status,access_token_secret_ref,business_name,waba_id,display_phone_number,crm_tenants!inner(status,crm_data_isolation_status)")
    .eq("phone_number_id", phoneNumberId)
    .maybeSingle();
  if (error) throw new Error("Failed to resolve WhatsApp business phone number");
  if (!data) return null;
  const tenant = data.crm_tenants as unknown as { status: string; crm_data_isolation_status: string };
  return {
    id: data.id,
    tenant_id: data.tenant_id,
    phone_number_id: data.phone_number_id,
    connection_status: data.connection_status,
    tenant_status: tenant.status,
    crm_data_isolation_status: tenant.crm_data_isolation_status,
    access_token_secret_ref: data.access_token_secret_ref,
    business_name: data.business_name,
    waba_id: data.waba_id,
    display_phone_number: data.display_phone_number,
  };
}

/** Resolve a webhook's business phone id to this CRM's active connection. */
export async function resolveWhatsAppWebhookTenant(phoneNumberId: string) {
  const connection = await findWhatsAppConnectionByPhoneNumberId(phoneNumberId);
  if (!connection) return { tenantId: null, ready: false as const, reason: "unknown_phone_number" as const };
  if (connection.connection_status !== "connected") {
    return { tenantId: null, ready: false as const, reason: "connection_not_active" as const };
  }
  if (connection.tenant_status !== "active") {
    return { tenantId: null, ready: false as const, reason: "tenant_not_active" as const };
  }
  return { tenantId: connection.tenant_id, ready: true as const, connection };
}