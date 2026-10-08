import { describe, expect, test } from "bun:test";
import { hasFullLeadVisibility } from "./lead-ownership";

describe("lead ownership visibility", () => {
  test("admins, managers, and developer admins keep full visibility", () => {
    expect(hasFullLeadVisibility(["admin"])).toBe(true);
    expect(hasFullLeadVisibility(["manager"])).toBe(true);
    expect(hasFullLeadVisibility(["developer"])).toBe(true);
  });

  test("all other team roles are scoped to assigned leads", () => {
    expect(hasFullLeadVisibility([])).toBe(false);
    for (const role of [
      "sales_executive",
      "operations",
      "accounts",
      "visa_executive",
      "read_only",
    ]) {
      expect(hasFullLeadVisibility([role])).toBe(false);
    }
  });
});
