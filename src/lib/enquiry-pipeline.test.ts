import { describe, expect, test } from "bun:test";
import {
  ENQUIRY_PIPELINE_STAGES,
  canTransitionEnquiryStatus,
  getEnquiryPipelineStage,
  getEnquiryStatusCandidates,
} from "./enquiry-pipeline";

describe("enquiry pipeline", () => {
  test("maps legacy enquiry statuses to the business pipeline", () => {
    expect(getEnquiryPipelineStage("open")).toBe("new");
    expect(getEnquiryPipelineStage("quoted")).toBe("proposal_sent");
    expect(getEnquiryPipelineStage("converted")).toBe("booked");
    expect(getEnquiryPipelineStage("closed")).toBe("trip_completed");
    expect(getEnquiryPipelineStage("lost")).toBe("lost");
  });

  test("keeps the supported pipeline stages aligned with the CRM workflow", () => {
    expect(ENQUIRY_PIPELINE_STAGES).toEqual([
      "new",
      "in_progress",
      "proposal_sent",
      "booked",
      "trip_completed",
      "lost",
    ]);
  });

  test("allows the required valid transitions", () => {
    expect(canTransitionEnquiryStatus("new", "in_progress")).toBe(true);
    expect(canTransitionEnquiryStatus("in_progress", "proposal_sent")).toBe(true);
    expect(canTransitionEnquiryStatus("proposal_sent", "booked")).toBe(true);
    expect(canTransitionEnquiryStatus("booked", "trip_completed")).toBe(true);
  });

  test("supports corrective and explicit loss transitions without creating a booking", () => {
    expect(canTransitionEnquiryStatus("proposal_sent", "in_progress")).toBe(true);
    expect(canTransitionEnquiryStatus("booked", "proposal_sent")).toBe(true);
    expect(canTransitionEnquiryStatus("proposal_sent", "lost")).toBe(true);
    expect(canTransitionEnquiryStatus("booked", "lost")).toBe(false);
  });

  test("keeps legacy and canonical enquiry values visible in filters", () => {
    expect(getEnquiryStatusCandidates("new")).toEqual(["new", "open"]);
    expect(getEnquiryStatusCandidates("proposal_sent")).toEqual(["proposal_sent", "quoted"]);
    expect(getEnquiryStatusCandidates("booked")).toEqual(["booked", "converted"]);
    expect(getEnquiryStatusCandidates("trip_completed")).toEqual(["trip_completed", "closed"]);
  });
});
