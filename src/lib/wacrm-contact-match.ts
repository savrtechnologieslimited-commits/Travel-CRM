import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveWacrmAppUrl } from "@/lib/wacrm-app-url";
import { resolveRequestOrigin } from "@/lib/wacrm-origin";

const inputSchema = z.object({
  recordType: z.enum(["lead", "customer"]),
  recordId: z.string().uuid(),
});

const responseSchema = z.discriminatedUnion("status", [
  z.object({
    userId: z.string().uuid(),
    status: z.literal("matched"),
    contactId: z.string().uuid(),
    matchedBy: z.enum(["email", "phone", "email_and_phone"]),
  }),
  z.object({
    userId: z.string().uuid(),
    status: z.literal("ambiguous"),
    candidateCount: z.number().int().positive(),
  }),
  z.object({ userId: z.string().uuid(), status: z.literal("unmatched") }),
]);

export const wacrmConversationResponseSchema = z.object({
  status: z.enum(["matched", "ambiguous", "unmatched"]),
  candidates: z.array(
    z.object({
      id: z.string().uuid(),
      name: z.string().nullable(),
      phone: z.string(),
      conversations: z.array(
        z.object({
          id: z.string().uuid(),
          status: z.string(),
          last_message_at: z.string().nullable(),
        }),
      ),
    }),
  ),
  messages: z.array(
    z.object({
      id: z.string().uuid(),
      conversation_id: z.string().uuid(),
      sender_type: z.enum(["customer", "agent", "bot"]),
      content_type: z.string(),
      content_text: z.string().nullable(),
      media_url: z.string().nullable(),
      template_name: z.string().nullable(),
      status: z.string(),
      created_at: z.string(),
    }),
  ),
  historyMayBeLimitedConversationIds: z.array(z.string().uuid()),
});

export type WacrmConversationResult = z.infer<typeof wacrmConversationResponseSchema>;

export type WacrmContactMatchStatus =
  | {
      status: "matched";
      contactId: string;
      matchedBy: "email" | "phone" | "email_and_phone";
    }
  | { status: "ambiguous"; candidateCount: number }
  | { status: "unmatched" };

export const matchWacrmContactFn = createServerFn({ method: "POST" })
  .inputValidator(inputSchema)
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const request = getRequest();
    const accessToken = request.headers.get("authorization")?.replace(/^Bearer /, "");
    if (!accessToken) throw new Error("CRM authentication is required.");

    const {
      data: { user },
      error: authError,
    } = await context.supabase.auth.getUser(accessToken);
    if (authError || !user || !user.email || !user.email_confirmed_at) {
      throw new Error("A verified CRM sign-in is required to match contacts.");
    }

    const { recordType, recordId } = data;
    const { data: record, error: recordError } =
      recordType === "lead"
        ? await context.supabase
            .from("leads")
            .select("email,mobile,whatsapp")
            .eq("id", recordId)
            .is("deleted_at", null)
            .maybeSingle()
        : await context.supabase
            .from("customers")
            .select("email,mobile,whatsapp")
            .eq("id", recordId)
            .is("deleted_at", null)
            .maybeSingle();
    if (recordError) {
      console.error("[matchWacrmContactFn] CRM record lookup failed:", recordError);
      throw new Error("The CRM record could not be checked for a WACRM contact.");
    }
    if (!record) throw new Error("The CRM record is unavailable.");

    const email = record.email?.trim().toLowerCase() ?? "";
    const normalizedEmail =
      email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
    const phones = [
      ...new Set(
        [record.mobile, record.whatsapp]
          .map((phone) => phone?.replace(/\D/g, "") ?? "")
          .filter((phone) => /^\d{7,15}$/.test(phone)),
      ),
    ];
    const clearLink = async () => {
      const { error } = await context.supabase
        .from("wacrm_contact_links")
        .delete()
        .eq("crm_user_id", user.id)
        .eq("crm_record_type", recordType)
        .eq("crm_record_id", recordId);
      if (error) {
        console.error("[matchWacrmContactFn] stale CRM link cleanup failed:", error);
        throw new Error("The WACRM contact link could not be refreshed.");
      }
    };

    if (!normalizedEmail && phones.length === 0) {
      await clearLink();
      return { status: "unmatched" } satisfies WacrmContactMatchStatus;
    }

    const origin = resolveRequestOrigin(request);
    if (!origin || !isHttpOrigin(origin)) {
      throw new Error("The CRM origin could not be verified.");
    }
    const wacrmAppUrl = resolveWacrmAppUrl(
      import.meta.env["VITE_WACRM_APP_URL"],
      import.meta.env.DEV,
    );
    if (!wacrmAppUrl) throw new Error("The WACRM app URL is not configured.");

    const metadataName = user.user_metadata?.["full_name"];
    const fullName = typeof metadataName === "string" ? metadataName.trim().slice(0, 120) : "";
    const { createWacrmContactMatchToken } = await import("./wacrm-bridge.server");
    const token = createWacrmContactMatchToken({
      crmUserId: user.id,
      email: user.email.toLowerCase(),
      fullName,
      issuer: origin,
      audience: wacrmAppUrl.origin,
      record: {
        type: recordType,
        id: recordId,
        email: normalizedEmail,
        phones,
      },
    });

    let response: Response;
    try {
      response = await fetch(new URL("/api/crm/contact-match", wacrmAppUrl), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin,
        },
        body: JSON.stringify({ token }),
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      });
    } catch (error) {
      console.error("[matchWacrmContactFn] WACRM request failed:", error);
      throw new Error("WACRM could not be reached to check this contact.");
    }
    if (response.status === 409) {
      throw new Error("Sign in to WACRM once before matching contacts.");
    }
    if (!response.ok) {
      console.error(`[matchWacrmContactFn] WACRM returned HTTP ${response.status}.`);
      throw new Error("WACRM could not complete contact matching.");
    }

    let result: z.infer<typeof responseSchema>;
    try {
      result = responseSchema.parse(await response.json());
    } catch (error) {
      console.error("[matchWacrmContactFn] invalid WACRM response:", error);
      throw new Error("WACRM returned an invalid contact-match response.");
    }

    if (result.status !== "matched") {
      await clearLink();
      return result.status === "ambiguous"
        ? ({
            status: "ambiguous",
            candidateCount: result.candidateCount,
          } satisfies WacrmContactMatchStatus)
        : ({ status: "unmatched" } satisfies WacrmContactMatchStatus);
    }

    const { error: linkError } = await context.supabase.from("wacrm_contact_links").upsert(
      {
        crm_user_id: user.id,
        crm_record_type: recordType,
        crm_record_id: recordId,
        wacrm_user_id: result.userId,
        wacrm_contact_id: result.contactId,
        match_method: result.matchedBy,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "crm_user_id,crm_record_type,crm_record_id" },
    );
    if (linkError) {
      console.error("[matchWacrmContactFn] CRM link save failed:", linkError);
      throw new Error("The WACRM contact link could not be saved.");
    }

    return {
      status: "matched",
      contactId: result.contactId,
      matchedBy: result.matchedBy,
    } satisfies WacrmContactMatchStatus;
  });

