/*
 * Adapted from WACRM's src/lib/whatsapp/webhook-signature.ts.
 * Copyright (c) 2026 Arnas Donauskas — MIT License (see WACRM LICENSE).
 * Uses Web Crypto instead of Node crypto so this verifier works in Deno
 * Supabase Edge Functions and Bun tests.
 */

export function parseAppSecrets(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((secret) => secret.trim())
    .filter((secret) => secret.length > 0);
}

function decodeHex(hex: string): Uint8Array | null {
  if (!/^(?:[0-9a-f]{2})+$/i.test(hex)) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index]! ^ right[index]!;
  }
  return difference === 0;
}

async function signatureMatches(
  rawBody: string,
  suppliedDigest: Uint8Array,
  secret: string,
): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody)),
  );
  return constantTimeEqual(digest, suppliedDigest);
}

/** Validate Meta's x-hub-signature-256 header; missing secrets fail closed. */
export async function verifyMetaWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  rawSecrets: string | undefined,
): Promise<boolean> {
  const secrets = parseAppSecrets(rawSecrets);
  if (secrets.length === 0 || !signatureHeader) return false;
  const match = /^sha256=([0-9a-f]{64})$/i.exec(signatureHeader);
  if (!match?.[1]) return false;
  const digest = decodeHex(match[1]);
  if (!digest) return false;

  let valid = false;
  for (const secret of secrets) {
    valid = (await signatureMatches(rawBody, digest, secret)) || valid;
  }
  return valid;
}
