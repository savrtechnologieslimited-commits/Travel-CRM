import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { formatItineraryFromSources } from "./ai-itinerary-formatter.server";

const savedServices = [
  { day_number: 1, date: "2026-09-30", item_type: "ACTIVITY", title: "Sabarmati Riverfront", details: ["Date: 2026-09-30", "Location: Ahmedabad", "Start time: 2:30 PM", "End time: 3:00 PM", "Description: A riverfront promenade."] },
  { day_number: 1, date: "2026-09-30", item_type: "TRANSPORT", title: "Airport transfer", details: ["Date: 2026-09-30", "Route: Airport", "Destination: Hotel", "Transfer type: Private", "Pickup time: 12:45 PM", "Arrival time: 1:15 PM"] },
  { day_number: 1, date: "2026-09-30", item_type: "ACCOMMODATION", title: "Hotel German Palace", details: ["Hotel: Hotel German Palace", "Address: Ahmedabad", "Check-in: 2026-09-30", "Check-in time: 5:00 PM", "Rooms: Standard (2 adults, 0 kids)"] },
];
const currentItineraryServices = [
  { day_number: 1, date: "2026-09-30", item_type: "TRANSPORT", title: "Transfer", details: ["Date: 2026-09-30", "Route: Airport", "Destination: Hotel", "Transfer type: Private", "Pickup time: 12:45 PM", "Arrival time: 1:15 PM", "Travel duration: 30 min", "Notes: Cab"] },
  { day_number: 1, date: "2026-09-30", item_type: "ACTIVITY", title: "Sabarmati Riverfront", details: ["Date: 2026-09-30", "Location: Ahmedabad", "Start time: 2:30 PM", "End time: 3:00 PM"] },
  { day_number: 1, date: "2026-09-30", item_type: "TRANSPORT", title: "Transfer", details: ["Date: 2026-09-30", "Route: Sabarmati", "Destination: Hotel", "Transfer type: Private", "Pickup time: 4:00 PM", "Arrival time: 5:00 PM"] },
  { day_number: 1, date: "2026-09-30", item_type: "ACCOMMODATION", title: "Hotel German Palace", details: ["Hotel: Hotel German Palace", "Check-in: 2026-09-30", "Check-in time: 5:00 PM", "Check-out: 2026-10-01", "Rooms: Standard (2 adults, 0 kids)"] },
  { day_number: 2, date: "2026-10-01", item_type: "ACTIVITY", title: "Narendra Modi Stadium", details: ["Date: 2026-10-01", "Start time: 11:30 AM", "End time: 6:00 PM"] },
  { day_number: 2, date: "2026-10-01", item_type: "TRANSPORT", title: "Transfer", details: ["Date: 2026-10-01", "Route: Airport", "Destination: Staditum", "Pickup time: 11:00 AM"] },
  { day_number: 2, date: "2026-10-01", item_type: "TRANSPORT", title: "Transfer", details: ["Date: 2026-10-01", "Route: Stadium", "Destination: Hotel", "Pickup time: 6:00 PM"] },
  { day_number: 2, date: "2026-10-01", item_type: "ACCOMMODATION", title: "Narayani Heights", details: ["Hotel: Narayani Heights", "Check-in: 2026-10-01", "Check-in time: 7:00 PM", "Check-out: 2026-10-02"] },
  { day_number: 3, date: "2026-10-02", item_type: "ACTIVITY", title: "ISKCON Temple, Ahmedabad", details: ["Date: 2026-10-02", "Start time: 1:00 PM", "End time: 5:00 PM"] },
  { day_number: 3, date: "2026-10-02", item_type: "ACCOMMODATION", title: "Narayani Heights", details: ["Hotel: Narayani Heights", "Check-in: 2026-10-02", "Check-in time: 3:00 PM", "Check-out: 2026-10-03"] },
  { day_number: 4, date: "2026-10-03", item_type: "ACTIVITY", title: "The Adalaj Stepwell", details: ["Date: 2026-10-03", "Start time: 12:00 PM", "End time: 6:00 PM"] },
  { day_number: 4, date: "2026-10-03", item_type: "ACCOMMODATION", title: "Tribecca Select", details: ["Hotel: Tribecca Select", "Check-in: 2026-10-03", "Check-in time: 3:00 PM", "Check-out: 2026-10-04"] },
  { day_number: 5, date: "2026-10-04", item_type: "ACTIVITY", title: "GIFT City, Gandhinagar", details: ["Date: 2026-10-04", "Start time: 11:00 AM", "End time: 7:00 PM"] },
  { day_number: 5, date: "2026-10-04", item_type: "ACCOMMODATION", title: "Fairfield by Marriott Ahmedabad", details: ["Hotel: Fairfield by Marriott Ahmedabad", "Check-in: 2026-10-04", "Check-in time: 3:00 PM", "Check-out: 2026-10-05"] },
  { day_number: 6, date: "2026-10-05", item_type: "TRANSPORT", title: "Transfer", details: ["Date: 2026-10-05", "Route: Hotel", "Destination: Airport", "Pickup time: 11:00 AM", "Arrival time: 12:00 PM"] },
];

