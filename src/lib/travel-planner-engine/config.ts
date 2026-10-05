import type OpenAI from "openai";

export type ReasoningEffort = "minimal" | "low" | "medium" | "high";
export type Verbosity = "low" | "medium" | "high";

export interface PlannerOptions {
  model?: string;
  reasoningEffort?: ReasoningEffort;
  verbosity?: Verbosity;
  useWebSearch?: boolean;
  maxOutputTokens?: number;
  maxRepairAttempts?: number;
  developerPrompt?: string;
  client?: OpenAI;
  signal?: AbortSignal;
}

export interface PlannerConfig {
  model: string;
  reasoningEffort: ReasoningEffort | undefined;
  verbosity: Verbosity | undefined;
  useWebSearch: boolean;
  maxOutputTokens: number | undefined;
  maxRepairAttempts: number;
}

const EFFORTS = ["minimal", "low", "medium", "high"];
const VERBOSITIES = ["low", "medium", "high"];

export function resolveConfig(o: PlannerOptions = {}): PlannerConfig {
  const model = o.model ?? process.env["OPENAI_TRAVEL_PLANNER_MODEL"];
  if (!model) throw new Error("No model configured. Pass options.model or set OPENAI_TRAVEL_PLANNER_MODEL.");
  const effort = (o.reasoningEffort ?? process.env["OPENAI_TRAVEL_PLANNER_REASONING_EFFORT"]) || undefined;
  if (effort && !EFFORTS.includes(effort)) throw new Error(`Invalid reasoning effort: ${effort}`);
  const verbosity = (o.verbosity ?? process.env["OPENAI_TRAVEL_PLANNER_VERBOSITY"]) || undefined;
  if (verbosity && !VERBOSITIES.includes(verbosity)) throw new Error(`Invalid verbosity: ${verbosity}`);
  return {
    model,
    reasoningEffort: effort as ReasoningEffort | undefined,
    verbosity: verbosity as Verbosity | undefined,
    useWebSearch: o.useWebSearch ?? process.env["OPENAI_TRAVEL_PLANNER_WEB_SEARCH"] === "true",
    maxOutputTokens: o.maxOutputTokens,
    maxRepairAttempts: o.maxRepairAttempts ?? 1,
  };
}
