import { describe, expect, test } from "bun:test";
import {
  createItineraryPackageOption,
  reorderItineraryPackageOptions,
  validateItineraryPackageOption,
  validatePackageScope,
} from "./itinerary-package";

describe("itinerary package options", () => {
  test("creates and normalizes a package option", () => {
    const option = createItineraryPackageOption({
      itinerary_id: "11111111-1111-4111-8111-111111111111",
      name: " 4 Star ",
      description: "Upgrade with premium stay",
      sequence: 2,
      is_active: true,
    });

    expect(option.name).toBe("4 Star");
    expect(option.sequence).toBe(2);
    expect(option.is_active).toBe(true);
  });

  test("reorders package options without duplicating sequence numbers", () => {
    const reordered = reorderItineraryPackageOptions([
      { id: "a", name: "3 Star", sequence: 1 },
      { id: "b", name: "5 Star", sequence: 2 },
      { id: "c", name: "4 Star", sequence: 3 },
    ]);

    expect(reordered.map((item) => item.name)).toEqual(["3 Star", "4 Star", "5 Star"]);
    expect(reordered.map((item) => item.sequence)).toEqual([1, 2, 3]);
  });

  test("rejects invalid package references and cross-itinerary assignment", () => {
    expect(() => validateItineraryPackageOption({ itinerary_id: "bad-id", name: "Package", sequence: 1 })).toThrow("Itinerary reference");
    expect(() => validatePackageScope("11111111-1111-4111-8111-111111111111", { package_id: "22222222-2222-4222-8222-222222222222" }, "other-itinerary")).toThrow("same itinerary");
  });
});