export const createWacrmContactMatchHandoffFn = createServerFn({ method: "POST" })
  .inputValidator(inputSchema)
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const request = getRequest();
    const authorization = request.headers.get("authorization");
    const accessToken = authorization?.startsWith("Bearer ")
      ? authorization.slice("Bearer ".length)
      : "";
    if (!accessToken) throw new Error("CRM authentication is required.");

    const {
      data: { user },
      error: authError,
    } = await context.supabase.auth.getUser(accessToken);
    if (authError || !user?.email || !user.email_confirmed_at) {
      throw new Error("A verified CRM sign-in is required to match WACRM contacts.");
    }

    const { data: record, error: recordError } =
      data.recordType === "lead"
        ? await context.supabase
            .from("leads")
            .select("email,mobile,whatsapp")
            .eq("id", data.recordId)
            .is("deleted_at", null)
            .maybeSingle()
        : await context.supabase
            .from("customers")
            .select("email,mobile,whatsapp")
            .eq("id", data.recordId)
            .is("deleted_at", null)
            .maybeSingle();
    if (recordError) {
      console.error("[createWacrmContactMatchHandoffFn] CRM record lookup failed:", recordError);
      throw new Error("The CRM record could not be checked for a WACRM contact.");
    }
    if (!record) throw new Error("The CRM record is unavailable.");

    const email = record.email?.trim().toLowerCase() ?? "";
    const normalizedEmail =
      email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
    const phones = [
      ...new Set(
        [record.mobile, record.whatsapp]
          .map((phone) => phone?.replace(/\D/g, "") ?? "")
          .filter((phone) => /^\d{7,15}$/.test(phone)),
      ),
    ];
    if (phones.length === 0) {
      throw new Error("This CRM record does not have a valid phone number to match.");
    }

    const origin = resolveRequestOrigin(request);
    if (!origin || !isHttpOrigin(origin)) {
      throw new Error("The CRM origin could not be verified.");
    }
    const wacrmAppUrl = resolveWacrmAppUrl(
      import.meta.env["VITE_WACRM_APP_URL"],
      import.meta.env.DEV,
    );
    if (!wacrmAppUrl) throw new Error("The WACRM app URL is not configured.");

    const metadataName = user.user_metadata?.["full_name"];
    const fullName = typeof metadataName === "string" ? metadataName.trim().slice(0, 120) : "";
    const { createWacrmContactMatchToken } = await import("./wacrm-bridge.server");
    const token = createWacrmContactMatchToken({
      crmUserId: user.id,
      email: user.email.toLowerCase(),
      fullName,
      issuer: origin,
      audience: wacrmAppUrl.origin,
      record: {
        type: data.recordType,
        id: data.recordId,
        email: normalizedEmail,
        phones,
      },
    });
    return {
      apiUrl: new URL("/api/crm/contact-match", wacrmAppUrl).toString(),
      issuer: origin,
      token,
    };
  });

