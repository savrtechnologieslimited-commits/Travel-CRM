import { describe, expect, test } from "bun:test";
import { addDurationToTime, durationBetweenTimes, durationFromParts, durationToParts, formatTimeAmPm, parseDurationMinutes, timeToTwelveHour, twelveHourToTime } from "./transfer-time";

describe("transfer time helpers", () => {
  test("converts between stored 24-hour time and editable AM/PM parts", () => {
    expect(timeToTwelveHour("18:05")).toEqual({ hour: "6", minute: "05", period: "PM" });
    expect(timeToTwelveHour("00:00")).toEqual({ hour: "12", minute: "00", period: "AM" });
    expect(twelveHourToTime("12", "30", "PM")).toBe("12:30");
    expect(twelveHourToTime("12", "30", "AM")).toBe("00:30");
    expect(formatTimeAmPm("18:05")).toBe("6:05 PM");
  });

  test("parses common travel duration formats", () => {
    expect(parseDurationMinutes("45 min")).toBe(45);
    expect(parseDurationMinutes("1 hr 15 min")).toBe(75);
    expect(parseDurationMinutes("1 hour 15 minutes")).toBe(75);
    expect(parseDurationMinutes("2:10")).toBe(130);
    expect(parseDurationMinutes("unknown")).toBeNull();
  });

  test("converts stored travel durations to and from hour/minute fields", () => {
    expect(durationToParts("1 hour 15 minutes")).toEqual({ hours: "1", minutes: "15" });
    expect(durationToParts("45 min")).toEqual({ hours: "0", minutes: "45" });
    expect(durationFromParts("1", "15")).toBe("1 hr 15 min");
    expect(durationFromParts("", "45")).toBe("45 min");
    expect(durationFromParts("", "")).toBeNull();
    expect(durationFromParts("1", "60")).toBeNull();
  });

  test("calculates arrival time from pickup time and duration, including midnight rollover", () => {
    expect(addDurationToTime("09:00", "1 hr 15 min")).toBe("10:15");
    expect(addDurationToTime("23:30", "1 hour")).toBe("00:30");
    expect(addDurationToTime("09:00", "unknown")).toBeNull();
  });

  test("calculates travel duration from pickup and manually selected arrival times", () => {
    expect(durationBetweenTimes("09:00", "10:15")).toBe("1 hr 15 min");
    expect(durationBetweenTimes("23:30", "00:15")).toBe("45 min");
    expect(durationBetweenTimes("08:00", "08:00")).toBe("0 min");
    expect(durationBetweenTimes("invalid", "10:00")).toBeNull();
  });
});
