import type OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { resolveConfig, type PlannerConfig, type PlannerOptions } from "./config";
import { getOpenAI } from "./openaiClient";
import { buildInput, buildRepairMessage } from "./plannerPrompt";
import { expectedDuration, resolveStartDate } from "./requirements";
import { TripPlanSchema, type TripPlan } from "./schema";
import type { FixedServices, TripRequest } from "./types";
import { validateTripPlan, type ValidationContext, type ValidationResult } from "./validateTripPlan";

export interface PlanSource { url: string; title?: string }
export interface PlannerResult {
  plan: TripPlan;
  validation: ValidationResult;
  fixedServices: FixedServices | null;
  sources: PlanSource[];
  meta: { responseId: string; model: string; repairAttempts: number };
}
export type PlannerStreamEvent = { type: "status"; message: string } | { type: "delta"; text: string } | { type: "done"; result: PlannerResult };
export class PlannerError extends Error {
  constructor(public code: "INCOMPLETE" | "REFUSED" | "EMPTY" | "INVALID_JSON" | "API_FAILED", message: string) { super(message); }
}
type Msg = OpenAI.Responses.ResponseInputItem;
interface Ctx { req: TripRequest; cfg: PlannerConfig; client: OpenAI; input: Msg[]; vctx: ValidationContext; startDate: string | null; signal?: AbortSignal }
interface Attempt { plan: TripPlan; validation: ValidationResult; sources: PlanSource[]; responseId: string; model: string }

