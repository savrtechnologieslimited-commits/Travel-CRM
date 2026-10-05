import { describe, expect, it } from "bun:test";
import {
  normalizeWacrmRecipient,
  sendWacrmGreeting,
} from "./wacrm-customer-greeting.server";

describe("WACRM customer greetings", () => {
  it("normalizes Indian local and international phone numbers", () => {
    expect(normalizeWacrmRecipient("98765 43210")).toBe("+919876543210");
    expect(normalizeWacrmRecipient("+1 (415) 555-0123")).toBe("+14155550123");
  });

  it("rejects phone numbers that cannot be safely sent internationally", () => {
    expect(() => normalizeWacrmRecipient("123")).toThrow(
      "valid international WhatsApp number",
    );
  });

  it("sends the configured approved template through WACRM's scoped API", async () => {
    let requestBody: Record<string, unknown> | undefined;
    let authorization: string | null = null;
    await sendWacrmGreeting(
      { phone: "9876543210", name: "Asha" },
      {
        appUrl: "https://wacrm.example",
        apiKey: "private-api-key",
        templateName: "travel_welcome",
        templateLanguage: "en",
      },
      async (input, init) => {
        authorization = new Headers(init?.headers).get("authorization");
        requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        expect(new URL(String(input)).pathname).toBe("/api/v1/messages");
        return new Response(JSON.stringify({ data: { message_id: "message-id" } }), {
          status: 201,
        });
      },
    );

    expect(authorization).toBe("Bearer private-api-key");
    expect(requestBody).toEqual({
      to: "+919876543210",
      type: "template",
      template: {
        name: "travel_welcome",
        language: "en",
        params: ["Asha"],
      },
      name: "Asha",
    });
  });

  it("surfaces WACRM API failures without treating them as sent", async () => {
    await expect(
      sendWacrmGreeting(
        { phone: "9876543210", name: "Asha" },
        {
          appUrl: "https://wacrm.example",
          apiKey: "private-api-key",
          templateName: "travel_welcome",
          templateLanguage: "en",
        },
        async () =>
          new Response(
            JSON.stringify({
              error: { code: "bad_request", message: "Template not found" },
            }),
            { status: 400 },
          ),
      ),
    ).rejects.toThrow("Template not found");
  });

  it("fails explicitly when the WACRM API key is not configured", async () => {
    await expect(
      sendWacrmGreeting(
        { phone: "9876543210", name: "Asha" },
        {
          appUrl: "https://wacrm.example",
          apiKey: "",
          templateName: "travel_welcome",
          templateLanguage: "en",
        },
      ),
    ).rejects.toThrow("WACRM_API_KEY is not configured");
  });
});
