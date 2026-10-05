import { createMiddleware, createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/userinfo.email",
] as const;

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

function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

function createSupabaseFetch(supabaseKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );

    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }

    if (
      isNewSupabaseApiKey(supabaseKey) &&
      headers.get("Authorization") === `Bearer ${supabaseKey}`
    ) {
      headers.delete("Authorization");
    }

    headers.set("apikey", supabaseKey);
    return fetch(input, { ...init, headers });
  };
}

export const requireSupabaseAuth = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const { getRequest } = await import("@tanstack/react-start/server");
    const request = getRequest();

    if (!request?.headers) {
      throw new Error("Unauthorized: No request headers available");
    }

    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      throw new Error("Unauthorized: No authorization header provided");
    }

    if (!authHeader.startsWith("Bearer ")) {
      throw new Error("Unauthorized: Only Bearer tokens are supported");
    }

    const token = authHeader.replace("Bearer ", "");
    if (!token) {
      throw new Error("Unauthorized: No token provided");
    }

    if (token.split(".").length !== 3) {
      throw new Error("Unauthorized: Invalid token");
    }

    const SUPABASE_URL = process.env["SUPABASE_URL"];
    const SUPABASE_PUBLISHABLE_KEY = process.env["SUPABASE_PUBLISHABLE_KEY"];

    if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
      throw new Error(
        "Missing Supabase environment variable(s): SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY",
      );
    }

    const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      global: {
        fetch: createSupabaseFetch(SUPABASE_PUBLISHABLE_KEY),
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
      auth: {
        storage: undefined,
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const { data, error } = await supabase.auth.getClaims(token);
    if (error || !data?.claims) {
      throw new Error("Unauthorized: Invalid token");
    }

    if (!data.claims.sub) {
      throw new Error("Unauthorized: No user ID found in token");
    }

    return next({
      context: {
        supabase,
        userId: data.claims.sub,
        claims: data.claims,
      },
    });
  },
);

