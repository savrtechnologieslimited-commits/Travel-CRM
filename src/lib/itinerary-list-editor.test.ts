import { describe, expect, test } from "bun:test";
import { addListValue, moveListValue, removeListValue, sanitizeListValues, updateListValue } from "./itinerary-list-editor";

describe("itinerary list editor", () => {
  test("sanitizes empty and whitespace-only list values before persistence", () => {
    expect(sanitizeListValues([" Accommodation ", "", "Daily breakfast", "   ", "Airport transfer"]))
      .toEqual(["Accommodation", "Daily breakfast", "Airport transfer"]);
  });

  test("adds a blank row only when the last item has content", () => {
    expect(addListValue(["Accommodation", "Daily breakfast"])).toEqual(["Accommodation", "Daily breakfast", ""]);
    expect(addListValue(["Accommodation", ""])).toEqual(["Accommodation", ""]);
  });

  test("updates, moves, and removes entries without mutating the original array", () => {
    const original = ["Accommodation", "Breakfast", "Airport transfer"];
    const updated = updateListValue(original, 1, "Daily breakfast");
    expect(updated).toEqual(["Accommodation", "Daily breakfast", "Airport transfer"]);
    expect(original).toEqual(["Accommodation", "Breakfast", "Airport transfer"]);

    expect(moveListValue(["Accommodation", "Breakfast", "Airport transfer"], 1, "up")).toEqual(["Breakfast", "Accommodation", "Airport transfer"]);
    expect(removeListValue(["Accommodation", "Breakfast", "Airport transfer"], 1)).toEqual(["Accommodation", "Airport transfer"]);
  });
});
