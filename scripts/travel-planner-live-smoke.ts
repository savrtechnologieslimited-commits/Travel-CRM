import { planTrip } from "../src/lib/travel-planner-engine/planner";

const model = process.env["OPENAI_TRAVEL_PLANNER_MODEL"]?.trim();
if (!process.env["OPENAI_API_KEY"]?.trim()) throw new Error("OPENAI_API_KEY is not configured in the server environment.");
if (!model) throw new Error("OPENAI_TRAVEL_PLANNER_MODEL is not configured in the server environment.");

const cases = [
  {
    label: "A",
    request: "3 days 2 nights Bangalore Mysore for 3 adults, relaxed trip, 4 star hotels",
    mustInclude: ["bangalore", "mysore"],
    mustExclude: ["dubai", "kerala"],
  },
  {
    label: "B",
    request: "5 nights Kerala family trip for 2 adults and 2 children, Munnar Thekkady Alleppey, comfortable pace",
    mustInclude: ["kerala", "munnar", "thekkady", "alleppey"],
    mustExclude: ["dubai"],
  },
  {
    label: "Dubai",
    request: "4 nights Dubai for a couple, luxury, shopping and sightseeing",
    mustInclude: ["dubai"],
    mustExclude: ["bangalore", "mysore", "kerala"],
  },
] as const;

const results: Array<{ label: string; route: string[]; responseId: string; valid: boolean }> = [];
let failures = 0;

for (const testCase of cases) {
  console.info(`[Live smoke ${testCase.label}] API call started; model=${model}; webSearch=${process.env["OPENAI_TRAVEL_PLANNER_WEB_SEARCH"] === "true"}`);
  try {
    const result = await planTrip({ request: testCase.request }, {
      model,
      useWebSearch: process.env["OPENAI_TRAVEL_PLANNER_WEB_SEARCH"] === "true",
      maxOutputTokens: 12_000,
      maxRepairAttempts: 1,
    });
    const serializedPlan = JSON.stringify(result.plan).toLocaleLowerCase();
    const missing = testCase.mustInclude.filter((term) => !serializedPlan.includes(term));
    const leaked = testCase.mustExclude.filter((term) => serializedPlan.includes(term));
    const destinationMatches = missing.length === 0 && leaked.length === 0;
    const valid = destinationMatches;
    results.push({ label: testCase.label, route: result.plan.route.map((leg) => leg.city), responseId: result.meta.responseId, valid });

    console.info(`[Live smoke ${testCase.label}] OpenAI response received; model=${result.meta.model}; responseId=${result.meta.responseId}; validation=${result.validation.valid}; repairAttempts=${result.meta.repairAttempts}; destinationMatches=${destinationMatches}`);
    console.info(`[Live smoke ${testCase.label}] validation issues`, JSON.stringify(result.validation.issues));
    console.info(`[Live smoke ${testCase.label}] Generated itinerary`, JSON.stringify({
      title: result.plan.trip_summary.title,
      destination: result.plan.trip_summary.destination,
      duration: `${result.plan.trip_summary.duration_days} days / ${result.plan.trip_summary.nights} nights`,
      overview: result.plan.trip_summary.overview,
      route: result.plan.route,
      days: result.plan.days.map((day) => ({ day: day.day, city: day.city, overnight_city: day.overnight_city, title: day.title, morning: day.morning, afternoon: day.afternoon, evening: day.evening })),
      hotel_stays: result.plan.hotel_stays,
      activities: result.plan.activities.map((activity) => ({ name: activity.name, city: activity.city, day: activity.day })),
      transfers: result.plan.transfers.map((transfer) => ({ from: transfer.from, to: transfer.to, day: transfer.day, mode: transfer.mode })),
      validation: result.validation,
      missingExpectedTerms: missing,
      unexpectedDestinationTerms: leaked,
    }));
    if (!valid) failures += 1;
  } catch (error) {
    failures += 1;
    const message = error instanceof Error ? error.message.replace(/sk-[A-Za-z0-9_-]{12,}/g, "[redacted]") : "Unknown live API error";
    console.error(`[Live smoke ${testCase.label}] FAILED`, message);
  }
}

const routeA = results.find((result) => result.label === "A")?.route.join("|").toLocaleLowerCase();
const routeB = results.find((result) => result.label === "B")?.route.join("|").toLocaleLowerCase();
const materiallyDifferent = Boolean(routeA && routeB && routeA !== routeB);
console.info(`[Live smoke] A/B routes materially different=${materiallyDifferent}`);
if (!materiallyDifferent) failures += 1;
if (failures > 0) {
  console.error(`[Live smoke] FAILED; checks failed=${failures}`);
  process.exitCode = 1;
} else {
  console.info("[Live smoke] PASSED; all three OpenAI-generated plans matched their requested destinations and varied materially by request.");
}
