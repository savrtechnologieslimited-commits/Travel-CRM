import { normalisePhone } from "@/lib/phone";

export type WacrmGreetingConfig = {
  appUrl: string;
  apiKey: string;
  templateName: string;
  templateLanguage: string;
};

export function normalizeWacrmRecipient(phone: string): string {
  const digits = normalisePhone(phone);
  if (!/^\d{8,15}$/.test(digits)) {
    throw new Error("Enter a valid international WhatsApp number for this customer.");
  }
  return `+${digits}`;
}

export async function sendWacrmGreeting(
  input: {
    phone: string;
    name: string;
  },
  config: WacrmGreetingConfig,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  if (!config.apiKey) {
    throw new Error("WACRM_API_KEY is not configured on the CRM server.");
  }
  if (!config.templateName || !config.templateLanguage) {
    throw new Error("The approved WACRM greeting template is not configured on the CRM server.");
  }

  const endpoint = new URL("/api/v1/messages", config.appUrl);
  let response: Response;
  try {
    response = await fetcher(endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        to: normalizeWacrmRecipient(input.phone),
        type: "template",
        template: {
          name: config.templateName,
          language: config.templateLanguage,
          params: [input.name],
        },
        name: input.name,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    console.error("[sendWacrmGreeting] WACRM request failed:", error);
    throw new Error("WACRM could not be reached to send the greeting.");
  }

  if (response.ok) return;

  let errorMessage = "";
  try {
    const body: unknown = await response.json();
    if (
      body &&
      typeof body === "object" &&
      "error" in body &&
      body.error &&
      typeof body.error === "object" &&
      "message" in body.error &&
      typeof body.error.message === "string"
    ) {
      errorMessage = body.error.message;
    }
  } catch {
    // Use the status-based message below when WACRM has no JSON error body.
  }
  console.error(
    `[sendWacrmGreeting] WACRM returned HTTP ${response.status}${errorMessage ? `: ${errorMessage}` : ""}`,
  );
  throw new Error(
    errorMessage || `WACRM rejected the greeting (HTTP ${response.status}).`,
  );
}