async function getSupabaseAdminClient() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

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
}: {
  clientId: string;
  redirectUri: string;
  state: string;
  scopes?: readonly string[];
  loginHint?: string;
}) {
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

export function sanitizeGmailHtml(value: string | null | undefined) {
  if (!value) return "";
  let safe = value
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/<object[\s\S]*?<\/object>/gi, "")
    .replace(/<embed[^>]*>/gi, "")
    .replace(/<link[^>]*>/gi, "")
    .replace(/<base[^>]*>/gi, "")
    .replace(/@import\s+[^;]+;?/gi, "")
    .replace(/expression\s*\([^)]*\)/gi, "")
    .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");

  safe = safe
    .replace(
      /\s+(href|src|xlink:href)\s*=\s*(["'])\s*(?:javascript:|vbscript:|data:text\/html)[\s\S]*?\2/gi,
      ' $1="#"',
    )
    .replace(
      /\s+(href|src|xlink:href)\s*=\s*(?:javascript:|vbscript:|data:text\/html)[^\s>]*/gi,
      ' $1="#"',
    );
  safe = safe.replace(
    /<\/?(svg|math|form|input|button|textarea|select|option|meta|embed|object|iframe|script)[^>]*>/gi,
    "",
  );

  return safe;
}

export function decodeGmailBase64(value?: string | null) {
  if (!value) return "";
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  try {
    const binary = atob(padded);
    const text = Array.from(binary)
      .map((char) => `%${char.charCodeAt(0).toString(16).padStart(2, "0")}`)
      .join("");
    return decodeURIComponent(text);
  } catch {
    return normalized;
  }
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

export function parseGmailSender(raw?: string | null) {
  if (!raw) return { name: null, email: null };
  const match = raw.match(/^(.+?)\s*<([^>]+)>$/);
  if (match) {
    return {
      name: match[1]?.trim() || null,
      email: match[2]?.trim().toLowerCase() || null,
    };
  }
  const trimmed = raw.trim();
  return {
    name: null,
    email: trimmed.includes("@") ? trimmed.toLowerCase() : null,
  };
}

export function normalizeGmailMessage(message: {
  id?: string | null;
  threadId?: string | null;
  snippet?: string | null;
  internalDate?: string | null;
  labelIds?: string[] | null;
  payload?: GmailPayload;
}) {
  const headers = Object.fromEntries(
    (message.payload?.headers ?? []).map((header) => [header.name, header.value]),
  );
  const body = message.payload?.body ?? null;
  const stack = [...(message.payload?.parts ?? [])];
  const candidates: Array<{ text: string; mimeType: string }> = [];
  if (body?.data) {
    candidates.push({
      text: decodeGmailBase64(body.data),
      mimeType: body.mimeType ?? "text/plain",
    });
  }
  while (stack.length) {
    const part = stack.shift();
    if (!part) continue;
    if (part.body?.data) {
      candidates.push({
        text: decodeGmailBase64(part.body.data),
        mimeType: part.mimeType ?? part.body.mimeType ?? "text/plain",
      });
    }
    if (part.parts) stack.push(...part.parts);
  }
  const selectedBody = candidates.find(
    (candidate) => candidate.mimeType.toLowerCase() === "text/html",
  ) ??
    candidates.find((candidate) => candidate.mimeType.toLowerCase() === "text/plain") ??
    candidates[0] ?? { text: "", mimeType: "text/plain" };
  const bodyText = selectedBody.text;
  const mimeType = selectedBody.mimeType;

  const sender = parseGmailSender(headers["From"] ?? headers["from"] ?? "");
  const recipient = parseGmailSender(headers["To"] ?? headers["to"] ?? "");
  const subject = headers["Subject"] ?? headers["subject"] ?? "(no subject)";
  const receivedAt = message.internalDate
    ? new Date(Number(message.internalDate)).toISOString()
    : new Date().toISOString();
  const preview = gmailTextPreview(message.snippet || bodyText);

  return {
    id: message.id ?? crypto.randomUUID(),
    threadId: message.threadId ?? null,
    messageId: message.id ?? null,
    fromName: sender.name,
    fromEmail: sender.email,
    toName: recipient.name,
    toEmail: recipient.email,
    subject,
    preview,
    receivedAt,
    unread: Boolean(message.labelIds?.includes("UNREAD")),
    bodyText,
    bodyHtml:
      mimeType.toLowerCase().includes("html") || containsHtmlDocument(bodyText)
        ? sanitizeGmailHtml(bodyText)
        : null,
  };
}

export function normalizeGmailThread(thread: {
  id?: string | null;
  historyId?: string | null;
  messages?: Array<any> | null;
}) {
  const messages = (thread.messages ?? [])
    .map((message) => normalizeGmailMessage(message))
    .sort((a, b) => new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime());

  return {
    id: thread.id ?? crypto.randomUUID(),
    historyId: thread.historyId ?? null,
    messages,
  };
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
  const supabaseAdmin = await getSupabaseAdminClient();
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
    throw new Error("Gmail authorization expired or invalid");
  }

  if (!response.ok) {
    throw new Error("Gmail API request failed");
  }

  return (await response.json()) as T;
}

export async function upsertGmailConnectionForUser({
  userId,
  googleEmail,
  refreshToken,
  accessToken,
  scopes,
  status,
}: {
  userId: string;
  googleEmail: string;
  refreshToken?: string | null;
  accessToken?: string | null;
  scopes?: readonly string[] | string | null;
  status?: "connected" | "disconnected" | "error";
}) {
  const client = await getSupabaseAdminClient();
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

  const table = (client as any).from("gmail_connections");
  const existingResult = await table
    .select("*")
    .eq("user_id", userId)
    .eq("provider", "gmail")
    .maybeSingle();
  if (existingResult?.error && existingResult.error.code !== "PGRST116") {
    throw new Error("Could not load existing Gmail connection");
  }

  const payload = { ...row, ...(existingResult?.data?.id ? { id: existingResult.data.id } : {}) };
  const { data, error } = await table.upsert(payload, { onConflict: "user_id,provider" }).select();
  if (error) throw new Error("Unable to save Gmail connection");
  const saved = Array.isArray(data) ? data[0] : (data ?? payload);
  return saved;
}

export async function disconnectGmailConnectionForUser({ userId }: { userId: string }) {
  const client = await getSupabaseAdminClient();
  const table = (client as any).from("gmail_connections");
  const { error } = await table.delete().eq("user_id", userId).eq("provider", "gmail");
  if (error) throw new Error("Unable to disconnect Gmail account");
  return true;
}

export const fetchGmailInbox = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (data: {
      maxResults?: number;
      pageToken?: string;
      query?: string;
      folder?: "inbox" | "sent";
    }) => data,
  )
  .handler(async ({ data, context }) => {
    const userId = context?.userId ?? (context as any)?.supabase?.auth?.user?.id;
    if (!userId) throw new Error("Authenticated user is required");

    const maxResults = Math.min(Math.max(data.maxResults ?? 20, 1), 50);
    const folder = data.folder ?? "inbox";
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
        labelIds: folder === "sent" ? "SENT" : "INBOX",
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

export const startZohoMailOAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { redirectUri?: string }) => data)
  .handler(async ({ data }) => {
    const clientId = process.env["ZOHO_CLIENT_ID"];
    if (!clientId) throw new Error("Zoho OAuth client ID is not configured on the server");
    const accountsUrl = (process.env["ZOHO_ACCOUNTS_URL"] ?? "https://accounts.zoho.in").replace(
      /\/$/,
      "",
    );
    const redirectUri =
      data.redirectUri ?? process.env["ZOHO_REDIRECT_URI"] ?? "http://localhost:5173/gmail";
    const state = crypto.randomUUID().replace(/-/g, "");
    const authorizeUrl = new URL(`${accountsUrl}/oauth/v2/auth`);
    authorizeUrl.searchParams.set("client_id", clientId);
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("scope", "ZohoMail.accounts.READ,ZohoMail.messages.CREATE");
    authorizeUrl.searchParams.set("redirect_uri", redirectUri);
    authorizeUrl.searchParams.set("access_type", "offline");
    authorizeUrl.searchParams.set("prompt", "consent");
    authorizeUrl.searchParams.set("state", state);
    return { ok: true, url: authorizeUrl.toString(), state };
  });

