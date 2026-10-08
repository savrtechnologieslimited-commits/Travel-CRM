export async function extractSelectedFlight(environment) {
  const pageDocument = environment?.document ?? document;
  const pageLocation = environment?.location ?? location;
  const makeError = (error) => ({ ok: false, error });
  if (pageLocation.hostname !== "www.google.com" || !pageLocation.pathname.startsWith("/travel/flights/booking")) {
    return makeError("Select a flight in Google Flights first. Import works from the itinerary summary page.");
  }

  const detailButtons = [...pageDocument.querySelectorAll('button[aria-label^="Flight details."]')]
    .filter((button) => /(?:departing|outbound|return(?:ing)?|inbound) flight/i.test(button.getAttribute("aria-label") ?? ""));
  if (!detailButtons.length || !pageDocument.body.innerText.includes("Selected flights")) {
    return makeError("Choose your flight in Google Flights first. When the itinerary summary appears, import it here.");
  }

  const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
  const parseDate = (value) => {
    const match = /(\d{4})-(\d{2})-(\d{2})/.exec(value ?? "");
    return match ? `${match[1]}-${match[2]}-${match[3]}` : "";
  };
  const trackLabel = pageDocument.querySelector('button[aria-label^="Track prices for selected flights"]')?.getAttribute("aria-label") ?? "";
  const trackDates = [...trackLabel.matchAll(/(?:departing|returning)\s+(\d{4}-\d{2}-\d{2})/gi)].map((match) => parseDate(match[1]));
  const dateFromLabel = (label, baseDate, allowYearRollover) => {
    const match = /(?:flight on|on)\s+(?:[A-Za-z]{3,9},\s*)?([A-Za-z]{3,9})\s+(\d{1,2})/i.exec(label);
    if (!match || !baseDate) return "";
    const monthIndex = new Date(`${match[1]} 1, 2000`).getMonth();
    const day = Number(match[2]);
    if (Number.isNaN(monthIndex) || !day) return "";
    let year = Number(baseDate.slice(0, 4));
    const base = new Date(`${baseDate}T00:00:00Z`);
    const candidate = new Date(Date.UTC(year, monthIndex, day));
    if (allowYearRollover && candidate < base) year += 1;
    return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  };
  const parseTime = (label) => {
    const match = /(\d{1,2}):(\d{2})\s*(AM|PM)/i.exec(label ?? "");
    if (!match) return "";
    let hours = Number(match[1]) % 12;
    if (match[3].toUpperCase() === "PM") hours += 12;
    return `${String(hours).padStart(2, "0")}:${match[2]}`;
  };
  const getLeg = (button, index) => {
    const card = button.closest('[role="listitem"]') ?? button.closest("li");
    if (!card) return null;
    const label = button.getAttribute("aria-label") ?? "";
    const isReturn = /return(?:ing)?|inbound/i.test(label);
    const date = trackDates[isReturn ? 1 : 0] || dateFromLabel(label, trackDates[0], isReturn);
    const timeLabels = [...card.querySelectorAll('[aria-label^="Departure time:"], [aria-label^="Arrival time:"]')]
      .map((node) => node.getAttribute("aria-label") ?? "");
    const departureLabel = timeLabels.find((value) => value.startsWith("Departure time:")) ?? "";
    const arrivalLabel = timeLabels.find((value) => value.startsWith("Arrival time:")) ?? "";
    const departureAt = parseTime(departureLabel);
    const arrivalAt = parseTime(arrivalLabel);
    const codes = [...card.innerText.matchAll(/\(([A-Z]{3})\)/g)].map((match) => match[1]);
    const lines = card.innerText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const cabinIndex = lines.findIndex((line) => /^(economy|premium economy|business|first)$/i.test(line));
    const airline = cabinIndex > 0 ? lines[cabinIndex - 1] : "";
    const flightNumbers = [...card.innerText.matchAll(/([A-Z]{2})\s*(\d{1,4}[A-Z]?)\b/g)]
      .map((match) => `${match[1]}${match[2]}`);
    const durationMatch = /Travel time:\s*(\d+\s*hr(?:s)?(?:\s*\d+\s*min)?|\d+\s*min)/i.exec(card.innerText);
    const arrivalDate = dateFromLabel(arrivalLabel, date, true) || date;
    if (!date || !departureAt || !arrivalAt || codes.length < 2 || !airline) return null;

    return {
      index,
      isReturn,
      airline,
      flight_number: flightNumbers[0] ?? "",
      from: codes[0],
      to: codes[codes.length - 1],
      departure_at: `${date}T${departureAt}`,
      arrival_at: `${arrivalDate}T${arrivalAt}`,
      duration: durationMatch ? durationMatch[1].replace(/\s*hr(?:s)?\s*/i, "h ").replace(/\s*min/i, "m").trim() : "",
      stops: Math.max(0, flightNumbers.length - 1, codes.length - 2),
      cabin: cabinIndex > 0 ? lines[cabinIndex] : "",
    };
  };

  for (const button of detailButtons) {
    if (button.getAttribute("aria-expanded") !== "true") {
      button.click();
      await wait(250);
    }
  }

  const legs = detailButtons.map(getLeg).filter(Boolean).sort((a, b) => Number(a.isReturn) - Number(b.isReturn));
  if (!legs.length || !legs[0]) return makeError("Could not read the selected flight details. Try opening Flight details on Google Flights, then retry.");
  const outbound = legs[0];
  const returnLeg = legs[1];
  const bodyLines = pageDocument.body.innerText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const priceLabelIndex = bodyLines.findIndex((line) => line.toLowerCase() === "lowest total price");
  const priceText = priceLabelIndex > 0 ? bodyLines[priceLabelIndex - 1] : "";
  const priceMatch = /([\d,]+(?:\.\d{1,2})?)/.exec(priceText);
  const price = priceMatch ? Number(priceMatch[1].replaceAll(",", "")) : NaN;
  const currency = new URL(pageLocation.href).searchParams.get("curr") ?? (priceText.includes("₹") ? "INR" : "");
  if (!Number.isFinite(price) || !currency) return makeError("Could not read the fare. Make sure the Google Flights itinerary summary has finished loading.");

  return {
    ok: true,
    offer: {
      id: `google-flights-${Date.now()}`,
      airline: outbound.airline,
      flight_number: outbound.flight_number,
      from: outbound.from,
      to: outbound.to,
      departure_at: outbound.departure_at,
      arrival_at: outbound.arrival_at,
      duration: outbound.duration,
      stops: outbound.stops,
      price,
      currency,
      cabin: outbound.cabin,
      ...(returnLeg ? {
        return_from: returnLeg.from,
        return_to: returnLeg.to,
        return_departure_at: returnLeg.departure_at,
        return_arrival_at: returnLeg.arrival_at,
        return_airline: returnLeg.airline,
        return_flight_number: returnLeg.flight_number,
      } : {}),
    },
  };
}
