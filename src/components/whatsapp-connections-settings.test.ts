import { describe, expect, test } from "bun:test";

describe("WhatsApp Connections settings security boundary", () => {
  test("selects only connection status metadata, never the credential reference or token", async () => {
    const source = await Bun.file(new URL("./whatsapp-connections-settings.tsx", import.meta.url)).text();
    const selectedColumns = source.match(/\.select\("([^"]+)"\)/)?.[1] ?? "";
    expect(selectedColumns).toContain("connection_status,onboarding_status,webhook_status");
    expect(selectedColumns).not.toContain("access_token_secret_ref");
    expect(selectedColumns).not.toContain("access_token");
  });

  test("connect action reports onboarding unavailable and creates no fake connection", async () => {
    const source = await Bun.file(new URL("./whatsapp-connections-settings.tsx", import.meta.url)).text();
    expect(source).toContain("WhatsApp onboarding is not configured");
    expect(source).toContain("This action did not contact Meta, create a WABA connection, or change any phone number.");
    expect(source).not.toContain("from(\"whatsapp_connections\").insert");
  });
});