const FORBIDDEN_PATH_PARTS = new Set(["__proto__", "prototype", "constructor"]);

export function getFlowVariable(
  vars: Record<string, unknown>,
  path: string,
): unknown {
  const parts = path.trim().replace(/^vars\./, "").split(".");
  if (
    parts.length === 0 ||
    parts.some((part) => !part || FORBIDDEN_PATH_PARTS.has(part))
  ) {
    return undefined;
  }

  let value: unknown = vars;
  for (const part of parts) {
    if (!value || typeof value !== "object" || !Object.hasOwn(value, part)) {
      return undefined;
    }
    value = (value as Record<string, unknown>)[part];
  }
  return value;
}

function toFlowText(value: unknown): string {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }
  return "";
}

export function interpolateFlowVariables(
  template: string,
  vars: Record<string, unknown>,
): string {
  return template.replace(
    /\{\{\s*(?:vars\.)?([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)*)\s*\}\}/g,
    (_match, path: string) => toFlowText(getFlowVariable(vars, path)),
  );
}
