import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/userinfo.email",
] as const;

export type GmailStatus = "connected" | "disconnected" | "error";

export type GmailOAuthConfig = {
  clientId: string;
  redirectUri: string;
  state: string;
  scopes?: readonly string[];
  loginHint?: string | undefined;
};

export type GmailConnectionRow = {
  id?: string;
  user_id?: string | null;
  google_email?: string | null;
  provider?: string | null;
  status?: GmailStatus | null;
  scopes?: string | null;
  access_token?: string | null;
  refresh_token?: string | null;
  connected_at?: string | null;
  updated_at?: string | null;
};

export type GmailInboxItem = {
  id: string;
  threadId: string | null;
  messageId: string | null;
  fromEmail: string | null;
  fromName: string | null;
  toEmail: string | null;
  toName: string | null;
  subject: string;
  preview: string;
  receivedAt: string;
  unread: boolean;
  rawBody: string;
  bodyText: string;
  bodyHtml: string | null;
};

type GmailMimePart = {
  body?: { data?: string | null; mimeType?: string | null } | null;
  parts?: GmailMimePart[] | null;
  mimeType?: string | null;
};

type GmailPayload = {
  headers?: Array<{ name: string; value: string }> | null;
  body?: { data?: string | null; mimeType?: string | null } | null;
  parts?: GmailMimePart[] | null;
} | null;

export type GmailThread = {
  id: string;
  historyId?: string;
  messages: GmailInboxItem[];
};

export type EmailCustomerCandidate = {
  full_name: string | null;
  email: string | null;
  phone: string | null;
  source: "gmail";
};

export function validateGoogleOAuthState(state: string | null | undefined): string {
  if (!state) throw new Error("Google OAuth state is required");
  const trimmed = state.trim();
  if (!/^[A-Za-z0-9_-]{16,256}$/.test(trimmed)) {
    throw new Error("Google OAuth state is invalid");
  }
  return trimmed;
}

export function buildGoogleOAuthUrl({
  clientId,
  redirectUri,
  state,
  scopes = GMAIL_SCOPES,
  loginHint,
}: GmailOAuthConfig) {
  const validatedState = validateGoogleOAuthState(state);
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", scopes.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", validatedState);
  if (loginHint) url.searchParams.set("login_hint", loginHint);
  return url.toString();
}

export function redactGoogleSecret(value?: string | null) {
  return value ? "[redacted]" : null;
}

export async function upsertGmailConnectionForUser({
  userId,
  googleEmail,
  refreshToken,
  accessToken,
  scopes,
  status,
  client = supabaseAdmin,
}: {
  userId: string;
  googleEmail: string;
  refreshToken?: string | null;
  accessToken?: string | null;
  scopes?: readonly string[] | string | null;
  status?: GmailStatus;
  client?: any;
}) {
  if (!userId) throw new Error("Authenticated user is required");
  if (!googleEmail?.trim()) throw new Error("Google account email is required");
  if (!refreshToken) throw new Error("Google refresh token is required");

  const normalizedScopes =
    typeof scopes === "string"
      ? scopes.trim() || GMAIL_SCOPES.join(" ")
      : Array.isArray(scopes)
        ? scopes.join(" ")
        : GMAIL_SCOPES.join(" ");

  const now = new Date().toISOString();
  const row = {
    user_id: userId,
    provider: "gmail",
    google_email: googleEmail.trim().toLowerCase(),
    status: status ?? "connected",
    scopes: normalizedScopes,
    access_token: accessToken ?? null,
    refresh_token: refreshToken,
    updated_at: now,
    connected_at: now,
  };

  if (typeof client?.from === "function") {
    const table = client.from("gmail_connections") as any;
    const existingResult = await (async () => {
      if (typeof table.select === "function") {
        const selected = table.select("*").eq("user_id", userId).eq("provider", "gmail");
        if (typeof selected.maybeSingle === "function") return await selected.maybeSingle();
        if (typeof selected.single === "function") return await selected.single();
      }
      return { data: null, error: null };
    })();

    if (existingResult?.error && existingResult.error.code !== "PGRST116") {
      throw new Error("Could not load existing Gmail connection");
    }

    const payload = { ...row, ...(existingResult?.data?.id ? { id: existingResult.data.id } : {}) };
    const { data, error } = await table
      .upsert(payload, { onConflict: "user_id,provider" })
      .select();
    if (error) throw new Error("Unable to save Gmail connection");
    const saved = Array.isArray(data) ? data[0] : (data ?? payload);
    return latestGmailConnection(saved as GmailConnectionRow);
  }

  if (typeof client?.upsert === "function") {
    const { data, error } = await client.upsert(row, { onConflict: "user_id,provider" });
    if (error) throw new Error("Unable to save Gmail connection");
    const saved = Array.isArray(data) ? data[0] : (data ?? row);
    return latestGmailConnection(saved as GmailConnectionRow);
  }

  throw new Error("Google connection storage is unavailable");
}

