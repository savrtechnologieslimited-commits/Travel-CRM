import { extractSupplierDocumentTables } from "./supplier-document-tables";

export type ExtractedItineraryTerms = {
  inclusions: string;
  exclusions: string;
  cancellation_info: string;
  terms_conditions: string;
};

export const DEFAULT_ITINERARY_TERMS: ExtractedItineraryTerms = {
  inclusions: "Accommodation\nBreakfast",
  exclusions: "Flights",
  cancellation_info: "Free cancellation up to 7 days before travel.\nCancellation within 7 days may incur supplier charges.\nNo-show and same-day cancellation charges are non-refundable.",
  terms_conditions: "50% advance to confirm, balance 15 days before departure.",
};

const SECTION_LABELS: Array<[keyof ExtractedItineraryTerms, RegExp]> = [
  ["inclusions", /^(?:inclusions?|included|what(?:'|’)s included|included in the package)$/i],
  ["exclusions", /^(?:exclusions?|excluded|not included|what(?:'|’)s excluded|excluded from the package)$/i],
  ["cancellation_info", /^(?:cancellations?|cancellation polic(?:y|ies)|cancellation and refund polic(?:y|ies)|refund polic(?:y|ies))$/i],
  ["terms_conditions", /^(?:terms(?: and| &) conditions|terms|conditions|t&c|t&cs)$/i],
];

function isNoisyOcrLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return true;
  if (/^(?:page\s*\d+|page\s*break|---+|===+|_+)$/.test(trimmed)) return true;
  if (/^(?:font(?:[a-z]+)*|arial|georgia|verdana|trebuchet)(?:size\d+)?$/i.test(trimmed)) return true;
  if (/^(?:font(?:[a-z]+)*size\d+|(?:arial|georgia|verdana|trebuchet)+(?:[a-z]+)*size\d+)$/i.test(trimmed)) return true;
  return false;
}

function sectionHeading(line: string): { key: keyof ExtractedItineraryTerms; content: string } | null {
  const normalized = line
    .trim()
    .replace(/^#{1,6}\s*/, "")
    .replace(/^\*\*(.*)\*\*$/, "$1")
    .replace(/^\d+[.)]\s*/, "");
  const match = /^(.+?)(?:\s*[:：–—-]\s*(.*))?$/.exec(normalized);
  if (!match) return null;
  const label = match[1]!.trim().replace(/^\*\*|\*\*$/g, "");
  const entry = SECTION_LABELS.find(([, pattern]) => pattern.test(label));
  if (!entry) return null;
  const content = (match[2] ?? "").trim();
  const nestedHeading = content ? sectionHeading(content) : null;
  if (nestedHeading && nestedHeading.key !== entry[0]) return nestedHeading;
  return { key: entry[0], content };
}

function normalizeListLine(line: string): string {
  const trimmed = line.trim();
  if (!trimmed) return "";
  return trimmed
    .replace(/^[-*•\u2022\u2013\u2014]+\s*/, "")
    .replace(/^\d+[.)]\s*/, "")
    .trim();
}

function mergeTermLines(primary: string, secondary: string): string {
  const entries = new Set<string>();
  for (const text of [primary, secondary]) {
    for (const item of text.split(/\n+/)) {
      const cleaned = item.trim();
      if (cleaned) entries.add(cleaned);
    }
  }
  return Array.from(entries).join("\n");
}

function normalizeTermText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function appendTermLine(target: ExtractedItineraryTerms, key: keyof ExtractedItineraryTerms, value: string) {
  const cleaned = normalizeListLine(value);
  if (!cleaned) return;
  const existing = target[key].split(/\n+/).map(normalizeTermText);
  if (!existing.includes(normalizeTermText(cleaned))) target[key] = [target[key], cleaned].filter(Boolean).join("\n");
}

function termColumnKey(value: string): "inclusions" | "exclusions" | null {
  const heading = value.trim().replace(/^\*\*|\*\*$/g, "").replace(/:$/, "").toLowerCase();
  if (/^(?:inclusions?|included|what(?:'|’)s included|included in (?:the )?package)$/.test(heading)) return "inclusions";
  if (/^(?:exclusions?|excluded|not included|what(?:'|’)s excluded|excluded from (?:the )?package)$/.test(heading)) return "exclusions";
  return null;
}

function hasAdjacentTermHeadings(text: string): boolean {
  const lines = text.replace(/\r\n?/g, "\n").split("\n").map((line) => line.trim()).filter(Boolean);
  for (let index = 0; index < lines.length - 1; index += 1) {
    const left = sectionHeading(lines[index] ?? "");
    const right = sectionHeading(lines[index + 1] ?? "");
    if (left && right && left.key !== right.key && ["inclusions", "exclusions"].includes(left.key) && ["inclusions", "exclusions"].includes(right.key)) return true;
  }
  return false;
}

function resolveTermCategoryConflicts(inclusions: string, exclusions: string): { inclusions: string; exclusions: string } {
  const inclusionEntries = [...new Set(inclusions.split(/\n+/).map((value) => value.trim()).filter(Boolean))];
  const exclusionEntries = [...new Set(exclusions.split(/\n+/).map((value) => value.trim()).filter(Boolean))];
  const includedKeys = new Set(inclusionEntries.map(normalizeTermText));
  const finalExclusions = exclusionEntries.filter((value) => !includedKeys.has(normalizeTermText(value)));
  const excludedKeys = new Set(finalExclusions.map(normalizeTermText));
  const finalInclusions = inclusionEntries.filter((value) => !excludedKeys.has(normalizeTermText(value)));
  return {
    inclusions: finalInclusions.join("\n"),
    exclusions: finalExclusions.join("\n"),
  };
}

/** Extracts explicitly labeled package sections. Returns null for ordinary prompt text. */
export function extractItineraryTermsFromText(text: string): ExtractedItineraryTerms | null {
  if (!text.trim()) return null;
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const result: ExtractedItineraryTerms = {
    inclusions: "",
    exclusions: "",
    cancellation_info: "",
    terms_conditions: "",
  };
  let activeKey: keyof ExtractedItineraryTerms | null = null;
  let foundSection = false;
  const parsedTables = extractSupplierDocumentTables(text);
  const tableLines = new Set<number>();

  for (const table of parsedTables) {
    const inclusionColumn = table.columns.findIndex((column) => termColumnKey(column) === "inclusions");
    const exclusionColumn = table.columns.findIndex((column) => termColumnKey(column) === "exclusions");
    if (inclusionColumn < 0 && exclusionColumn < 0) continue;
    foundSection = true;
    for (const row of table.rows) {
      if (inclusionColumn >= 0) appendTermLine(result, "inclusions", row[inclusionColumn] ?? "");
      if (exclusionColumn >= 0) appendTermLine(result, "exclusions", row[exclusionColumn] ?? "");
    }
  }

  for (let index = 0; index < lines.length; index += 1) {
    if (/^\s*\|.*\|\s*$/.test(lines[index] ?? "")) {
      tableLines.add(index);
      continue;
    }
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (tableLines.has(index)) continue;
    if (!line.trim()) continue;
    if (isNoisyOcrLine(line)) {
      activeKey = null;
      continue;
    }

    const heading = sectionHeading(line);
    if (heading) {
      foundSection = true;
      activeKey = heading.key;
      if (heading.content) {
        appendTermLine(result, activeKey, heading.content);
      }
    } else if (activeKey && line.trim()) {
      appendTermLine(result, activeKey, line);
    }
  }

  return foundSection ? result : { inclusions: "", exclusions: "", cancellation_info: "", terms_conditions: "" };
}

/** Uses document terms only when they contain content; otherwise keeps the company defaults. */
export function applyItineraryTermDefaults(
  extracted: ExtractedItineraryTerms | null,
  defaults: ExtractedItineraryTerms,
): ExtractedItineraryTerms {
  return {
    inclusions: extracted?.inclusions.trim() ? extracted.inclusions : defaults.inclusions,
    exclusions: extracted?.exclusions.trim() ? extracted.exclusions : defaults.exclusions,
    cancellation_info: extracted?.cancellation_info.trim() ? extracted.cancellation_info : defaults.cancellation_info,
    terms_conditions: extracted?.terms_conditions.trim() ? extracted.terms_conditions : defaults.terms_conditions,
  };
}

/** Prefer the AI's explicitly structured supplier terms over ambiguous PDF/OCR text flow. */
export function buildSupplierItineraryTerms(
  generated: { inclusions: string[]; exclusions: string[]; cancellation_info?: string | null },
  sourceText: string,
  defaults: ExtractedItineraryTerms,
): ExtractedItineraryTerms {
  const mixedSectionHeading = /(?:inclusions|exclusions)\s*[:：–—-]?\s*(?:inclusions|exclusions)/i.test(sourceText) || hasAdjacentTermHeadings(sourceText);
  const extracted = mixedSectionHeading ? null : extractItineraryTermsFromText(sourceText);
  const hasExplicitSections = Boolean(extracted && (extracted.inclusions.trim() || extracted.exclusions.trim()));
  const inclusionText = generated.inclusions.map((value) => value.trim()).filter(Boolean).join("\n");
  const exclusionText = generated.exclusions.map((value) => value.trim()).filter(Boolean).join("\n");

  if (hasExplicitSections) {
    const resolved = resolveTermCategoryConflicts(extracted!.inclusions, extracted!.exclusions);
    return applyItineraryTermDefaults({
      inclusions: resolved.inclusions,
      exclusions: resolved.exclusions,
      cancellation_info: extracted!.cancellation_info.trim() || generated.cancellation_info?.trim() || "",
      terms_conditions: extracted!.terms_conditions.trim() || "",
    }, defaults);
  }

  const resolved = resolveTermCategoryConflicts(inclusionText, exclusionText);
  return applyItineraryTermDefaults({
    inclusions: resolved.inclusions,
    exclusions: resolved.exclusions,
    cancellation_info: generated.cancellation_info?.trim() || extracted?.cancellation_info || "",
    terms_conditions: extracted?.terms_conditions || "",
  }, defaults);
}