function makeCtx(req: TripRequest, opts: PlannerOptions): Ctx {
  const cfg = resolveConfig(opts); const { days, nights } = expectedDuration(req); const startDate = resolveStartDate(req);
  return { req, cfg, client: opts.client ?? getOpenAI(), input: buildInput(req, opts.developerPrompt), startDate, ...(opts.signal ? { signal: opts.signal } : {}),
    vctx: {
      expectedDays: days,
      expectedNights: nights,
      startDate,
      ...(req.fixedServices?.transport ? { transport: req.fixedServices.transport } : {}),
      ...(req.fixedServices?.hotels ? { hotels: req.fixedServices.hotels } : {}),
      ...(req.fixedServices?.servicesConfirmed !== undefined ? { servicesConfirmed: req.fixedServices.servicesConfirmed } : {}),
      travelStyle: req.requirements?.travelStyle ?? null,
    } };
}
function buildParams(cfg: PlannerConfig, input: Msg[]) {
  return { model: cfg.model, input, text: { format: zodTextFormat(TripPlanSchema, "trip_plan"), ...(cfg.verbosity && { verbosity: cfg.verbosity }) },
    ...(cfg.reasoningEffort && { reasoning: { effort: cfg.reasoningEffort } }),
    ...(cfg.useWebSearch && { tools: [{ type: "web_search" as const }], include: ["web_search_call.action.sources" as const] }),
    ...(cfg.maxOutputTokens && { max_output_tokens: cfg.maxOutputTokens }), store: false };
}
function outputText(r: OpenAI.Responses.Response): string {
  if (typeof r.output_text === "string" && r.output_text) return r.output_text;
  let out = "";
  for (const item of r.output ?? []) if (item.type === "message") for (const c of item.content) if (c.type === "output_text") out += c.text;
  return out;
}
function extractSources(r: OpenAI.Responses.Response): PlanSource[] {
  const map = new Map<string, PlanSource>();
  for (const item of r.output ?? []) if (item.type === "message") for (const c of item.content) if (c.type === "output_text")
    for (const a of c.annotations ?? []) if (a.type === "url_citation") map.set(a.url, { url: a.url, title: a.title });
  return [...map.values()];
}
function finalize(r: OpenAI.Responses.Response, ctx: Ctx, fallbackText = ""): Attempt {
  if (r.status === "failed" || r.error) throw new PlannerError("API_FAILED", r.error?.message ?? "OpenAI response failed");
  if (r.status === "incomplete") throw new PlannerError("INCOMPLETE", `Response incomplete: ${r.incomplete_details?.reason ?? "unknown"}. Raise maxOutputTokens.`);
  for (const item of r.output ?? []) if (item.type === "message") for (const c of item.content) if (c.type === "refusal") throw new PlannerError("REFUSED", c.refusal);
  const text = outputText(r) || fallbackText;
  if (!text) throw new PlannerError("EMPTY", "The model returned no output.");
  let parsed: TripPlan;
  try { parsed = TripPlanSchema.parse(JSON.parse(text)); } catch (e) { throw new PlannerError("INVALID_JSON", `Output did not match the TripPlan schema: ${(e as Error).message}`); }
  const plan = parsed;
  return { plan, validation: validateTripPlan(plan, ctx.vctx), sources: extractSources(r), responseId: r.id, model: r.model };
}
async function repairLoop(ctx: Ctx, first: Attempt): Promise<{ attempt: Attempt; repairs: number }> {
  let best = first; let repairs = 0;
  while (repairs < ctx.cfg.maxRepairAttempts && best.validation.issues.some((i) => i.severity === "error")) {
    repairs++;
    const errors = best.validation.issues.filter((i) => i.severity === "error");
    const input = [...ctx.input, buildRepairMessage(JSON.stringify(best.plan), errors)];
    const res = await ctx.client.responses.create(buildParams(ctx.cfg, input) as OpenAI.Responses.ResponseCreateParamsNonStreaming, { signal: ctx.signal });
    const next = finalize(res, ctx);
    const count = (a: Attempt) => a.validation.issues.filter((i) => i.severity === "error").length;
    if (count(next) <= count(best)) best = next; else break;
  }
  return { attempt: best, repairs };
}
function toResult(a: Attempt, ctx: Ctx, repairs: number): PlannerResult {
  return { plan: a.plan, validation: a.validation, fixedServices: ctx.req.fixedServices ? structuredClone(ctx.req.fixedServices) : null,
    sources: a.sources, meta: { responseId: a.responseId, model: a.model, repairAttempts: repairs } };
}
export async function planTrip(req: TripRequest, opts: PlannerOptions = {}): Promise<PlannerResult> {
  const ctx = makeCtx(req, opts);
  const res = await ctx.client.responses.create(buildParams(ctx.cfg, ctx.input) as OpenAI.Responses.ResponseCreateParamsNonStreaming, { signal: ctx.signal });
  const { attempt, repairs } = await repairLoop(ctx, finalize(res, ctx));
  return toResult(attempt, ctx, repairs);
}
export async function* planTripStream(req: TripRequest, opts: PlannerOptions = {}): AsyncGenerator<PlannerStreamEvent> {
  const ctx = makeCtx(req, opts);
  const stream = await ctx.client.responses.create({ ...buildParams(ctx.cfg, ctx.input), stream: true } as OpenAI.Responses.ResponseCreateParamsStreaming, { signal: ctx.signal });
  let buffer = ""; let final: OpenAI.Responses.Response | null = null;
  for await (const event of stream) {
    const type = event.type as string;
    if (type === "response.output_text.delta") { const delta = (event as { delta: string }).delta; buffer += delta; yield { type: "delta", text: delta }; }
    else if (type === "response.web_search_call.searching") yield { type: "status", message: "Researching destination information" };
    else if (type === "response.web_search_call.completed") yield { type: "status", message: "Research complete" };
    else if (type === "response.completed" || type === "response.incomplete") final = (event as { response: OpenAI.Responses.Response }).response;
    else if (type === "response.failed") throw new PlannerError("API_FAILED", (event as { response: OpenAI.Responses.Response }).response.error?.message ?? "OpenAI response failed");
    else if (type === "error") throw new PlannerError("API_FAILED", (event as { message: string }).message);
  }
  if (!final) throw new PlannerError("EMPTY", "Stream ended without a completed response.");
  const first = finalize(final, ctx, buffer); const { attempt, repairs } = await repairLoop(ctx, first);
  if (repairs) yield { type: "status", message: "Refined the plan after validation" };
  yield { type: "done", result: toResult(attempt, ctx, repairs) };
}