export async function disconnectGmailConnectionForUser({
  userId,
  client = supabaseAdmin,
}: {
  userId: string;
  client?: any;
}) {
  if (!userId) throw new Error("Authenticated user is required");

  if (typeof client?.from === "function") {
    const table = client.from("gmail_connections") as any;
    const { error } = await table.delete().eq("user_id", userId).eq("provider", "gmail");
    if (error) throw new Error("Unable to disconnect Gmail account");
    return true;
  }

  if (typeof client?.delete === "function") {
    const { error } = await client.delete().eq("user_id", userId).eq("provider", "gmail");
    if (error) throw new Error("Unable to disconnect Gmail account");
    return true;
  }

  throw new Error("Google connection removal is unavailable");
}

async function fetchGmailApi<T>({
  userId,
  path,
  searchParams,
  method = "GET",
}: {
  userId: string;
  path: string;
  searchParams?: Record<string, string>;
  method?: string;
}) {
  const { data: connectionRow, error } = await (supabaseAdmin as any)
    .from("gmail_connections")
    .select("*")
    .eq("user_id", userId)
    .eq("provider", "gmail")
    .maybeSingle();

  if (error && error.code !== "PGRST116") {
    throw new Error("Unable to load the Gmail connection");
  }

  const gmailConnection = connectionRow as { access_token?: string | null } | null;
  if (!gmailConnection || !gmailConnection.access_token) {
    throw new Error("Gmail is not connected");
  }

  const url = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`);
  Object.entries(searchParams ?? {}).forEach(([key, value]) => {
    if (value) url.searchParams.set(key, value);
  });

  const response = await fetch(url.toString(), {
    method,
    headers: {
      Authorization: `Bearer ${gmailConnection.access_token}`,
      "Content-Type": "application/json",
    },
  });

  if (response.status === 401 || response.status === 403) {
    await (supabaseAdmin as any)
      .from("gmail_connections")
      .update({
        status: "error",
        access_token: null,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .eq("provider", "gmail");
    throw new Error("Gmail authorization expired or invalid");
  }

  if (!response.ok) {
    throw new Error("Gmail API request failed");
  }

  return (await response.json()) as T;
}

export const fetchGmailInbox = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { maxResults?: number; pageToken?: string; query?: string }) => data)
  .handler(async ({ data, context }) => {
    const userId = context?.userId ?? (context as any)?.supabase?.auth?.user?.id;
    if (!userId) throw new Error("Authenticated user is required");

    const maxResults = Math.min(Math.max(data.maxResults ?? 20, 1), 50);
    const response = await fetchGmailApi<{
      messages?: Array<{
        id: string;
        threadId?: string;
        snippet?: string;
        labelIds?: string[];
        internalDate?: string;
      }>;
      nextPageToken?: string;
      resultSizeEstimate?: number;
    }>({
      userId,
      path: "messages",
      searchParams: {
        labelIds: "INBOX",
        maxResults: String(maxResults),
        pageToken: data.pageToken ?? "",
        q: data.query ?? "",
        includeSpamTrash: "false",
        format: "metadata",
        metadataHeaders: "From,To,Subject,Date",
      },
    });

    const messages = await Promise.all(
      (response.messages ?? []).map(async (message) => {
        const detail = await fetchGmailApi<any>({
          userId,
          path: `messages/${encodeURIComponent(message.id)}`,
          searchParams: { format: "full" },
        });
        return normalizeGmailMessage(detail);
      }),
    );

    return {
      messages: messages.sort(
        (a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime(),
      ),
      nextPageToken: response.nextPageToken ?? null,
      resultSizeEstimate: response.resultSizeEstimate ?? null,
    };
  });

export const fetchGmailThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { threadId: string }) => data)
  .handler(async ({ data, context }) => {
    const userId = context?.userId ?? (context as any)?.supabase?.auth?.user?.id;
    if (!userId) throw new Error("Authenticated user is required");

    const response = await fetchGmailApi<{ id: string; messages?: Array<any> }>({
      userId,
      path: `threads/${encodeURIComponent(data.threadId)}`,
      searchParams: { format: "full" },
    });

    return { thread: normalizeGmailThread(response) };
  });

export async function handleGoogleOAuthCallback({
  userId,
  error,
  state,
  code,
  redirectUri,
  clientId,
  clientSecret,
  fetcher = async (input: string, init?: RequestInit) => fetch(input, init),
  profileFetcher = async (accessToken: string) =>
    fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }),
  connectionStore,
}: {
  userId: string;
  error?: string | null;
  state?: string | null;
  code?: string | null;
  redirectUri: string;
  clientId?: string;
  clientSecret?: string;
  fetcher?: (input: string, init?: RequestInit) => Promise<Response>;
  profileFetcher?: (accessToken: string) => Promise<Response>;
  connectionStore?: any;
}) {
  if (error) {
    const normalizedError = String(error).toLowerCase();
    if (
      ["access_denied", "cancelled", "user_cancelled", "user_cancelled_login"].includes(
        normalizedError,
      )
    ) {
      throw new Error("Google OAuth was cancelled");
    }
    throw new Error("Google OAuth failed");
  }

  const validatedState = validateGoogleOAuthState(state);
  if (!code) throw new Error("Google authorization code is missing");

  const googleClientId = clientId ?? process.env["GOOGLE_CLIENT_ID"] ?? "";
  const googleClientSecret = clientSecret ?? process.env["GOOGLE_CLIENT_SECRET"] ?? "";
  if (!googleClientId || !googleClientSecret) {
    throw new Error("Google OAuth environment variables are not configured");
  }

  const exchangeResponse = await fetcher("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: googleClientId,
      client_secret: googleClientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }).toString(),
  });

  if (!exchangeResponse.ok) {
    const bodyText = await exchangeResponse.text();
    throw new Error(
      bodyText ? "Google OAuth token exchange failed" : "Google OAuth token exchange failed",
    );
  }

  const tokenData = (await exchangeResponse.json()) as {
    access_token?: string;
    refresh_token?: string;
    scope?: string;
    expires_in?: number;
  };

  if (!tokenData.access_token) throw new Error("Google OAuth access token is missing");
  if (!tokenData.refresh_token) throw new Error("Google refresh token is missing");

  const profileResponse = await profileFetcher(tokenData.access_token);
  if (!profileResponse.ok) {
    throw new Error(
      `Unable to load the connected Google account (HTTP ${profileResponse.status}). Reconnect and approve access to your account email address.`,
    );
  }

  const profile = (await profileResponse.json()) as { email?: string; emailAddress?: string };
  const googleEmail = profile.email ?? profile.emailAddress;
  if (!googleEmail) throw new Error("Connected Google account email not available");

  const connection = await upsertGmailConnectionForUser({
    userId,
    googleEmail,
    refreshToken: tokenData.refresh_token,
    accessToken: tokenData.access_token,
    scopes: tokenData.scope ? tokenData.scope.split(" ") : GMAIL_SCOPES,
    status: "connected",
    client: connectionStore ?? supabaseAdmin,
  });

  if (!connection) throw new Error("Unable to persist the Gmail connection");
  return { ok: true, connection, state: validatedState };
}

export const startGmailOAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { redirectUri?: string; loginHint?: string }) => data)
  .handler(async ({ data, context }) => {
    const userId = context?.userId ?? (context as any)?.supabase?.auth?.user?.id;
    if (!userId) throw new Error("Authenticated user is required");

    const redirectUri =
      data.redirectUri ??
      process.env["GOOGLE_REDIRECT_URI"] ??
      "http://localhost:3000/gmail/oauth/callback";
    const state = crypto.randomUUID().replace(/-/g, "");
    const url = buildGoogleOAuthUrl({
      clientId: process.env["GOOGLE_CLIENT_ID"] ?? "",
      redirectUri,
      state,
      scopes: GMAIL_SCOPES,
      ...(data.loginHint ? { loginHint: data.loginHint } : {}),
    });

    if (!process.env["GOOGLE_CLIENT_ID"]) {
      throw new Error("Google OAuth client ID is not configured");
    }

    return { ok: true, url, state };
  });

export const completeGmailOAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (data: { code?: string; state?: string; redirectUri?: string; error?: string }) => data,
  )
  .handler(async ({ data, context }) => {
    const userId = context?.userId ?? (context as any)?.supabase?.auth?.user?.id;
    if (!userId) throw new Error("Authenticated user is required");

    const redirectUri =
      data.redirectUri ??
      process.env["GOOGLE_REDIRECT_URI"] ??
      "http://localhost:3000/gmail/oauth/callback";
    const result = await handleGoogleOAuthCallback({
      userId,
      error: data.error ?? null,
      state: data.state ?? null,
      code: data.code ?? null,
      redirectUri,
      ...(process.env["GOOGLE_CLIENT_ID"] ? { clientId: process.env["GOOGLE_CLIENT_ID"] } : {}),
      ...(process.env["GOOGLE_CLIENT_SECRET"]
        ? { clientSecret: process.env["GOOGLE_CLIENT_SECRET"] }
        : {}),
    });
    return result;
  });

export const disconnectGmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const userId = context?.userId ?? (context as any)?.supabase?.auth?.user?.id;
    if (!userId) throw new Error("Authenticated user is required");
    await disconnectGmailConnectionForUser({ userId });
    return { ok: true };
  });

export function emailDisplayName(from: string | null | undefined) {
  if (!from) return null;
  const match = from.match(/^([^<]+?)\s*<([^>]+)>$/);
  if (match) {
    const name = match[1]?.trim();
    const email = match[2]?.trim();
    return name || email || null;
  }
  return from.trim();
}

export function extractEmailAddress(value: string | null | undefined) {
  if (!value) return null;
  const match = value.match(/<([^>]+)>/);
  if (match?.[1]) return match[1].trim().toLowerCase();
  return value.trim().toLowerCase();
}

export function normalizePhoneNumber(value: string | null | undefined) {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  return digits.length >= 10 ? digits : null;
}

function decodeBase64Url(input?: string | null) {
  if (!input) return "";
  const cleaned = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = cleaned.padEnd(Math.ceil(cleaned.length / 4) * 4, "=");
  const binary = atob(padded);
  return decodeURIComponent(
    Array.from(binary)
      .map((char) => `%${char.charCodeAt(0).toString(16).padStart(2, "0")}`)
      .join(""),
  );
}

function gmailTextPreview(value: string) {
  return value
    .replace(/<(style|script)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;|&#39;|&apos;/gi, '"')
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

function containsHtmlDocument(value: string) {
  return /<!doctype\s+html|<html\b|<body\b|<table\b|<div\b|<p\b/i.test(value);
}

function extractHeaders(
  payload?: { headers?: Array<{ name: string; value: string }> | null } | null,
) {
  const headers = payload?.headers ?? [];
  return Object.fromEntries(headers.map((header) => [header.name, header.value]));
}

function extractBodyFromPayload(payload?: GmailPayload) {
  const stack = [...(payload?.parts ?? [])];
  const candidates: Array<{ text: string; mimeType: string }> = [];
  if (payload?.body?.data) {
    candidates.push({
      text: decodeBase64Url(payload.body.data),
      mimeType: payload.body.mimeType ?? "text/plain",
    });
  }
  while (stack.length) {
    const part = stack.shift();
    if (!part) continue;
    if (part.body?.data) {
      candidates.push({
        text: decodeBase64Url(part.body.data),
        mimeType: part.mimeType ?? part.body.mimeType ?? "text/plain",
      });
    }
    if (part.parts) stack.push(...part.parts);
  }

  return (
    candidates.find((candidate) => candidate.mimeType.toLowerCase() === "text/html") ??
    candidates.find((candidate) => candidate.mimeType.toLowerCase() === "text/plain") ??
    candidates[0] ?? { text: "", mimeType: "text/plain" }
  );
}

export function normalizeGmailMessage(message: {
  id?: string | null;
  threadId?: string | null;
  snippet?: string | null;
  internalDate?: string | null;
  labelIds?: string[] | null;
  payload?: GmailPayload;
}) {
  const headers = extractHeaders(message.payload);
  const body = extractBodyFromPayload(message.payload);
  const rawBody = body.text || message.snippet || "";
  const fromHeader = headers["From"] ?? headers["from"] ?? "";
  const toHeader = headers["To"] ?? headers["to"] ?? "";
  const subject = headers["Subject"] ?? headers["subject"] ?? "(no subject)";
  const dateHeader = headers["Date"] ?? headers["date"] ?? null;
  const receivedAt = dateHeader
    ? new Date(dateHeader).toISOString()
    : message.internalDate
      ? new Date(Number(message.internalDate)).toISOString()
      : new Date().toISOString();

  return {
    id: message.id ?? crypto.randomUUID(),
    threadId: message.threadId ?? null,
    messageId: message.id ?? null,
    fromEmail: extractEmailAddress(fromHeader),
    fromName: emailDisplayName(fromHeader),
    toEmail: extractEmailAddress(toHeader),
    toName: emailDisplayName(toHeader),
    subject,
    preview: gmailTextPreview(message.snippet || rawBody),
    receivedAt,
    unread: Boolean(message.labelIds?.includes("UNREAD")),
    rawBody,
    bodyText: rawBody,
    bodyHtml:
      body.mimeType.toLowerCase().includes("html") || containsHtmlDocument(rawBody)
        ? rawBody
        : null,
  } satisfies GmailInboxItem;
}

export function normalizeGmailThread(thread: {
  id?: string | null;
  historyId?: string | null;
  messages?: Array<{
    id?: string | null;
    threadId?: string | null;
    snippet?: string | null;
    internalDate?: string | null;
    labelIds?: string[] | null;
    payload?: {
      headers?: Array<{ name: string; value: string }> | null;
      body?: { data?: string | null; mimeType?: string | null } | null;
      parts?: Array<{
        body?: { data?: string | null; mimeType?: string | null } | null;
        parts?: Array<{ body?: { data?: string | null; mimeType?: string | null } | null }> | null;
        mimeType?: string | null;
      }> | null;
    } | null;
  }> | null;
}) {
  const messages = (thread.messages ?? [])
    .map((message) => normalizeGmailMessage(message))
    .sort((a, b) => new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime());

  return {
    id: thread.id ?? crypto.randomUUID(),
    historyId: thread.historyId ?? "",
    messages,
  } satisfies GmailThread;
}

export function buildReplyPayload({
  threadId,
  messageId,
  to,
  from,
  subject,
  body,
  inReplyTo,
  references,
}: {
  threadId: string;
  messageId: string;
  to: string;
  from: string;
  subject: string;
  body: string;
  inReplyTo?: string | null;
  references?: string[] | null;
}) {
  const normalizedBody = body.replace(/\r\n/g, "\n");
  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject.startsWith("Re:") ? subject : `Re: ${subject}`}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset=UTF-8`,
    `Content-Transfer-Encoding: base64`,
    ...(inReplyTo ? [`In-Reply-To: ${inReplyTo}`] : []),
    ...(references && references.length ? [`References: ${references.join(" ")}`] : []),
    "",
  ].join("\r\n");

  const raw = `${headers}\r\n${btoa(unescape(encodeURIComponent(normalizedBody)))}`;

  return {
    threadId,
    messageId,
    raw: btoa(unescape(encodeURIComponent(raw)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, ""),
    payload: {
      threadId,
      raw,
      headers: {
        from,
        to,
        subject: subject.startsWith("Re:") ? subject : `Re: ${subject}`,
        "In-Reply-To": inReplyTo ?? undefined,
        References: references?.join(" ") ?? undefined,
      },
    },
  };
}

