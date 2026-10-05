import { describe, expect, test } from "bun:test";

import { LEAD_STATUS_TABS, getLeadStatusValue } from "./leads.index";

describe("lead pipeline tabs", () => {
  test("includes the supported lead pipeline tabs", () => {
    expect(LEAD_STATUS_TABS.map((tab) => tab.value)).toEqual([
      "new",
      "in_progress",
      "quotation_sent",
      "discontinued",
    ]);
  });

  test("maps persisted lead statuses into the visible tabs", () => {
    expect(getLeadStatusValue("new")).toBe("new");
    expect(getLeadStatusValue("contacted")).toBe("in_progress");
    expect(getLeadStatusValue("requirement_collected")).toBe("in_progress");
    expect(getLeadStatusValue("confirmed")).toBe("in_progress");
    expect(getLeadStatusValue("quotation_sent")).toBe("quotation_sent");
    expect(getLeadStatusValue("cancelled")).toBe("discontinued");
    expect(getLeadStatusValue("lost")).toBe("discontinued");
    expect(getLeadStatusValue("new")).toBe("new");
    expect(getLeadStatusValue("converted")).toBeNull();
  });
});
