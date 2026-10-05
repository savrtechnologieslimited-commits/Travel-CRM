export interface WhatsAppIdentityFields {
  phone: string;
  waUserId: string | null;
  waParentUserId: string | null;
  waUsername: string | null;
  name: string;
}

export interface WhatsAppIdentityMessage {
  from?: string | null;
  from_user_id?: string | null;
  from_parent_user_id?: string | null;
}

export interface WhatsAppIdentityContact {
  wa_id?: string | null;
  user_id?: string | null;
  parent_user_id?: string | null;
  profile?: { name?: string | null; username?: string | null } | null;
}

const BSUID_PATTERN = /^[A-Za-z]{2}\.(?:ENT\.)?[A-Za-z0-9]{4,}$/;

export function normalizeWhatsAppIdentityPhone(value: string | null | undefined): string {
  const digits = (value ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return `91${digits.slice(1)}`;
  return digits;
}

export function isBusinessScopedUserId(value: string | null | undefined): boolean {
  return Boolean(value && BSUID_PATTERN.test(value.trim()));
}

function cleanUserId(value: string | null | undefined): string | null {
  const cleaned = value?.trim();
  return isBusinessScopedUserId(cleaned) ? cleaned! : null;
}

function cleanUsername(value: string | null | undefined): string | null {
  const cleaned = value?.trim().replace(/^@/, "");
  return cleaned || null;
}

export function resolveInboundIdentity(
  message: WhatsAppIdentityMessage,
  contact?: WhatsAppIdentityContact | null,
): WhatsAppIdentityFields {
  return {
    phone: normalizeWhatsAppIdentityPhone(message.from ?? contact?.wa_id),
    waUserId: cleanUserId(message.from_user_id) ?? cleanUserId(contact?.user_id),
    waParentUserId: cleanUserId(message.from_parent_user_id) ?? cleanUserId(contact?.parent_user_id),
    waUsername: cleanUsername(contact?.profile?.username),
    name: contact?.profile?.name?.trim() ?? "",
  };
}

export function hasUsableIdentity(identity: WhatsAppIdentityFields): boolean {
  return Boolean(identity.phone || identity.waUserId);
}

export function identityDisplayName(identity: WhatsAppIdentityFields): string {
  return identity.name || identity.waUsername || identity.phone || identity.waUserId || "WhatsApp customer";
}

export function contactHandle(contact: {
  phone?: string | null;
  wa_username?: string | null;
  wa_user_id?: string | null;
}): string {
  if (contact.phone?.trim()) return contact.phone;
  if (contact.wa_username?.trim()) return `@${contact.wa_username.trim()}`;
  return contact.wa_user_id?.trim() ?? "";
}

export function resolveContactSendTarget(contact: {
  phone?: string | null;
  wa_user_id?: string | null;
} | null | undefined): { target: string; isPhone: boolean } | null {
  const phone = normalizeWhatsAppIdentityPhone(contact?.phone);
  if (phone && /^\d{8,15}$/.test(phone)) return { target: phone, isPhone: true };
  const waUserId = cleanUserId(contact?.wa_user_id);
  return waUserId ? { target: waUserId, isPhone: false } : null;
}
