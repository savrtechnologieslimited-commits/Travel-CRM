import { createHmac, randomUUID } from "node:crypto";

type WacrmBridgeClaims = {
  version: 1;
  purpose: "signin" | "contact-match";
  audience: string;
  crmUserId: string;
  email: string;
  fullName: string;
  issuer: string;
  record?: {
    type: "lead" | "customer";
    id: string;
    email: string | null;
    phones: string[];
  };
  issuedAt: number;
  expiresAt: number;
  nonce: string;
};

type BridgeTokenInput = {
  crmUserId: string;
  email: string;
  fullName: string;
  issuer: string;
  audience: string;
};

export function createWacrmBridgeToken(input: BridgeTokenInput): string {
  return signBridgeToken({ ...input, purpose: "signin" });
}

export function createWacrmContactMatchToken(
  input: BridgeTokenInput & {
    record: WacrmBridgeClaims["record"];
  },
): string {
  if (!input.record) throw new Error("A CRM record is required for matching.");
  return signBridgeToken({ ...input, purpose: "contact-match" });
}

function signBridgeToken(
  input: BridgeTokenInput & {
    purpose: WacrmBridgeClaims["purpose"];
    record?: WacrmBridgeClaims["record"];
  },
): string {
  const secret = process.env["WACRM_BRIDGE_SECRET"]?.trim();
  if (!secret || Buffer.byteLength(secret) < 32) {
    throw new Error("WACRM_BRIDGE_SECRET must contain at least 32 bytes.");
  }

  const issuedAt = Math.floor(Date.now() / 1000);
  const claims: WacrmBridgeClaims = {
    version: 1,
    purpose: input.purpose,
    audience: input.audience,
    crmUserId: input.crmUserId,
    email: input.email,
    fullName: input.fullName,
    issuer: input.issuer,
    ...(input.record ? { record: input.record } : {}),
    issuedAt,
    expiresAt: issuedAt + 60,
    nonce: randomUUID(),
  };
  const encodedClaims = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const signature = createHmac("sha256", secret).update(encodedClaims).digest("base64url");

  return `${encodedClaims}.${signature}`;
}
