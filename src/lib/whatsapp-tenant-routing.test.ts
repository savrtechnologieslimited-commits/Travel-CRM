import { describe, expect, test } from "bun:test";
import {
  conversationBelongsToTenant,
  resolveTenantForPhoneNumber,
  type TenantWhatsAppConnection,
} from "./whatsapp-tenant-routing";
import {
  sendTenantWhatsAppMessage,
  type TenantWhatsAppOutboundDependencies,
} from "./tenant-whatsapp-outbound.server";

function connection(overrides: Partial<TenantWhatsAppConnection> = {}): TenantWhatsAppConnection {
  return {
    id: "connection-a",
    tenant_id: "tenant-a",
    phone_number_id: "phone-a",
    connection_status: "connected",
    tenant_status: "active",
    crm_data_isolation_status: "isolated",
    ...overrides,
  };
}

describe("WhatsApp tenant routing foundation", () => {
  test("database connection guard requires Meta connection identifiers, not CRM isolation", async () => {
    const migration = await Bun.file(new URL("../../supabase/migrations/20261002120000_allow_single_instance_whatsapp_connection.sql", import.meta.url)).text();
    expect(migration).toContain("NEW.phone_number_id IS NULL OR NEW.waba_id IS NULL OR NEW.access_token_secret_ref IS NULL");
    expect(migration).not.toContain("crm_data_isolation_status");
  });

  test("resolves Meta phone_number_id to exactly one active CRM connection", () => {
    const result = resolveTenantForPhoneNumber([connection()], "phone-a");
    expect(result).toMatchObject({ ok: true, tenantId: "tenant-a" });
  });

  test("rejects missing, unknown, ambiguous, disconnected, and suspended connections", () => {
    expect(resolveTenantForPhoneNumber([connection()], null)).toMatchObject({ ok: false, reason: "unknown_phone_number" });
    expect(resolveTenantForPhoneNumber([connection()], "unknown")).toMatchObject({ ok: false, reason: "unknown_phone_number" });
    expect(resolveTenantForPhoneNumber([connection(), connection({ id: "connection-b", tenant_id: "tenant-b" })], "phone-a")).toMatchObject({ ok: false, reason: "ambiguous_phone_number" });
    expect(resolveTenantForPhoneNumber([connection({ connection_status: "pending" })], "phone-a")).toMatchObject({ ok: false, reason: "connection_not_active" });
    expect(resolveTenantForPhoneNumber([connection({ tenant_status: "suspended" })], "phone-a")).toMatchObject({ ok: false, reason: "tenant_not_active" });
  });

  test("allows the active single-instance connection when legacy isolation metadata is present", () => {
    expect(resolveTenantForPhoneNumber([connection({ crm_data_isolation_status: "legacy_shared" })], "phone-a")).toMatchObject({ ok: true, tenantId: "tenant-a" });
  });

  test("requires conversation ownership to match the resolved tenant", () => {
    expect(conversationBelongsToTenant("tenant-a", "tenant-a")).toBe(true);
    expect(conversationBelongsToTenant("tenant-b", "tenant-a")).toBe(false);
    expect(conversationBelongsToTenant(null, "tenant-a")).toBe(false);
  });
});

describe("WhatsApp tenant delete policy guard", () => {
  test("authorized isolated tenant can delete its own message using the strict tenant guard", async () => {
    const migration = await Bun.file(new URL("../../supabase/migrations/20261002101500_fix_whatsapp_delete_policy_tenant_guard.sql", import.meta.url)).text();
    expect(migration).toContain('CREATE POLICY "tenant manager delete whatsapp_messages"');
    expect(migration).toContain("private.can_access_whatsapp_tenant(conversation.tenant_id)");
    expect(migration).toContain("private.is_manager(auth.uid())");
  });

  test("authorized isolated tenant can delete its own travel requirement using the strict tenant guard", async () => {
    const migration = await Bun.file(new URL("../../supabase/migrations/20261002101500_fix_whatsapp_delete_policy_tenant_guard.sql", import.meta.url)).text();
    expect(migration).toContain('CREATE POLICY "tenant manager delete whatsapp_travel_requirements"');
    expect(migration).toContain("private.can_access_whatsapp_tenant(conversation.tenant_id)");
    expect(migration).toContain("private.is_manager(auth.uid())");
  });

  test("another tenant cannot delete because the policy requires the same tenant-safe WhatsApp guard", async () => {
    const migration = await Bun.file(new URL("../../supabase/migrations/20261002101500_fix_whatsapp_delete_policy_tenant_guard.sql", import.meta.url)).text();
    expect(migration).toContain("private.can_access_whatsapp_tenant(conversation.tenant_id)");
    expect(migration).not.toContain("private.is_crm_tenant_member(conversation.tenant_id)");
  });

  test("legacy/shared tenant cannot bypass the WhatsApp tenant guard in delete authorization", async () => {
    const migration = await Bun.file(new URL("../../supabase/migrations/20261002101500_fix_whatsapp_delete_policy_tenant_guard.sql", import.meta.url)).text();
    expect(migration).toContain("private.can_access_whatsapp_tenant(conversation.tenant_id)");
    expect(migration).not.toContain("private.is_crm_tenant_member(conversation.tenant_id)");
  });

  test("tenant membership alone is insufficient where the WhatsApp guard rejects access", async () => {
    const migration = await Bun.file(new URL("../../supabase/migrations/20261002101500_fix_whatsapp_delete_policy_tenant_guard.sql", import.meta.url)).text();
    expect(migration).toContain("private.can_access_whatsapp_tenant(conversation.tenant_id)");
    expect(migration).not.toContain("private.is_crm_tenant_member(conversation.tenant_id)");
  });
});