function generatedResponse(args: Record<string, unknown>, edit?: (description: string, index: number) => string) {
  const messages = args["input"] as Array<{ role: string; content: string }>;
  const payload = JSON.parse(messages[1]!.content) as { savedServices: Array<{ item_type: string; title: string; details: string[] }>; tickets: Array<Record<string, string>> };
  const sourceDescriptions = payload.savedServices.map((service) => {
    const description = service.details.find((detail) => /^Description:\s*/i.test(detail))
      ?? (service.item_type === "TRANSPORT" ? service.details.find((detail) => /^Notes:\s*/i.test(detail)) : undefined);
    return description?.replace(/^[^:]+:\s*/, "") ?? "";
  });
  const descriptions = [...sourceDescriptions, ...payload.tickets.map(() => "")];
  return JSON.stringify({ items: descriptions.map((description, index) => ({ sourceIndex: index, customerDescription: edit?.(description, index) ?? description })) });
}

describe("source-limited AI itinerary formatter", () => {
  test("sends only sanitized saved services and factual flight/train ticket fields to OpenAI", async () => {
    let request: Record<string, unknown> | null = null;
    const result = await formatItineraryFromSources({
      savedServices,
      tickets: [
        { kind: "flight", serviceName: "Air India", serviceNumber: "AI 123", date: "2026-09-30", departureTime: "08:30", arrivalDate: "2026-09-30", arrivalTime: "10:15", departureLocation: "Delhi", arrivalLocation: "Ahmedabad", travelClass: "Economy", pnr: "ABC123", fare: "₹6498", currency: "INR", notes: "internal notes" },
        { kind: "train", serviceName: "Shatabdi Express", serviceNumber: "12009", date: "2026-10-01", departureTime: "09:00", arrivalDate: "2026-10-01", arrivalTime: "11:00", departureLocation: "Ahmedabad", arrivalLocation: "Vadodara", travelClass: "AC Chair Car" },
      ],
    }, {
      apiKey: "test-key",
      model: "test-model",
      client: { responses: { create: async (args) => {
        request = args;
        return { output_text: generatedResponse(args, (description, index) => index === 0 ? "A peaceful riverside walkway." : description) };
      } } },
    });

    expect(result).toContain("DAY 1 — September 30, 2026");
    expect(result).toContain("Sabarmati Riverfront");
    expect(result).toContain("Transfer");
    expect(result).toContain("Hotel German Palace");
    expect(result).toContain("Airline: Air India");
    expect(result).toContain("Flight number: AI 123");
    expect(result).toContain("Train name: Shatabdi Express");
    expect(result).toContain("Train number: 12009");
    const messages = request?.["input"] as Array<{ role: string; content: string }>;
    expect(messages.map((message) => message.role)).toEqual(["system", "user"]);
    expect(messages[0]?.content).toContain("customer-facing rewrite");
    expect(messages[0]?.content).toContain("meaning-preserving");
    expect(result).toContain("A peaceful riverside walkway.");
    expect(result).not.toContain("Description: A riverfront promenade.");
    expect(result).toContain("Description: A peaceful riverside walkway.");
    const userPayload = JSON.parse(messages[1]!.content) as Record<string, unknown>;
    expect(Object.keys(userPayload).sort()).toEqual(["savedServices", "tickets"]);
    expect(userPayload["savedServices"]).toEqual(savedServices);
    expect(userPayload["tickets"]).toEqual([
      { kind: "flight", serviceName: "Air India", serviceNumber: "AI 123", date: "2026-09-30", departureTime: "08:30", arrivalDate: "2026-09-30", arrivalTime: "10:15", departureLocation: "Delhi", arrivalLocation: "Ahmedabad", travelClass: "Economy" },
      { kind: "train", serviceName: "Shatabdi Express", serviceNumber: "12009", date: "2026-10-01", departureTime: "09:00", arrivalDate: "2026-10-01", arrivalTime: "11:00", departureLocation: "Ahmedabad", arrivalLocation: "Vadodara", travelClass: "AC Chair Car" },
    ]);
    expect(messages[1]?.content).not.toMatch(/₹|INR|fare|ABC123|internal notes|budget/i);
    expect(result).not.toMatch(/₹|INR|USD|EUR|cost|price|fare|total cost|supplier cost|selling price|margin|tax|Google Place ID|supplier ID|booking ID|internal notes/i);
  });

  test("rejects requests with no allowed source material", async () => {
    await expect(formatItineraryFromSources({ savedServices: [], tickets: [] }, { apiKey: "test", model: "test", client: { responses: { create: async () => ({ output_text: "{}" }) } } }))
      .rejects.toThrow("INSUFFICIENT_SOURCE");
  });

  test("discards costs and internal service details before the AI request", async () => {
    let request: Record<string, unknown> | null = null;
    const result = await formatItineraryFromSources({
      savedServices: [{ day_number: 1, date: "2026-09-30", item_type: "ACTIVITY", title: "Riverfront", details: ["Route: Airport → Hotel", "Cost per adult: ₹100", "Google Place ID: some-id", "Supplier notes: internal itinerary ref"] }],
      tickets: [{ kind: "flight", serviceNumber: "AI 123", fare: "₹6498", currency: "INR", notes: "Customer friendly" }],
    }, {
      apiKey: "test",
      model: "test",
      client: { responses: { create: async (args) => {
        request = args;
        return { output_text: generatedResponse(args) };
      } } },
    });

    const userPayload = JSON.parse((request?.["input"] as Array<{ role: string; content: string }>)[1]!.content) as Record<string, unknown>;
    expect(JSON.stringify(userPayload["savedServices"])).not.toMatch(/Cost per adult|₹|Google Place ID|Supplier notes|internal itinerary/i);
    expect(userPayload["tickets"]).toEqual([{ kind: "flight", serviceNumber: "AI 123" }]);
    expect(result).not.toMatch(/Cost per adult|₹|INR|fare|Google Place ID|supplier|internal/i);
  });

  test("rejects unexpected CRM ticket fields before an AI request", async () => {
    let called = false;
    await expect(formatItineraryFromSources({
      savedServices,
      tickets: [{ kind: "flight", customer_id: "must-not-pass" } as never],
    }, { apiKey: "test", model: "test", client: { responses: { create: async () => { called = true; return { output_text: "{}" }; } } } }))
      .rejects.toThrow("Invalid ticket source data");
    expect(called).toBe(false);
  });

  test("classifies provider credential and quota failures without exposing provider details", async () => {
    for (const [status, expectedCode] of [[401, "ITINERARY_FORMATTER_AUTH_FAILURE"], [429, "ITINERARY_FORMATTER_RATE_LIMITED"]] as const) {
      const providerError = Object.assign(new Error("provider response"), { status });
      await expect(formatItineraryFromSources({ savedServices, tickets: [] }, {
        apiKey: "test",
        model: "test",
        client: { responses: { create: async () => { throw providerError; } } },
      })).rejects.toThrow(expectedCode);
    }
  });

  test("rejects a generated entry that leaks money or adds an unsupplied service", async () => {
    await expect(formatItineraryFromSources({ savedServices, tickets: [] }, {
      apiKey: "test", model: "test",
      client: { responses: { create: async (args) => ({ output_text: generatedResponse(args, (description, index) => index === 0 ? `${description} Then enjoy restaurant dinner for ₹350.` : description) }) } },
    })).rejects.toThrow("ITINERARY_FORMATTER_UNSAFE_OUTPUT");
  });

  test("rejects an invented service category in a rewritten description", async () => {
    await expect(formatItineraryFromSources({ savedServices, tickets: [] }, {
      apiKey: "test", model: "test",
      client: { responses: { create: async (args) => ({ output_text: generatedResponse(args, (description, index) => index === 0 ? `${description} Visit a restaurant after the promenade.` : description) }) } },
    })).rejects.toThrow("ITINERARY_FORMATTER_UNGROUNDED_DESCRIPTION");
  });

  test("rejects duplicate or omitted source entries rather than silently changing the supplied itinerary", async () => {
    await expect(formatItineraryFromSources({ savedServices, tickets: [] }, {
      apiKey: "test", model: "test",
      client: { responses: { create: async () => ({ output_text: JSON.stringify({ items: [{ sourceIndex: 0, customerDescription: "" }, { sourceIndex: 0, customerDescription: "" }, { sourceIndex: 1, customerDescription: "" }] }) }) } },
    })).rejects.toThrow("ITINERARY_FORMATTER_INVALID_RESPONSE:INDEX");
  });

  test("formats the current six-day itinerary data without changing supplied services, dates, or times", async () => {
    const result = await formatItineraryFromSources({
      savedServices: currentItineraryServices,
      tickets: [{ kind: "flight", serviceName: "Air India", serviceNumber: "AI 123", date: "2026-09-30", departureTime: "08:30", arrivalDate: "2026-09-30", arrivalTime: "10:15", departureLocation: "Delhi", arrivalLocation: "Ahmedabad", travelClass: "Economy", fare: "35000", currency: "INR" }],
    }, {
      apiKey: "test", model: "test-model",
      client: { responses: { create: async (args) => ({ output_text: generatedResponse(args) }) } },
    });
    for (const required of [
      "DAY 1 — September 30, 2026", "Air India", "AI 123", "Sabarmati Riverfront", "Hotel German Palace",
      "DAY 2 — October 1, 2026", "Narendra Modi Stadium", "Narayani Heights", "Staditum",
      "DAY 3 — October 2, 2026", "ISKCON Temple, Ahmedabad",
      "DAY 4 — October 3, 2026", "The Adalaj Stepwell", "Tribecca Select",
      "DAY 5 — October 4, 2026", "GIFT City, Gandhinagar", "Fairfield by Marriott Ahmedabad",
      "DAY 6 — October 5, 2026", "Destination: Airport", "Pickup time: 11:00 AM",
    ]) expect(result).toContain(required);
    expect(result.indexOf("Flight number: AI 123")).toBeLessThan(result.indexOf("Route: Airport"));
    expect(result.indexOf("Route: Airport")).toBeLessThan(result.indexOf("Sabarmati Riverfront"));
    expect(result.indexOf("Destination: Staditum")).toBeLessThan(result.indexOf("Narendra Modi Stadium"));
    expect(result).not.toMatch(/₹|INR|USD|EUR|cost|price|fare|total cost|supplier cost|selling price|margin|tax|Google Place ID|supplier ID|booking ID|internal notes/i);
  });

  test("the active builder calls the restricted server function and provider secrets stay server-side", () => {
    const builderSource = readFileSync(new URL("../routes/_authenticated/itinerary-builder.tsx", import.meta.url), "utf8");
    const serverSource = readFileSync(new URL("./ai-itinerary-formatter.server.ts", import.meta.url), "utf8");
    const serverFnSource = readFileSync(new URL("./ai-itinerary-formatter.ts", import.meta.url), "utf8");
    expect(builderSource).toContain("formatItinerary({ data: { savedServices, tickets } })");
    expect(builderSource).not.toContain("formatItinerary({ data: { savedPlan");
    expect(serverFnSource).toContain("await import(\"./ai-itinerary-formatter.server\")");
    expect(serverSource).toContain("process.env[\"OPENAI_API_KEY\"]");
    expect(serverSource).toContain("process.env[\"OPENAI_MODEL\"]");
    expect(serverSource).toContain("new OpenAI({ apiKey");
    expect(serverFnSource).not.toContain("OPENAI_API_KEY");
  });

  test("fails with an explicit configuration error when server key or model is absent", async () => {
    const originalKey = process.env.OPENAI_API_KEY;
    const originalModel = process.env.OPENAI_MODEL;
    try {
      delete process.env.OPENAI_API_KEY;
      await expect(formatItineraryFromSources({ savedServices, tickets: [] }, { client: { responses: { create: async () => ({ output_text: "{}" }) } } }))
        .rejects.toThrow("ITINERARY_FORMATTER_NOT_CONFIGURED");
    } finally {
      if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = originalKey;
      if (originalModel === undefined) delete process.env.OPENAI_MODEL;
      else process.env.OPENAI_MODEL = originalModel;
    }
  });
});
