import { describe, expect, test } from "bun:test";
import {
  GMAIL_SCOPES,
  buildGoogleOAuthUrl,
  buildReplyPayload,
  detectDuplicateCustomer,
  handleGoogleOAuthCallback,
  mapEmailToEnquiryCandidate,
  normalizeGmailMessage,
  normalizeGmailThread,
  upsertGmailConnectionForUser,
  validateGoogleOAuthState,
  disconnectGmailConnectionForUser,
} from "./gmail-provider.server";

process.env.GOOGLE_CLIENT_ID ??= "client-123";
process.env.GOOGLE_CLIENT_SECRET ??= "client-secret-123";

describe("gmail oauth and connection helpers", () => {
  test("oauth state validation accepts a strong state token", () => {
    const valid = "abc123xyzDEF456ghiJKL789mnoPQR";
    expect(validateGoogleOAuthState(valid)).toBe(valid);
  });

  test("oauth state validation rejects empty or weak values", () => {
    expect(() => validateGoogleOAuthState("bad")).toThrow("Google OAuth state is invalid");
    expect(() => validateGoogleOAuthState(null)).toThrow("Google OAuth state is required");
  });

  test("google auth url includes Gmail and account email scopes", () => {
    const url = buildGoogleOAuthUrl({
      clientId: "client-123",
      redirectUri: "http://localhost:3000/gmail/oauth/callback",
      state: "a1234567890bcdef",
      scopes: GMAIL_SCOPES,
    });

    expect(url).toContain("client_id=client-123");
    expect(url).toContain("redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fgmail%2Foauth%2Fcallback");
    expect(url).toContain(
      "scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fgmail.readonly+https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fgmail.send+https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fuserinfo.email",
    );
  });

  test("inbox normalization keeps the sender, preview and unread state", () => {
    const normalized = normalizeGmailMessage({
      id: "msg-1",
      threadId: "thread-1",
      snippet: "Hello, I need a Bali package for December",
      internalDate: "1710000000000",
      labelIds: ["UNREAD"],
      payload: {
        headers: [
          { name: "From", value: "Alice Smith <alice@example.com>" },
          { name: "To", value: "crm@example.com" },
          { name: "Subject", value: "Bali holiday query" },
        ],
        body: { data: "SGVsbG8gV29ybGQ=" },
      },
    });

    expect(normalized.fromName).toBe("Alice Smith");
    expect(normalized.fromEmail).toBe("alice@example.com");
    expect(normalized.subject).toBe("Bali holiday query");
    expect(normalized.unread).toBe(true);
    expect(normalized.preview).toContain("Hello, I need a Bali package");
  });

  test("thread normalization keeps the native Gmail thread layout", () => {
    const thread = normalizeGmailThread({
      id: "thread-1",
      historyId: "42",
      messages: [
        {
          id: "msg-1",
          threadId: "thread-1",
          snippet: "Need a quote for Kerala",
          payload: { headers: [{ name: "From", value: "Bob <bob@example.com>" }] },
        },
      ],
    });

    expect(thread.id).toBe("thread-1");
    expect(thread.messages[0]?.fromEmail).toBe("bob@example.com");
  });

  test("sender, subject and date parsing are extracted reliably from Gmail headers", () => {
    const normalized = normalizeGmailMessage({
      id: "msg-headers",
      threadId: "thread-headers",
      internalDate: "1710000000000",
      labelIds: ["UNREAD"],
      snippet: "Need a quote for Bali",
      payload: {
        headers: [
          { name: "From", value: "Alice Smith <alice@example.com>" },
          { name: "To", value: "crm@example.com" },
          { name: "Subject", value: "Bali holiday query" },
          { name: "Date", value: "Fri, 20 Sep 2024 12:00:00 +0000" },
        ],
        body: { data: "SGVsbG8gV29ybGQ=" },
      },
    });

    expect(normalized.fromName).toBe("Alice Smith");
    expect(normalized.fromEmail).toBe("alice@example.com");
    expect(normalized.subject).toBe("Bali holiday query");
    expect(normalized.receivedAt).toBe("2024-09-20T12:00:00.000Z");
    expect(normalized.unread).toBe(true);
  });

  test("plain-text, HTML and multipart bodies are extracted safely", () => {
    const plain = normalizeGmailMessage({
      id: "plain-msg",
      payload: {
        headers: [{ name: "From", value: "Client <client@example.com>" }],
        body: { data: "SGVsbG8gV29ybGQ=", mimeType: "text/plain" },
      },
    });

    expect(plain.bodyText).toContain("Hello World");
    expect(plain.bodyHtml).toBeNull();

    const html = normalizeGmailMessage({
      id: "html-msg",
      payload: {
        headers: [{ name: "From", value: "Client <client@example.com>" }],
        body: { data: "PGgxPkhlbGxvPC9oMT4=", mimeType: "text/html" },
      },
    });

    expect(html.bodyHtml).toContain("<h1>");
    expect(html.bodyHtml).toContain("Hello");

    const multipart = normalizeGmailMessage({
      id: "multipart-msg",
      payload: {
        headers: [{ name: "From", value: "Client <client@example.com>" }],
        parts: [
          { mimeType: "text/plain", body: { data: "V29ybGQ=" } },
          { mimeType: "text/html", body: { data: "PGgxPldvcmxkPC9oMT4=" } },
        ],
      },
    });

    expect(multipart.bodyText).toContain("World");
    expect(multipart.bodyHtml).toContain("<h1>");
    expect(multipart.bodyHtml).toContain("World");

    const htmlPreview = normalizeGmailMessage({
      id: "html-preview-msg",
      snippet: "<style>body { font-size: 100% !important; }</style><p>Keep every offer coming</p>",
      payload: {
        headers: [],
        parts: [
          {
            mimeType: "multipart/alternative",
            parts: [
              { mimeType: "text/plain", body: { data: "UmF3IGNzcw==" } },
              {
                mimeType: "text/html",
                body: { data: "PHA+S2VlcCBldmVyeSBvZmZlciBjb21pbmc8L3A+" },
              },
            ],
          },
        ],
      },
    });
    expect(htmlPreview.preview).toContain("Keep every offer coming");
    expect(htmlPreview.preview).not.toContain("font-size");

    const htmlInPlainPart = normalizeGmailMessage({
      id: "html-in-plain-part",
      snippet:
        "&lt;!DOCTYPE html&gt; &lt;html&gt; <style>body { font-size:100%; }</style> Keep your rewards points",
      payload: {
        headers: [],
        body: {
          mimeType: "text/plain",
          data: "PGRvY3R5cGUgaHRtbD48cD5LZWVwIHlvdXIgcmV3YXJkcyBwb2ludHM8L3A+",
        },
      },
    });
    expect(htmlInPlainPart.bodyHtml).toContain("<p>");
    expect(htmlInPlainPart.preview).not.toContain("DOCTYPE");
    expect(htmlInPlainPart.preview).not.toContain("font-size");
  });

  test("thread ordering keeps messages in chronological order", () => {
    const thread = normalizeGmailThread({
      id: "thread-order",
      messages: [
        {
          id: "msg-latest",
          internalDate: "1710000000000",
          snippet: "latest",
          payload: { headers: [{ name: "From", value: "B <b@example.com>" }] },
        },
        {
          id: "msg-earliest",
          internalDate: "1700000000000",
          snippet: "earliest",
          payload: { headers: [{ name: "From", value: "A <a@example.com>" }] },
        },
      ],
    });

    expect(thread.messages[0]?.id).toBe("msg-earliest");
    expect(thread.messages[1]?.id).toBe("msg-latest");
  });

  test("reply payload preserves Gmail threading metadata", () => {
    const reply = buildReplyPayload({
      threadId: "thread-42",
      messageId: "msg-42",
      to: "alice@example.com",
      from: "crm@example.com",
      subject: "Bali holiday query",
      body: "Thanks for your enquiry. We can help.",
      inReplyTo: "<msg-41@example.com>",
      references: ["<msg-41@example.com>", "<msg-40@example.com>"],
    });

    expect(reply.threadId).toBe("thread-42");
    expect(reply.payload.headers["In-Reply-To"]).toBe("<msg-41@example.com>");
    expect(reply.payload.headers.References).toBe("<msg-41@example.com> <msg-40@example.com>");
    expect(reply.payload.headers.subject).toBe("Re: Bali holiday query");
    expect(reply.raw.length).toBeGreaterThan(80);
  });

  test("duplicate customer detection compares by email and phone", () => {
    const existing = [{ email: "alice@example.com", mobile: "9876543210", whatsapp: "9876543210" }];
    expect(
      detectDuplicateCustomer(existing, { email: "ALICE@example.com", phone: "9988776655" }),
    ).toEqual(existing[0]);
    expect(
      detectDuplicateCustomer(existing, { email: "new@example.com", phone: "9988776655" }),
    ).toBeNull();
  });

  test("email content is mapped to the canonical enquiry model without inventing missing data", () => {
    const draft = mapEmailToEnquiryCandidate({
      senderName: "Alice Smith",
      senderEmail: "alice@example.com",
      phone: "+91 98765 43210",
      subject: "Family trip to Kerala",
      messageBody: "Hi, we need a 5 night family holiday in Kerala with flights.",
    });

    expect(draft.customer_name).toBe("Alice Smith");
    expect(draft.customer_email).toBe("alice@example.com");
    expect(draft.phone).toBe("919876543210");
    expect(draft.status).toBe("new");
    expect(draft.notes).toContain("Family trip to Kerala");
  });

  test("callback success stores the Gmail connection for the authenticated employee", async () => {
    const writes: Array<Record<string, unknown>> = [];
    const result = await handleGoogleOAuthCallback({
      userId: "user-123",
      error: null,
      state: "valid_state_token_123456",
      code: "auth-code-abc",
      redirectUri: "http://localhost:3000/gmail/oauth/callback",
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      fetcher: async () =>
        new Response(
          JSON.stringify({
            access_token: "access-123",
            refresh_token: "refresh-123",
            scope:
              "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/userinfo.email",
            token_type: "Bearer",
            expires_in: 3600,
          }),
          { headers: { "content-type": "application/json" } },
        ),
      profileFetcher: async () =>
        new Response(JSON.stringify({ emailAddress: "employee@gmail.com" }), {
          headers: { "content-type": "application/json" },
        }),
      connectionStore: {
        from: () => ({
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
              }),
            }),
          }),
          upsert: (payload: Record<string, unknown>) => {
            writes.push(payload);
            return {
              select: () => ({ data: [{ ...payload, id: "conn-1" }], error: null }),
            };
          },
        }),
      },
    });

    expect(result.ok).toBe(true);
    expect(writes[0]).toMatchObject({
      user_id: "user-123",
      google_email: "employee@gmail.com",
      refresh_token: "refresh-123",
      scopes:
        "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/userinfo.email",
      status: "connected",
    });
    expect(result.connection?.google_email).toBe("employee@gmail.com");
  });

  test("callback rejects invalid state before exchanging the code", async () => {
    await expect(
      handleGoogleOAuthCallback({
        userId: "user-123",
        error: null,
        state: "bad",
        code: "auth-code-abc",
        redirectUri: "http://localhost:3000/gmail/oauth/callback",
        fetcher: async () =>
          new Response("{}", { headers: { "content-type": "application/json" } }),
      }),
    ).rejects.toThrow("Google OAuth state is invalid");
  });

  test("callback rejects cancelled consent and Google errors without exchanging tokens", async () => {
    await expect(
      handleGoogleOAuthCallback({
        userId: "user-123",
        error: "access_denied",
        state: "valid_state_token_123456",
        redirectUri: "http://localhost:3000/gmail/oauth/callback",
        fetcher: async () =>
          new Response("{}", { headers: { "content-type": "application/json" } }),
      }),
    ).rejects.toThrow("Google OAuth was cancelled");
  });

  test("callback explains when Google does not grant access to the account email", async () => {
    await expect(
      handleGoogleOAuthCallback({
        userId: "user-123",
        error: null,
        state: "valid_state_token_123456",
        code: "auth-code-abc",
        redirectUri: "http://localhost:3000/gmail/oauth/callback",
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        fetcher: async () =>
          new Response(
            JSON.stringify({
              access_token: "access-123",
              refresh_token: "refresh-123",
              scope: GMAIL_SCOPES.join(" "),
            }),
            { headers: { "content-type": "application/json" } },
          ),
        profileFetcher: async () => new Response(null, { status: 403 }),
      }),
    ).rejects.toThrow(
      "Unable to load the connected Google account (HTTP 403). Reconnect and approve access to your account email address.",
    );
  });

  test("upsertGmailConnectionForUser updates an existing row instead of creating uncontrolled duplicates", async () => {
    const rows: Array<Record<string, unknown>> = [];

    const result = await upsertGmailConnectionForUser({
      userId: "user-123",
      googleEmail: "employee@gmail.com",
      refreshToken: "refresh-456",
      accessToken: "access-456",
      scopes: GMAIL_SCOPES,
      status: "connected",
      client: {
        from: () => ({
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { id: "conn-existing", user_id: "user-123", google_email: "old@gmail.com" },
                  error: null,
                }),
              }),
            }),
          }),
          upsert: (payload: Record<string, unknown>) => {
            rows.push(payload as Record<string, unknown>);
            return {
              select: () => ({ data: [{ ...payload, id: "conn-existing" }], error: null }),
            };
          },
        }),
      } as never,
    });

    expect(result.google_email).toBe("employee@gmail.com");
    expect(rows[0]).toMatchObject({
      user_id: "user-123",
      google_email: "employee@gmail.com",
      status: "connected",
    });
  });

  test("disconnect removes the stored Gmail connection for the authenticated user", async () => {
    let deleted = false;
    const result = await disconnectGmailConnectionForUser({
      userId: "user-123",
      client: {
        from: () => ({
          delete: () => ({
            eq: () => ({
              eq: () => ({ data: null, error: null }),
            }),
          }),
        }),
      } as never,
    });

    expect(result).toBe(true);
  });

  test("token values are never exposed through the connection payload", async () => {
    const result = await upsertGmailConnectionForUser({
      userId: "user-123",
      googleEmail: "employee@gmail.com",
      refreshToken: "secret-refresh-token",
      accessToken: "secret-access-token",
      scopes: GMAIL_SCOPES,
      status: "connected",
      client: {
        from: () => ({
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
              }),
            }),
          }),
          upsert: (payload: Record<string, unknown>) => ({
            select: () => ({ data: [{ ...payload, id: "conn-1" }], error: null }),
          }),
        }),
      } as never,
    });

    expect(result.refresh_token).toBe("[redacted]");
    expect(result.access_token).toBe("[redacted]");
    expect(result.google_email).toBe("employee@gmail.com");
  });
});