describe("tenant WhatsApp outbound gateway", () => {
  function dependencies(overrides: Partial<TenantWhatsAppOutboundDependencies> = {}): TenantWhatsAppOutboundDependencies & { sent: unknown[]; tokenResolutions: string[] } {
    const sent: unknown[] = [];
    const tokenResolutions: string[] = [];
    return {
      sent,
      tokenResolutions,
      repository: {
        findConnectionForTenant: async (tenantId) => ({
          tenant_id: tenantId,
          connection_status: "connected",
          crm_data_isolation_status: "isolated",
          phone_number_id: "phone-a",
          access_token_secret_ref: "secret-ref",
        }),
        findConversationTenant: async () => ({ tenantId: "tenant-a", conversationMode: "AI_ACTIVE" }),
      },
      credentials: {
        resolveAccessToken: async (reference) => {
          tokenResolutions.push(reference);
          return "server-only-token";
        },
      },
      send: async (message, provider) => {
        sent.push(message);
        expect(provider).toBeDefined();
        return {
          providerMessageId: "wamid.test",
          status: "accepted",
          timestamp: "2026-10-02T00:00:00.000Z",
          recipient: message.recipientPhone,
          messageType: message.payload.type === "text" ? "text" : message.payload.type === "document" ? "document" : "interactive",
        };
      },
      ...overrides,
    };
  }

  test("resolves server credential reference and delegates to existing provider boundary", async () => {
    const deps = dependencies();
    await expect(sendTenantWhatsAppMessage({
      tenantId: "tenant-a",
      conversationId: "conversation-a",
      recipient: "919999999999",
      message: { type: "text", text: "Welcome" },
    }, deps)).resolves.toMatchObject({ providerMessageId: "wamid.test" });
    expect(deps.tokenResolutions).toEqual(["secret-ref"]);
    expect(deps.sent).toHaveLength(1);
  });

  test("rejects mismatched conversations but allows the legacy single-instance state", async () => {
    const wrongConversation = dependencies({
      repository: {
        findConnectionForTenant: async (tenantId) => ({ tenant_id: tenantId, connection_status: "connected", crm_data_isolation_status: "isolated", phone_number_id: "phone-a", access_token_secret_ref: "secret-ref" }),
        findConversationTenant: async () => ({ tenantId: "tenant-b", conversationMode: "AI_ACTIVE" }),
      },
    });
    await expect(sendTenantWhatsAppMessage({ tenantId: "tenant-a", conversationId: "conversation-b", recipient: "919999999999", message: { type: "text", text: "Hi" } }, wrongConversation)).rejects.toThrow("does not belong");
    expect(wrongConversation.tokenResolutions).toHaveLength(0);
    expect(wrongConversation.sent).toHaveLength(0);

    const legacy = dependencies({
      repository: {
        findConnectionForTenant: async (tenantId) => ({ tenant_id: tenantId, connection_status: "connected", crm_data_isolation_status: "legacy_shared", phone_number_id: "phone-a", access_token_secret_ref: "secret-ref" }),
        findConversationTenant: async () => ({ tenantId: "tenant-a", conversationMode: "AI_ACTIVE" }),
      },
    });
    await expect(sendTenantWhatsAppMessage({ tenantId: "tenant-a", conversationId: "conversation-a", recipient: "919999999999", message: { type: "text", text: "Hi" } }, legacy)).resolves.toMatchObject({ providerMessageId: "wamid.test" });
    expect(legacy.tokenResolutions).toEqual(["secret-ref"]);
    expect(legacy.sent).toHaveLength(1);
  });

  test("blocks automated sends in HUMAN_ACTIVE conversations before credential lookup", async () => {
    const humanActive = dependencies({
      repository: {
        findConnectionForTenant: async (tenantId) => ({ tenant_id: tenantId, connection_status: "connected", crm_data_isolation_status: "isolated", phone_number_id: "phone-a", access_token_secret_ref: "secret-ref" }),
        findConversationTenant: async () => ({ tenantId: "tenant-a", conversationMode: "HUMAN_ACTIVE" }),
      },
    });
    await expect(sendTenantWhatsAppMessage({ tenantId: "tenant-a", conversationId: "conversation-a", recipient: "919999999999", message: { type: "text", text: "automated" } }, humanActive)).rejects.toThrow("Automated WhatsApp sends are disabled");
    expect(humanActive.tokenResolutions).toHaveLength(0);
    expect(humanActive.sent).toHaveLength(0);
  });
});