export function detectDuplicateCustomer(
  customers: Array<{ email?: string | null; mobile?: string | null; whatsapp?: string | null }>,
  candidate: { email?: string | null; phone?: string | null },
) {
  const normalizedEmail = candidate.email?.trim().toLowerCase() ?? null;
  const normalizedPhone = normalizePhoneNumber(candidate.phone ?? "");
  return (
    customers.find((customer) => {
      if (normalizedEmail && customer.email?.trim().toLowerCase() === normalizedEmail) return true;
      if (normalizedPhone) {
        const customerPhone = normalizePhoneNumber(customer.mobile ?? customer.whatsapp ?? "");
        if (customerPhone && customerPhone === normalizedPhone) return true;
      }
      return false;
    }) ?? null
  );
}

export function mapEmailToEnquiryCandidate(data: {
  senderName?: string | null;
  senderEmail?: string | null;
  phone?: string | null;
  subject?: string | null;
  messageBody?: string | null;
}) {
  const fullName =
    data.senderName?.trim() || extractEmailAddress(data.senderEmail) || "Email enquiry";
  const email = extractEmailAddress(data.senderEmail);
  const phone = normalizePhoneNumber(data.phone ?? "");
  return {
    customer_name: fullName,
    customer_email: email,
    phone,
    source: "google" as const,
    status: "new" as const,
    notes: [
      data.subject ? `Subject: ${data.subject}` : null,
      data.messageBody
        ? `Email preview: ${data.messageBody.replace(/\s+/g, " ").trim().slice(0, 240)}`
        : null,
    ]
      .filter(Boolean)
      .join(" | "),
  };
}

export function latestGmailConnection(connection?: GmailConnectionRow | null) {
  if (!connection) return null;
  return {
    provider: "gmail",
    google_email: connection.google_email ?? null,
    status: connection.status ?? "disconnected",
    scopes: (connection.scopes ?? GMAIL_SCOPES.join(",")).split(",").filter(Boolean),
    connected_at: connection.connected_at ?? null,
    updated_at: connection.updated_at ?? null,
    refresh_token: redactGoogleSecret(connection.refresh_token),
    access_token: redactGoogleSecret(connection.access_token),
  };
}

export function gmailAccountLabel(connection?: GmailConnectionRow | null) {
  const latest = latestGmailConnection(connection);
  return latest?.google_email ?? "Not connected";
}
