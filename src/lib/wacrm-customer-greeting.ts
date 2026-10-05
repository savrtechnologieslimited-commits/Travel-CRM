import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveWacrmAppUrl } from "@/lib/wacrm-app-url";

const inputSchema = z.object({ customerId: z.string().uuid() });

export const sendWacrmCustomerGreetingFn = createServerFn({ method: "POST" })
  .validator(inputSchema)
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { data: customer, error } = await context.supabase
      .from("customers")
      .select("full_name,whatsapp,mobile,whatsapp_opt_in")
      .eq("id", data.customerId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) {
      console.error("[sendWacrmCustomerGreetingFn] Customer lookup failed:", error);
      throw new Error("The saved customer could not be loaded to send the greeting.");
    }
    if (!customer) throw new Error("The saved customer is unavailable.");
    if (!customer.whatsapp_opt_in) {
      throw new Error("The customer has not opted in to WhatsApp messages.");
    }

    const phone = customer.whatsapp || customer.mobile;
    if (!phone) throw new Error("Add a WhatsApp or mobile number before sending a greeting.");

    const wacrmAppUrl = resolveWacrmAppUrl(
      import.meta.env["VITE_WACRM_APP_URL"],
      import.meta.env.DEV,
    );
    if (!wacrmAppUrl) throw new Error("The WACRM app URL is not configured.");

    const { sendWacrmGreeting } = await import("./wacrm-customer-greeting.server");
    await sendWacrmGreeting(
      { phone, name: customer.full_name },
      {
        appUrl: wacrmAppUrl.origin,
        apiKey: process.env["WACRM_API_KEY"]?.trim() ?? "",
        templateName: process.env["WACRM_GREETING_TEMPLATE_NAME"]?.trim() ?? "",
        templateLanguage: process.env["WACRM_GREETING_TEMPLATE_LANGUAGE"]?.trim() ?? "",
      },
    );
    return { sent: true };
  });
