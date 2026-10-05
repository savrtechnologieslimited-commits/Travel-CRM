import { describe, expect, test } from "bun:test";
import { MetaApiError, MetaCloudApiClient } from "./meta-api";

describe("WACRM-derived Meta Cloud API adapter", () => {
  test("sends approved templates through the shared Meta client", async () => {
    let sentBody: Record<string, unknown> | null = null;
    const api = new MetaCloudApiClient({
      accessToken: "server-secret",
      phoneNumberId: "phone-id",
      graphVersion: "v20.0",
      fetchImpl: async (_input, init) => {
        sentBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return new Response(JSON.stringify({ messages: [{ id: "wamid.template-1" }] }), { status: 200 });
      },
    });

    const result = await api.sendTemplateMessage({
      to: "919999999999",
      templateName: "travel_update",
      language: "en",
      components: [{ type: "body", parameters: [{ type: "text", text: "Asha" }] }],
    });

    expect(result.messageId).toBe("wamid.template-1");
    expect(sentBody).toMatchObject({
      messaging_product: "whatsapp",
      to: "919999999999",
      type: "template",
      template: { name: "travel_update", language: { code: "en" }, components: [{ type: "body" }] },
    });
  });

  test("provides phone validation, registration, WABA subscription, and phone lookup helpers", async () => {
    const requests: { url: string; method: string }[] = [];
    const api = new MetaCloudApiClient({
      accessToken: "server-secret",
      phoneNumberId: "phone-id",
      fetchImpl: async (input, init) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        requests.push({ url, method });
        if (url.includes("/phone-id?fields=")) {
          return new Response(JSON.stringify({ id: "phone-id", display_phone_number: "+1 555 0100" }), { status: 200 });
        }
        if (url.endsWith("/phone-id/register")) return new Response(JSON.stringify({ success: true }), { status: 200 });
        if (url.endsWith("/waba-id/phone_numbers?fields=id,display_phone_number,verified_name&limit=100")) {
          return new Response(JSON.stringify({ data: [{ id: "phone-id", display_phone_number: "+1 555 0100" }] }), { status: 200 });
        }
        if (url.endsWith("/waba-id/subscribed_apps")) {
          return new Response(JSON.stringify({ data: [{ whatsapp_business_api_data: { id: "app-id" } }] }), { status: 200 });
        }
        return new Response("{}", { status: 200 });
      },
    });

    expect((await api.verifyPhoneNumber()).id).toBe("phone-id");
    expect(await api.registerPhoneNumber("phone-id", "123456")).toEqual({ success: true, alreadyRegistered: false });
    await api.subscribeWabaToApp("waba-id");
    expect((await api.listWabaPhoneNumbers("waba-id")).map((number) => number.id)).toEqual(["phone-id"]);
    expect((await api.getSubscribedApps("waba-id"))[0]).toMatchObject({ whatsapp_business_api_data: { id: "app-id" } });
    expect(requests.some((request) => request.url.endsWith("/phone-id/register") && request.method === "POST")).toBe(true);
    expect(requests.some((request) => request.url.endsWith("/waba-id/subscribed_apps") && request.method === "POST")).toBe(true);
  });

  test("redacts credentials and exposes structured Meta error fields", async () => {
    const api = new MetaCloudApiClient({
      accessToken: "server-secret",
      phoneNumberId: "phone-id",
      fetchImpl: async () => new Response(JSON.stringify({ error: {
        message: "Rejected token server-secret",
        type: "OAuthException",
        code: 190,
        error_subcode: 463,
        fbtrace_id: "trace-1",
        error_data: { details: "Credential server-secret expired" },
      } }), { status: 401 }),
    });

    let caught: unknown;
    try {
      await api.sendTextMessage({ to: "919999999999", text: "Hi" });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(MetaApiError);
    expect(caught).toMatchObject({
      message: "Rejected token [REDACTED]",
      code: 190,
      subcode: 463,
      fbtraceId: "trace-1",
      httpStatus: 401,
      details: "Credential [REDACTED] expired",
    });
    expect(JSON.stringify(caught)).not.toContain("server-secret");
  });

  test("resolves Meta media metadata and downloads private bytes with the server token", async () => {
    const requests: Array<{ url: string; authorization: string | null }> = [];
    const api = new MetaCloudApiClient({
      accessToken: "server-secret",
      phoneNumberId: "phone-id",
      fetchImpl: async (input, init) => {
        const url = String(input);
        requests.push({ url, authorization: new Headers(init?.headers).get("authorization") });
        if (url.endsWith("/media-1")) {
          return new Response(JSON.stringify({ url: "https://lookaside.fbsbx.com/file/abc", mime_type: "image/jpeg", file_size: "4" }), { status: 200 });
        }
        return new Response(new Uint8Array([1, 2, 3, 4]), { status: 200, headers: { "content-type": "image/jpeg" } });
      },
    });

    const info = await api.getMediaUrl("media-1");
    const download = await api.downloadMedia(info.url, 4);
    expect(info).toEqual({ url: "https://lookaside.fbsbx.com/file/abc", mimeType: "image/jpeg", fileSize: 4 });
    expect([...download.bytes]).toEqual([1, 2, 3, 4]);
    expect(download.contentType).toBe("image/jpeg");
    expect(requests.every((request) => request.authorization === "Bearer server-secret")).toBe(true);
  });

  test("rejects untrusted media hosts and downloads beyond the configured cap", async () => {
    let downloads = 0;
    const api = new MetaCloudApiClient({
      accessToken: "server-secret",
      fetchImpl: async (input) => {
        downloads += 1;
        if (String(input).includes("graph.facebook.com")) {
          return new Response(JSON.stringify({ url: "https://attacker.example/file", mime_type: "image/jpeg" }), { status: 200 });
        }
        return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
      },
    });

    await expect(api.getMediaUrl("media-unsafe")).rejects.toThrow("unsupported media download host");
    expect(downloads).toBe(1);
    await expect(api.downloadMedia("https://lookaside.fbsbx.com/file/large", 2)).rejects.toThrow("storage limit");
  });
});
