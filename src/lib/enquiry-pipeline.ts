export const ENQUIRY_PIPELINE_STAGES = [
  "new",
  "in_progress",
  "proposal_sent",
  "booked",
  "trip_completed",
  "lost",
] as const;

export type EnquiryPipelineStage = (typeof ENQUIRY_PIPELINE_STAGES)[number];

const normalizeEnquiryStatus = (value?: string | null) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/-/g, "_");

const LEGACY_ENQUIRY_STATUS_MAP: Record<string, EnquiryPipelineStage> = {
  open: "new",
  in_progress: "in_progress",
  quoted: "proposal_sent",
  converted: "booked",
  closed: "trip_completed",
  lost: "lost",
};

const ENQUIRY_STAGE_ALIASES: Record<EnquiryPipelineStage, string[]> = {
  new: ["new", "open"],
  in_progress: ["in_progress"],
  proposal_sent: ["proposal_sent", "quoted"],
  booked: ["booked", "converted"],
  trip_completed: ["trip_completed", "closed"],
  lost: ["lost"],
};

export function getEnquiryPipelineStage(status?: string | null): EnquiryPipelineStage {
  const value = normalizeEnquiryStatus(status);
  if (!value) return "new";
  if ((ENQUIRY_PIPELINE_STAGES as readonly string[]).includes(value)) {
    return value as EnquiryPipelineStage;
  }
  return LEGACY_ENQUIRY_STATUS_MAP[value] ?? "new";
}

export function getEnquiryStatusCandidates(status?: string | null): string[] {
  const stage = getEnquiryPipelineStage(status);
  return [...new Set(ENQUIRY_STAGE_ALIASES[stage] ?? [stage])];
}

export function getEnquiryStageLabel(status?: string | null): string {
  switch (getEnquiryPipelineStage(status)) {
    case "new":
      return "New Enquiry";
    case "in_progress":
      return "In Progress";
    case "proposal_sent":
      return "Proposal Sent";
    case "booked":
      return "Booked";
    case "trip_completed":
      return "Trip Completed";
    case "lost":
      return "Lost Enquiry";
    default:
      return "New Enquiry";
  }
}

export function canTransitionEnquiryStatus(from?: string | null, to?: string | null): boolean {
  const current = getEnquiryPipelineStage(from);
  const next = getEnquiryPipelineStage(to);

  if (current === next) return true;

  const allowed: Record<EnquiryPipelineStage, EnquiryPipelineStage[]> = {
    new: ["in_progress", "lost"],
    in_progress: ["new", "proposal_sent", "lost"],
    proposal_sent: ["in_progress", "booked", "lost"],
    booked: ["proposal_sent", "trip_completed"],
    trip_completed: ["booked"],
    lost: ["new", "in_progress"],
  };

  return allowed[current]?.includes(next) ?? false;
}
