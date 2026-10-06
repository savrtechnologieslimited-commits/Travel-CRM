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
  if (/\byyyy-mm-dd\b/i.test(config.prompt_text)) return "date";
  return "any";
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
      if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return false;
      const date = new Date(`${trimmed}T00:00:00.000Z`);
      return (
        !Number.isNaN(date.getTime()) &&
        date.toISOString().slice(0, 10) === trimmed
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