export const loadWacrmConversationFn = createServerFn({ method: "POST" })
  .inputValidator(inputSchema)
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const request = getRequest();
    const authorization = request.headers.get("authorization");
    const accessToken = authorization?.startsWith("Bearer ")
      ? authorization.slice("Bearer ".length)
      : "";
    if (!accessToken) throw new Error("CRM authentication is required.");

    const {
      data: { user },
      error: authError,
    } = await context.supabase.auth.getUser(accessToken);
    if (authError || !user?.email || !user.email_confirmed_at) {
      throw new Error("A verified CRM sign-in is required to load WACRM conversations.");
    }

    const { data: record, error: recordError } =
      data.recordType === "lead"
        ? await context.supabase
            .from("leads")
            .select("email,mobile,whatsapp")
            .eq("id", data.recordId)
            .is("deleted_at", null)
            .maybeSingle()
        : await context.supabase
            .from("customers")
            .select("email,mobile,whatsapp")
            .eq("id", data.recordId)
            .is("deleted_at", null)
            .maybeSingle();
    if (recordError) {
      console.error("[loadWacrmConversationFn] CRM record lookup failed:", recordError);
      throw new Error("The CRM record could not be checked for a WACRM conversation.");
    }
    if (!record) throw new Error("The CRM record is unavailable.");

    const email = record.email?.trim().toLowerCase() ?? "";
    const normalizedEmail =
      email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
    const phones = [
      ...new Set(
        [record.mobile, record.whatsapp]
          .map((phone) => phone?.replace(/\D/g, "") ?? "")
          .filter((phone) => /^\d{7,15}$/.test(phone)),
      ),
    ];
    if (phones.length === 0) {
      throw new Error("This CRM record does not have a valid phone number to match.");
    }

    const issuer = resolveRequestOrigin(request);
    if (!issuer || !isHttpOrigin(issuer)) {
      throw new Error("The CRM origin could not be verified.");
    }
    const wacrmAppUrl = resolveWacrmAppUrl(
      import.meta.env["VITE_WACRM_APP_URL"],
      import.meta.env.DEV,
    );
    if (!wacrmAppUrl) throw new Error("The WACRM app URL is not configured.");

    const metadataName = user.user_metadata?.["full_name"];
    const fullName = typeof metadataName === "string" ? metadataName.trim().slice(0, 120) : "";
    const { createWacrmContactMatchToken } = await import("./wacrm-bridge.server");
    const token = createWacrmContactMatchToken({
      crmUserId: user.id,
      email: user.email.toLowerCase(),
      fullName,
      issuer,
      audience: wacrmAppUrl.origin,
      record: {
        type: data.recordType,
        id: data.recordId,
        email: normalizedEmail,
        phones,
      },
    });

    let response: Response;
    try {
      response = await fetch(new URL("/api/crm/contact-match", wacrmAppUrl), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: wacrmAppUrl.origin,
          "x-crm-origin": issuer,
          "x-crm-server-bridge": "1",
        },
        body: JSON.stringify({ token }),
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      });
    } catch (error) {
      console.error("[loadWacrmConversationFn] WACRM request failed:", error);
      throw new Error("WACRM could not be reached to load this conversation.");
    }

    let responseBody: unknown;
    try {
      responseBody = await response.json();
    } catch (error) {
      console.error("[loadWacrmConversationFn] WACRM returned invalid JSON:", error);
      throw new Error("WACRM returned an invalid conversation response.");
    }
    if (!response.ok) {
      const message =
        responseBody &&
        typeof responseBody === "object" &&
        "error" in responseBody &&
        typeof responseBody.error === "string"
          ? responseBody.error
          : "WACRM could not load this conversation.";
      console.error(`[loadWacrmConversationFn] WACRM returned HTTP ${response.status}: ${message}`);
      throw new Error(message);
    }

    try {
      return wacrmConversationResponseSchema.parse(responseBody);
    } catch (error) {
      console.error("[loadWacrmConversationFn] invalid WACRM response:", error);
      throw new Error("WACRM returned an invalid conversation response.");
    }
  });

function isHttpOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.origin === value &&
      !url.username &&
      !url.password &&
      ["http:", "https:"].includes(url.protocol)
    );
  } catch {
    return false;
  }
}
