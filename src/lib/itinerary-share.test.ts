import { describe, expect, it } from "bun:test";
import { buildPublicItineraryShareUrl, hashShareToken } from "./itinerary-share";

describe("itinerary share helpers", () => {
  it("hashes tokens deterministically for secure storage", async () => {
    const first = await hashShareToken("customer-token-123");
    const second = await hashShareToken("customer-token-123");
    const different = await hashShareToken("customer-token-456");

    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(first).toBe(second);
    expect(first).not.toBe(different);
  });

  it("builds a public itinerary share URL from a token", () => {
    expect(buildPublicItineraryShareUrl("https://crm.example.com", "customer-token-123")).toBe(
      "https://crm.example.com/itinerary-share/customer-token-123",
    );
  });
});
