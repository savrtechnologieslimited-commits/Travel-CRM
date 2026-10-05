export type TenantWhatsAppConnection = {
  id: string;
  tenant_id: string;
  phone_number_id: string | null;
  connection_status: string;
  tenant_status: string;
  crm_data_isolation_status: string;
};

export type TenantRouteResult =
  | { ok: true; connection: TenantWhatsAppConnection; tenantId: string }
  | { ok: false; reason: "unknown_phone_number" | "ambiguous_phone_number" | "connection_not_active" | "tenant_not_active" };

/** Resolve Meta webhook metadata to the active CRM connection. */
export function resolveTenantForPhoneNumber(
  connections: readonly TenantWhatsAppConnection[],
  phoneNumberId: string | null | undefined,
): TenantRouteResult {
  if (!phoneNumberId) return { ok: false, reason: "unknown_phone_number" };
  const matches = connections.filter((connection) => connection.phone_number_id === phoneNumberId);
  if (matches.length === 0) return { ok: false, reason: "unknown_phone_number" };
  if (matches.length > 1) return { ok: false, reason: "ambiguous_phone_number" };
  const connection = matches[0]!;
  if (connection.connection_status !== "connected") {
    return { ok: false, reason: "connection_not_active" };
  }
  if (connection.tenant_status !== "active") {
    return { ok: false, reason: "tenant_not_active" };
  }
  return { ok: true, connection, tenantId: connection.tenant_id };
}

export function conversationBelongsToTenant(
  conversationTenantId: string | null | undefined,
  connectionTenantId: string,
): boolean {
  return Boolean(conversationTenantId) && conversationTenantId === connectionTenantId;
}