export const completeZohoMailOAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (data: { code?: string; state?: string; redirectUri?: string; error?: string }) => data,
  )
  .handler(async ({ data, context }) => {
    const userId = context?.userId ?? (context as any)?.supabase?.auth?.user?.id;
    if (!userId) throw new Error("Authenticated user is required");
    if (data.error)
      throw new Error(
        data.error === "access_denied"
          ? "Zoho authorization was cancelled"
          : "Zoho authorization failed",
      );
    validateGoogleOAuthState(data.state);
    if (!data.code) throw new Error("Zoho authorization code is missing");

    const clientId = process.env["ZOHO_CLIENT_ID"];
    const clientSecret = process.env["ZOHO_CLIENT_SECRET"];
    if (!clientId || !clientSecret)
      throw new Error("Zoho OAuth client credentials are not configured on the server");
    const accountsUrl = (process.env["ZOHO_ACCOUNTS_URL"] ?? "https://accounts.zoho.in").replace(
      /\/$/,
      "",
    );
    const mailApiUrl = (process.env["ZOHO_MAIL_API_URL"] ?? "https://mail.zoho.in").replace(
      /\/$/,
      "",
    );
    const redirectUri =
      data.redirectUri ?? process.env["ZOHO_REDIRECT_URI"] ?? "http://localhost:5173/gmail";
    const tokenResponse = await fetch(`${accountsUrl}/oauth/v2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: data.code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }).toString(),
    });
    const tokenData = (await tokenResponse.json().catch(() => ({}))) as {
      access_token?: string;
      refresh_token?: string;
      error?: string;
    };
    if (!tokenResponse.ok || !tokenData.access_token || !tokenData.refresh_token) {
      throw new Error(
        "Zoho token exchange failed; check the registered redirect URL and Mail API scopes",
      );
    }

    const accountsResponse = await fetch(`${mailApiUrl}/api/accounts`, {
      headers: { Authorization: `Zoho-oauthtoken ${tokenData.access_token}` },
    });
    const accountPayload = (await accountsResponse.json().catch(() => ({}))) as {
      data?: Array<{
        accountId?: number | string;
        primaryEmailAddress?: string;
        emailAddress?: string;
      }>;
      errorCode?: string;
    };
    const account = accountPayload.data?.[0];
    const accountId = account?.accountId == null ? "" : String(account.accountId);
    const accountEmail = account?.primaryEmailAddress ?? account?.emailAddress;
    if (!accountsResponse.ok || !accountId || !accountEmail) {
      throw new Error(
        "Zoho connected, but no Mail account was returned. Verify Zoho Mail API access and data-center settings.",
      );
    }

    const supabaseAdmin = await getSupabaseAdminClient();
    const { error } = await (supabaseAdmin as any).from("gmail_connections").upsert(
      {
        user_id: userId,
        provider: "zoho",
        google_email: accountEmail,
        status: "connected",
        scopes: "ZohoMail.accounts.READ ZohoMail.messages.CREATE",
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        account_id: accountId,
        api_domain: mailApiUrl,
      },
      { onConflict: "user_id,provider" },
    );
    if (error) throw new Error("Unable to save the Zoho Mail connection");
    return { ok: true, email: accountEmail };
  });

export const getConnectedMailAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const userId = context?.userId ?? (context as any)?.supabase?.auth?.user?.id;
    if (!userId) throw new Error("Authenticated user is required");
    const supabaseAdmin = await getSupabaseAdminClient();
    const { data, error } = await (supabaseAdmin as any)
      .from("gmail_connections")
      .select("provider,google_email,status")
      .eq("user_id", userId)
      .eq("status", "connected");
    if (error) throw new Error("Unable to load connected mail accounts");
    return (data ?? []).map((row: { provider: string; google_email: string; status: string }) => ({
      provider: row.provider,
      email: row.google_email,
      status: row.status,
    }));
  });

export const disconnectMailAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { provider: "gmail" | "zoho" }) => data)
  .handler(async ({ data, context }) => {
    const userId = context?.userId ?? (context as any)?.supabase?.auth?.user?.id;
    if (!userId) throw new Error("Authenticated user is required");
    const supabaseAdmin = await getSupabaseAdminClient();
    const { error } = await (supabaseAdmin as any)
      .from("gmail_connections")
      .delete()
      .eq("user_id", userId)
      .eq("provider", data.provider);
    if (error) throw new Error("Unable to disconnect mail account");
    return { ok: true };
  });

export const sendSupplierInquiryEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (data: {
      provider: "gmail" | "zoho";
      supplierId?: string | null;
      to: string;
      subject: string;
      body: string;
    }) => data,
  )
  .handler(async ({ data, context }) => {
    const userId = context?.userId ?? (context as any)?.supabase?.auth?.user?.id;
    if (!userId) throw new Error("Authenticated user is required");

    const subject = data.subject.replace(/[\r\n]+/g, " ").trim();
    const body = data.body.trim();
    const recipients = data.to
      .split(",")
      .map((email) => email.trim())
      .filter(Boolean);
    const emailPattern = /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/;
    if (
      !recipients.length ||
      recipients.length > 10 ||
      recipients.some((email) => !emailPattern.test(email))
    ) {
      throw new Error("Enter one to ten valid recipient email addresses, separated by commas");
    }
    const to = recipients.join(", ");
    if (!subject || !body) throw new Error("Email subject and details are required");
    if (body.length > 100_000) throw new Error("Email details are too long");

    const supabaseAdmin = await getSupabaseAdminClient();
    if (data.supplierId) {
      if (!/^[0-9a-f-]{36}$/i.test(data.supplierId)) throw new Error("Select a valid supplier");
      const { data: supplier, error: supplierError } = await (supabaseAdmin as any)
        .from("suppliers")
        .select("id,is_active")
        .eq("id", data.supplierId)
        .maybeSingle();
      if (supplierError || !supplier?.is_active) {
        throw new Error("The selected supplier is inactive or unavailable");
      }
    }

    const connectionFields =
      data.provider === "zoho"
        ? "id,google_email,refresh_token,scopes,account_id,api_domain"
        : "id,google_email,refresh_token,scopes";
    const { data: connection, error: connectionError } = await (supabaseAdmin as any)
      .from("gmail_connections")
      .select(connectionFields)
      .eq("user_id", userId)
      .eq("provider", data.provider)
      .maybeSingle();

    if (connectionError) {
      throw new Error(
        data.provider === "gmail"
          ? "Unable to load the connected Gmail account"
          : "Unable to load Zoho Mail account details",
      );
    }
    if (!connection) {
      throw new Error(
        `Connect ${data.provider === "gmail" ? "Gmail" : "Zoho Mail"} on the Mail page before sending supplier emails`,
      );
    }
    if (!connection.refresh_token) {
      throw new Error(
        `${data.provider === "gmail" ? "Gmail" : "Zoho Mail"} is listed as connected, but its authorization is incomplete. Disconnect and reconnect the account before sending.`,
      );
    }
    if (data.provider === "gmail") {
      if (!String(connection.scopes ?? "").includes("https://www.googleapis.com/auth/gmail.send")) {
        throw new Error("Reconnect Gmail with send permission before sending supplier emails");
      }
      const clientId = process.env["GOOGLE_CLIENT_ID"];
      const clientSecret = process.env["GOOGLE_CLIENT_SECRET"];
      if (!clientId || !clientSecret)
        throw new Error("Gmail sending is not configured on the server");
      const refreshResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: connection.refresh_token,
          grant_type: "refresh_token",
        }).toString(),
      });
      if (!refreshResponse.ok)
        throw new Error("Gmail authorization expired. Reconnect Gmail and try again.");
      const token = (await refreshResponse.json()) as { access_token?: string };
      if (!token.access_token) throw new Error("Google did not provide a Gmail access token");

      const encodedSubject = btoa(unescape(encodeURIComponent(subject)));
      const encodedBody =
        btoa(unescape(encodeURIComponent(body)))
          .match(/.{1,76}/g)
          ?.join("\r\n") ?? "";
      const mimeMessage = [
        `From: ${connection.google_email}`,
        `To: ${to}`,
        `Subject: =?UTF-8?B?${encodedSubject}?=`,
        "MIME-Version: 1.0",
        "Content-Type: text/plain; charset=UTF-8",
        "Content-Transfer-Encoding: base64",
        "",
        encodedBody,
      ].join("\r\n");
      const raw = btoa(unescape(encodeURIComponent(mimeMessage)))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/g, "");
      const sendResponse = await fetch(
        "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ raw }),
        },
      );
      if (sendResponse.status === 401 || sendResponse.status === 403) {
        throw new Error("Gmail could not send this message. Reconnect Gmail with send permission.");
      }
      if (!sendResponse.ok) throw new Error("Gmail failed to send the supplier email");
      await (supabaseAdmin as any)
        .from("gmail_connections")
        .update({ access_token: token.access_token, status: "connected" })
        .eq("id", connection.id);
    } else {
      if (!String(connection.scopes ?? "").includes("ZohoMail.messages.CREATE")) {
        throw new Error("Reconnect Zoho Mail with message-create permission before sending");
      }
      if (!connection.account_id || !connection.api_domain) {
        throw new Error(
          "Zoho Mail account metadata is missing. Disconnect and reconnect Zoho Mail.",
        );
      }
      const clientId = process.env["ZOHO_CLIENT_ID"];
      const clientSecret = process.env["ZOHO_CLIENT_SECRET"];
      if (!clientId || !clientSecret)
        throw new Error("Zoho Mail sending is not configured on the server");
      const accountsUrl = (process.env["ZOHO_ACCOUNTS_URL"] ?? "https://accounts.zoho.in").replace(
        /\/$/,
        "",
      );
      const refreshResponse = await fetch(`${accountsUrl}/oauth/v2/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: connection.refresh_token,
          grant_type: "refresh_token",
        }).toString(),
      });
      const token = (await refreshResponse.json().catch(() => ({}))) as { access_token?: string };
      if (!refreshResponse.ok || !token.access_token) {
        throw new Error(
          "Zoho Mail authorization expired. Disconnect and reconnect the Zoho account.",
        );
      }
      const sendResponse = await fetch(
        `${String(connection.api_domain).replace(/\/$/, "")}/api/accounts/${encodeURIComponent(connection.account_id)}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Zoho-oauthtoken ${token.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            fromAddress: connection.google_email,
            toAddress: to,
            subject,
            content: body,
            mailFormat: "plaintext",
            encoding: "UTF-8",
          }),
        },
      );
      const sendResult = (await sendResponse.json().catch(() => ({}))) as {
        status?: { code?: number; description?: string };
      };
      if (!sendResponse.ok || (sendResult.status?.code != null && sendResult.status.code !== 200)) {
        throw new Error(
          sendResult.status?.description ?? "Zoho Mail failed to send the supplier email",
        );
      }
      await (supabaseAdmin as any)
        .from("gmail_connections")
        .update({ access_token: token.access_token, status: "connected" })
        .eq("id", connection.id);
    }

    return { ok: true, to, from: connection.google_email, provider: data.provider };
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
