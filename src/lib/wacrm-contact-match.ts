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
    const target = new URL("/crm/contact-match", wacrmAppUrl);
    target.searchParams.set("token", token);
    target.searchParams.set("issuer", origin);
    return { url: target.toString() };
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
