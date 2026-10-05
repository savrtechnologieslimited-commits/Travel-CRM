import { describe, expect, test } from "bun:test";
import { NAVIGATION_GROUPS } from "./app-shell";
import { TEAM_ROLES, TEAM_TAB_PATHS } from "@/lib/team-members";
import { teamRoleLabel } from "@/lib/team-role-label";

describe("navigation groups", () => {
  test("lists supported team roles and maps every tab", () => {
    expect(TEAM_ROLES).toEqual(["admin", "manager", "operations", "read_only"]);
    expect(teamRoleLabel("developer")).not.toBe("Developer");

    const routes = NAVIGATION_GROUPS.flatMap((group) => group.items.map((item) => item.to));
    expect([...TEAM_TAB_PATHS].sort()).toEqual([...routes].sort());
  });

  test("contains the CRM routes that are actually implemented", () => {
    const routes = NAVIGATION_GROUPS.flatMap((group) => group.items.map((item) => item.to));

    expect(routes).toEqual(
      expect.arrayContaining([
        "/dashboard",
        "/leads",
        "/customers",
        "/wacrm",
        "/gmail",
        "/itinerary-proposals",
        "/itinerary-library",
        "/quotations",
        "/bookings",
        "/payments",
        "/suppliers",
        "/packages",
        "/groups",
      ]),
    );
    expect(new Set(routes).size).toBe(routes.length);
  });

  test("groups the core travel CRM sections by journey", () => {
    const groups = Object.fromEntries(
      NAVIGATION_GROUPS.map((group) => [group.id, group.items.map((item) => item.to)]),
    );

    expect(groups.pipeline).toEqual(expect.arrayContaining(["/dashboard", "/leads", "/customers"]));
    expect(groups.customers).not.toContain("/messaging");
    expect(groups.more).toEqual(expect.arrayContaining(["/wacrm", "/gmail"]));
    expect(groups.itineraries).toEqual(
      expect.arrayContaining(["/itinerary-proposals", "/itinerary-library"]),
    );
    expect(groups.sales).toEqual(expect.arrayContaining(["/quotations", "/bookings", "/payments"]));
    expect(groups.operations).toEqual(
      expect.arrayContaining(["/suppliers", "/packages", "/groups"]),
    );
  });
});
