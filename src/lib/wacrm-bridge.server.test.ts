import { afterEach, describe, expect, it } from "bun:test";
import { verifyWacrmBridgeToken } from "../../apps/wacrm/src/lib/auth/bridge-token";
import { resolveRequestOrigin } from "./wacrm-origin";
import { createWacrmBridgeToken, createWacrmContactMatchToken } from "./wacrm-bridge.server";

const secret = "test-shared-secret-that-is-long-enough";
const originalSecret = process.env["WACRM_BRIDGE_SECRET"];

afterEach(() => {
  if (originalSecret === undefined) {
    delete process.env["WACRM_BRIDGE_SECRET"];
  } else {
    process.env["WACRM_BRIDGE_SECRET"] = originalSecret;
  }
});

describe("CRM-to-WACRM bridge token", () => {
  it("falls back to the referer when the origin header is missing", () => {
    const request = new Request("http://localhost:3000/auth/bridge", {
      headers: { referer: "http://localhost:5173/team" },
    });

    expect(resolveRequestOrigin(request)).toBe("http://localhost:5173");
  });

  it("creates a token accepted by the WACRM verifier", () => {
    process.env["WACRM_BRIDGE_SECRET"] = secret;

    const token = createWacrmBridgeToken({
      crmUserId: "bb807c13-901d-4d8b-9f12-07ac7e309cf9",
      email: "verified@example.com",
      fullName: "Verified User",
      issuer: "http://localhost:5173",
      audience: "http://localhost:3000",
    });
    const claims = verifyWacrmBridgeToken(
      token,
      secret,
      "http://localhost:5173",
      "http://localhost:3000",
    );

    expect(claims).toMatchObject({
      audience: "http://localhost:3000",
      email: "verified@example.com",
      fullName: "Verified User",
      issuer: "http://localhost:5173",
      purpose: "signin",
    });
  });

  it("creates a signed contact-match token accepted by WACRM", () => {
    process.env["WACRM_BRIDGE_SECRET"] = secret;

    const token = createWacrmContactMatchToken({
      crmUserId: "bb807c13-901d-4d8b-9f12-07ac7e309cf9",
      email: "verified@example.com",
      fullName: "Verified User",
      issuer: "http://localhost:5173",
      audience: "http://localhost:3000",
      record: {
        type: "customer",
        id: "e903d1ae-5f02-43f8-8b74-0224b90046c7",
        email: "traveler@example.com",
        phones: ["15551234567"],
      },
    });
    const claims = verifyWacrmBridgeToken(
      token,
      secret,
      "http://localhost:5173",
      "http://localhost:3000",
    );

    expect(claims).toMatchObject({
      purpose: "contact-match",
      record: {
        type: "customer",
        id: "e903d1ae-5f02-43f8-8b74-0224b90046c7",
        email: "traveler@example.com",
        phones: ["15551234567"],
      },
    });
  });
});
