/*
 * Adapted from WACRM's src/lib/whatsapp/interactive.ts.
 * Copyright (c) 2026 Arnas Donauskas — MIT License (see WACRM LICENSE).
 * Kept runtime-neutral so the Travel CRM app and Supabase Edge Functions
 * share the same Meta interactive-message validation.
 */

export interface InteractiveButton {
  id: string;
  title: string;
}

export interface InteractiveButtonsPayload {
  kind: "buttons";
  body: string;
  header?: string;
  footer?: string;
  buttons: InteractiveButton[];
}

export interface InteractiveListRow {
  id: string;
  title: string;
  description?: string;
}

export interface InteractiveListSection {
  title?: string;
  rows: InteractiveListRow[];
}

export interface InteractiveListPayload {
  kind: "list";
  body: string;
  header?: string;
  footer?: string;
  button_label: string;
  sections: InteractiveListSection[];
}

export type InteractiveMessagePayload =
  | InteractiveButtonsPayload
  | InteractiveListPayload;

export type InteractiveValidation =
  | { ok: true }
  | { ok: false; error: string };

const LIMITS = {
  body: 1024,
  header: 60,
  footer: 60,
  buttonTitle: 20,
  listButtonLabel: 20,
  listRowTitle: 24,
  listRowDescription: 72,
  buttons: 3,
  listSections: 10,
  listRows: 10,
} as const;

function fail(error: string): InteractiveValidation {
  return { ok: false, error };
}

function validateOptionalText(
  value: unknown,
  name: string,
  limit: number,
): InteractiveValidation {
  if (value !== undefined && value !== null && typeof value !== "string") {
    return fail(`${name} must be text.`);
  }
  if (typeof value === "string" && value.length > limit) {
    return fail(`${name} exceeds the ${limit}-character limit.`);
  }
  return { ok: true };
}

export function validateInteractivePayload(
  payload: unknown,
): InteractiveValidation {
  if (!payload || typeof payload !== "object") {
    return fail("Interactive message payload is required.");
  }

  const candidate = payload as Partial<InteractiveMessagePayload>;
  if (typeof candidate.body !== "string" || candidate.body.trim() === "") {
    return fail("Interactive message body text is required.");
  }
  if (candidate.body.length > LIMITS.body) {
    return fail(`Body text exceeds the ${LIMITS.body}-character limit.`);
  }
  for (const [value, name, limit] of [
    [candidate.header, "Header", LIMITS.header],
    [candidate.footer, "Footer", LIMITS.footer],
  ] as const) {
    const result = validateOptionalText(value, name, limit);
    if (!result.ok) return result;
  }

  if (candidate.kind === "buttons") {
    const buttons = (candidate as Partial<InteractiveButtonsPayload>).buttons;
    if (!Array.isArray(buttons) || buttons.length < 1 || buttons.length > LIMITS.buttons) {
      return fail(`A reply-button message requires 1–${LIMITS.buttons} buttons.`);
    }
    const ids = new Set<string>();
    for (const button of buttons) {
      if (!button || typeof button.id !== "string" || !button.id.trim()) {
        return fail("Every button needs an id.");
      }
      if (ids.has(button.id)) return fail(`Duplicate button id "${button.id}".`);
      ids.add(button.id);
      if (typeof button.title !== "string" || !button.title.trim()) {
        return fail("Every button needs a label.");
      }
      if (button.title.length > LIMITS.buttonTitle) {
        return fail(`Button label exceeds the ${LIMITS.buttonTitle}-character limit.`);
      }
    }
    return { ok: true };
  }

  if (candidate.kind === "list") {
    const list = candidate as Partial<InteractiveListPayload>;
    if (typeof list.button_label !== "string" || !list.button_label.trim()) {
      return fail("The list needs a button label.");
    }
    if (list.button_label.length > LIMITS.listButtonLabel) {
      return fail(`List button label exceeds the ${LIMITS.listButtonLabel}-character limit.`);
    }
    if (!Array.isArray(list.sections) || list.sections.length < 1 || list.sections.length > LIMITS.listSections) {
      return fail(`A list requires 1–${LIMITS.listSections} sections.`);
    }

    const ids = new Set<string>();
    let rowCount = 0;
    for (const section of list.sections) {
      if (!section || !Array.isArray(section.rows)) {
        return fail("Every list section needs rows.");
      }
      for (const row of section.rows) {
        rowCount += 1;
        if (!row || typeof row.id !== "string" || !row.id.trim()) {
          return fail("Every list row needs an id.");
        }
        if (ids.has(row.id)) return fail(`Duplicate list row id "${row.id}".`);
        ids.add(row.id);
        if (typeof row.title !== "string" || !row.title.trim()) {
          return fail("Every list row needs a title.");
        }
        if (row.title.length > LIMITS.listRowTitle) {
          return fail(`List row title exceeds the ${LIMITS.listRowTitle}-character limit.`);
        }
        const description = validateOptionalText(
          row.description,
          "List row description",
          LIMITS.listRowDescription,
        );
        if (!description.ok) return description;
      }
    }
    if (rowCount < 1 || rowCount > LIMITS.listRows) {
      return fail(`A list requires 1–${LIMITS.listRows} rows in total.`);
    }
    return { ok: true };
  }

  return fail("Interactive message kind must be buttons or list.");
}
