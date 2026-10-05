import { describe, expect, test } from "bun:test";
import { buildTripDaysFromDateRange, formatTripDayDate, shiftIsoDate, totalCityStayNights } from "./itinerary-day-dates";

describe("itinerary day dates", () => {
  test("sums complete city night stays and rejects incomplete entries", () => {
    expect(totalCityStayNights(["2", "2"])).toBe(4);
    expect(totalCityStayNights(["3"])).toBe(3);
    expect(totalCityStayNights(["2", ""])).toBeNull();
    expect(totalCityStayNights(["0"])).toBeNull();
    expect(totalCityStayNights([])).toBeNull();
  });

  test("shifts dates from either endpoint by the total night count", () => {
    expect(shiftIsoDate("2026-10-03", 4)).toBe("2026-10-07");
    expect(shiftIsoDate("2026-10-07", -4)).toBe("2026-10-03");
    expect(shiftIsoDate("invalid", 4)).toBe("");
  });

  test("creates one inclusive itinerary day per date and preserves matching day content", () => {
    const result = buildTripDaysFromDateRange("2026-09-30", "2026-10-02", [
      { day_number: 1, date: "", title: "Arrival", items: ["transfer"] },
      { day_number: 2, date: "", title: "", items: ["activity"] },
    ]);

    expect(result.map(({ day_number, date }) => [day_number, date])).toEqual([
      [1, "2026-09-30"],
      [2, "2026-10-01"],
      [3, "2026-10-02"],
    ]);
    expect(result[0]?.title).toBe("Arrival");
    expect(result[0]?.items).toEqual(["transfer"]);
    expect(result[2]?.title).toBe("Day 3");
  });

  test("does not replace days for invalid or reversed ranges", () => {
    const existing = [{ day_number: 1, date: "", title: "Current day", items: [] }];
    expect(buildTripDaysFromDateRange("2026-10-03", "2026-10-01", existing)).toBe(existing);
    expect(buildTripDaysFromDateRange("not-a-date", "2026-10-01", existing)).toBe(existing);
  });

  test("formats date labels in UTC without shifting to the previous day", () => {
    expect(formatTripDayDate("2026-09-30")).toBe("Wed, Sep 30, 2026");
    expect(formatTripDayDate("")).toBe("Date pending");
  });
});
