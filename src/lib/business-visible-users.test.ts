import { describe, expect, test } from "bun:test";
import {
  filterAssignmentsToBusinessVisibleUsers,
  filterBusinessVisibleUsers,
  isBusinessVisibleUser,
} from "./business-visible-users";

const users = [
  { id: "admin", full_name: "Admin", role: "admin", is_active: true },
  { id: "manager", full_name: "Manager", role: "manager", is_active: true },
  { id: "agent", full_name: "Agent", role: "sales_executive", is_active: true },
  { id: "employee", full_name: "Employee", role: "operations", is_active: true },
  { id: "developer", full_name: "Developer", role: "developer", is_active: true },
  { id: "inactive", full_name: "Inactive", role: "operations", is_active: false },
];
const developerUserIds = new Set(["developer"]);

describe("business-visible user filtering", () => {
  test("excludes Developer accounts and inactive users from active employee lists", () => {
    expect(filterBusinessVisibleUsers(users, developerUserIds).map((user) => user.id)).toEqual([
      "admin",
      "manager",
      "agent",
      "employee",
    ]);
    expect(isBusinessVisibleUser(users[4], developerUserIds)).toBe(false);
  });

  test("keeps inactive business accounts manageable without exposing Developers", () => {
    expect(
      filterBusinessVisibleUsers(users, developerUserIds, true).map((user) => user.id),
    ).toEqual(["admin", "manager", "agent", "employee", "inactive"]);
  });

  test("filters choices without rewriting existing assignments", () => {
    const existingAssignment = { destination_id: "destination-1", employee_id: "developer" };
    const visibleUsers = filterBusinessVisibleUsers(users, developerUserIds);
    const visibleAssignments = filterAssignmentsToBusinessVisibleUsers(
      [existingAssignment],
      new Set(visibleUsers.map((user) => user.id)),
    );

    expect(visibleAssignments).toEqual([]);
    expect(existingAssignment.employee_id).toBe("developer");
  });
});
