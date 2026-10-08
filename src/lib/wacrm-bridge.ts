import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveWacrmAppUrl } from "@/lib/wacrm-app-url";
import { resolveRequestOrigin } from "@/lib/wacrm-origin";

export const createWacrmBridgeTokenFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const request = getRequest();
    const authorization = request.headers.get("authorization");
    const accessToken = authorization?.startsWith("Bearer ")
      ? authorization.slice("Bearer ".length)
      : "";
    if (!accessToken) throw new Error("CRM authentication is required.");

    const {
      data: { user },
      error,
    } = await context.supabase.auth.getUser(accessToken);
    if (error || !user) throw new Error("CRM authentication could not be verified.");
    if (!user.email || !user.email_confirmed_at) {
      throw new Error("Verify your CRM email before opening WACRM.");
    }

    const origin = resolveRequestOrigin(request);
    if (!origin) throw new Error("The CRM origin could not be verified.");

    let parsedOrigin: URL;
    try {
      parsedOrigin = new URL(origin);
    } catch {
      throw new Error("The CRM origin could not be verified.");
    }
    if (
      parsedOrigin.origin !== origin ||
      !["http:", "https:"].includes(parsedOrigin.protocol) ||
      parsedOrigin.username ||
      parsedOrigin.password
    ) {
      throw new Error("The CRM origin could not be verified.");
    }

    const metadataName = user.user_metadata?.["full_name"];
    const fullName = typeof metadataName === "string" ? metadataName.trim().slice(0, 120) : "";
    const wacrmAppUrl = resolveWacrmAppUrl(
      import.meta.env["VITE_WACRM_APP_URL"],
      import.meta.env.DEV,
    );
    if (!wacrmAppUrl) throw new Error("The WACRM app URL is not configured.");

    const { createWacrmBridgeToken } = await import("./wacrm-bridge.server");
    return {
      token: createWacrmBridgeToken({
        crmUserId: user.id,
        email: user.email.toLowerCase(),
        fullName,
        issuer: parsedOrigin.origin,
        audience: wacrmAppUrl.origin,
      }),
    };
  });
