import { describe, expect, test } from "bun:test";
import { collectExistingItineraryTickets, itineraryTextToSafeHtml } from "./itinerary-ticket-sources";

describe("AI itinerary ticket sources", () => {
  test("includes only saved flight items and preserves their existing ticket facts", () => {
    const tickets = collectExistingItineraryTickets([{
      items: [
        {
          item_type: "FLIGHT",
          title: "AI 123",
          flight_airline: "Air India",
          flight_number: "AI 123",
          departure_city: "Delhi",
          arrival_city: "Ahmedabad",
          flight_departure_date: "2026-09-30",
          flight_departure_time: "08:30",
          flight_arrival_time: "10:15",
          flight_cabin: "Economy",
          metadata: { flight_saved: true, pnr: "ABC123", supplier_id: "not allowed", internal_cost: "500" },
        },
        { item_type: "FLIGHT", flight_airline: "Unsaved Air", metadata: {} },
        { item_type: "TRANSPORT", title: "Airport transfer", vehicle_details: "Car", metadata: { transfer_saved: true } },
      ],
    }]);

    expect(tickets).toEqual([{
      kind: "flight",
      date: "2026-09-30",
      departureTime: "08:30",
      arrivalTime: "10:15",
      serviceName: "Air India",
      serviceNumber: "AI 123",
      pnr: "ABC123",
      departureLocation: "Delhi",
      arrivalLocation: "Ahmedabad",
      travelClass: "Economy",
    }]);
    expect(JSON.stringify(tickets)).not.toContain("supplier_id");
    expect(JSON.stringify(tickets)).not.toContain("internal_cost");
  });

  test("includes only explicit train-like transport and its whitelisted ticket fields", () => {
    const tickets = collectExistingItineraryTickets([{
      items: [
        {
          item_type: "TRANSPORT",
          title: "Train 12951",
          pickup: "NDLS",
          dropoff: "ADI",
          departure_time: "06:00",
          arrival_time: "12:00",
          vehicle_details: "Train",
          metadata: { transfer_saved: true, ticket_number: "12951", class: "Train", coach: "B2", berth: "24", platform: "3", private_note: "ignore" },
        },
        { item_type: "TRANSPORT", title: "Hotel transfer", pickup: "Hotel", dropoff: "Airport", vehicle_details: "Sedan" },
      ],
    }]);

    expect(tickets).toEqual([{
      kind: "train",
      departureTime: "06:00",
      arrivalTime: "12:00",
      serviceName: "Train 12951",
      serviceNumber: "12951",
      departureLocation: "NDLS",
      arrivalLocation: "ADI",
      travelClass: "Train",
      coach: "B2",
      berth: "24",
      platform: "3",
    }]);
  });

  test("escapes source text before placing formatted output into editor HTML", () => {
    expect(itineraryTextToSafeHtml("DAY 1 — 30 September\nTransfer: <script>alert(1)</script>"))
      .toBe("<h2>DAY 1 — 30 September</h2><p><strong>Transfer:</strong> &lt;script&gt;alert(1)&lt;/script&gt;</p>");
  });
});
