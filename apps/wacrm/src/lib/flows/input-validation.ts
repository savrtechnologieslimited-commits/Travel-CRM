import type { CollectInputNodeConfig } from "./types";

export type CollectInputValidation =
  | "any"
  | "email"
  | "phone"
  | "date"
  | "regex";

export function resolveCollectInputValidation(
  config: Pick<CollectInputNodeConfig, "prompt_text" | "validation">,
): CollectInputValidation {
  if (
    config.validation === "any" ||
    config.validation === "email" ||
    config.validation === "phone" ||
    config.validation === "date" ||
    config.validation === "regex"
  ) {
    return config.validation;
  }

  // Keep existing flows working: their prompt may already specify a
  // machine-readable format even though validation was not configured.
  if (/\b(?:dd-mm-yyyy|yyyy-mm-dd)\b/i.test(config.prompt_text)) {
    return "date";
  }
  return "any";
}

export function formatCollectInputPrompt(
  prompt: string,
  config: Pick<CollectInputNodeConfig, "prompt_text" | "validation">,
): string {
  if (resolveCollectInputValidation(config) !== "date") return prompt;
  return prompt
    .replace(/\byyyy-mm-dd\b/gi, "DD-MM-YYYY")
    .replace(
      /\b(\d{4})-(\d{2})-(\d{2})\b/g,
      (_match, year: string, month: string, day: string) =>
        `${day}-${month}-${year}`,
    );
}

export function isValidCollectInput(
  value: string,
  config: Pick<
    CollectInputNodeConfig,
    "prompt_text" | "validation" | "regex"
  >,
): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;

  switch (resolveCollectInputValidation(config)) {
    case "any":
      return true;
    case "email":
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
    case "phone": {
      if (!/^\+?[\d\s().-]+$/.test(trimmed)) return false;
      const digits = trimmed.replace(/\D/g, "");
      return digits.length >= 7 && digits.length <= 15;
    }
    case "date": {
      const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(trimmed);
      if (!match) return false;
      const [, day, month, year] = match;
      const date = new Date(
        `${year}-${month}-${day}T00:00:00.000Z`,
      );
      return (
        !Number.isNaN(date.getTime()) &&
        date.toISOString().slice(0, 10) === `${year}-${month}-${day}`
      );
    }
    case "regex":
      if (!config.regex) return false;
      try {
        return new RegExp(config.regex).test(trimmed);
      } catch {
        return false;
      }
  }
}
