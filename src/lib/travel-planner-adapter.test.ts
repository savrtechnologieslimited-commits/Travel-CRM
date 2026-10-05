import { describe, expect, test } from "bun:test";
import { buildTravelPlannerRequest } from "./travel-planner-adapter";

describe("travel planner CRM adapter", () => {
  test("sends only the exact trimmed requirements-box text to the planner", () => {
    const brief = "  4 days in Colombo and Ella, 2 adults, relaxed pace.  ";
    const request = buildTravelPlannerRequest(brief);
    expect(request).toEqual({ request: brief.trim() });
  });

  test("does not add structured fields or database service constraints", () => {
    const request = buildTravelPlannerRequest("Paris, France, 3 nights");
    expect(request.requirements).toBeUndefined();
    expect(request.fixedServices).toBeUndefined();
    expect(request.research).toBeUndefined();
  });
});
