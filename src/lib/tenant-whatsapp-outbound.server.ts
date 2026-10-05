import { sendWhatsAppMessage } from "./whatsapp-outbound.server";
import { MetaWhatsAppProvider } from "./meta-whatsapp-provider.server";
import type { SendWhatsAppMessageInput, WhatsAppProvider, WhatsAppProviderResult } from "./whatsapp-provider.server";
import type { OutboundCaller } from "./whatsapp-outbound.server";

export type TenantWhatsAppConnectionRecord = {
  tenant_id: string;
  connection_status: string;
  crm_data_isolation_status: string;
  phone_number_id: string | null;
  access_token_secret_ref: string | null;
};

export type TenantWhatsAppOutboundRepository = {
  findConnectionForTenant(tenantId: string): Promise<TenantWhatsAppConnectionRecord | null>;
  findConversationTenant(conversationId: string): Promise<{ tenantId: string | null; conversationMode: string } | null>;
};

export type WhatsAppCredentialResolver = {
  resolveAccessToken(secretReference: string): Promise<string | null>;
};

export type TenantWhatsAppOutboundDependencies = {
  repository: TenantWhatsAppOutboundRepository;
  credentials: WhatsAppCredentialResolver;
  send?: (input: SendWhatsAppMessageInput, provider: WhatsAppProvider) => Promise<WhatsAppProviderResult>;
};

export type TenantWhatsAppOutboundInput = {
  tenantId: string;
  conversationId: string;
  recipient: string;
  message: SendWhatsAppMessageInput["payload"];
  caller?: OutboundCaller;
};

/**
 * Connection-backed send boundary. Credentials are resolved server-side from
 * a secret reference; the database never stores or returns the access token.
 */
export async function sendTenantWhatsAppMessage(
  input: TenantWhatsAppOutboundInput,
  dependencies: TenantWhatsAppOutboundDependencies,
): Promise<WhatsAppProviderResult> {
  const connection = await dependencies.repository.findConnectionForTenant(input.tenantId);
  if (!connection || connection.tenant_id !== input.tenantId || connection.connection_status !== "connected") {
    throw new Error("No active WhatsApp connection is available for this CRM tenant");
  }
  if (!connection.phone_number_id || !connection.access_token_secret_ref) {
    throw new Error("WhatsApp connection is missing server-side Meta configuration");
  }
  const conversation = await dependencies.repository.findConversationTenant(input.conversationId);
  if (!conversation?.tenantId || conversation.tenantId !== input.tenantId) {
    throw new Error("WhatsApp conversation does not belong to the requested CRM tenant");
  }
  if (conversation.conversationMode === "HUMAN_ACTIVE" && input.caller !== "HUMAN") {
    throw new Error("Automated WhatsApp sends are disabled for HUMAN_ACTIVE conversations");
  }

  const accessToken = await dependencies.credentials.resolveAccessToken(connection.access_token_secret_ref);
  if (!accessToken) throw new Error("WhatsApp server-side credential reference could not be resolved");

  const send = dependencies.send ?? (async (message, provider) => {
    const result = await sendWhatsAppMessage({ ...message, caller: input.caller ?? "SYSTEM" }, { provider });
    return result.provider;
  });
  const provider = new MetaWhatsAppProvider({
    accessToken,
    phoneNumberId: connection.phone_number_id,
  });
  return send({
    conversationId: input.conversationId,
    recipientPhone: input.recipient,
    payload: input.message,
  }, provider);
}
