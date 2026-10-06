import { describe, expect, it } from "vitest";
import {
  formatCollectInputPrompt,
  isValidCollectInput,
  resolveCollectInputValidation,
} from "./input-validation";

describe("collect input validation", () => {
  it("infers the DD-MM-YYYY format when a prompt asks for it", () => {
    expect(
      resolveCollectInputValidation({
        prompt_text: "Reply in DD-MM-YYYY format, for example: 25-10-2026.",
      }),
    ).toBe("date");
    expect(
      isValidCollectInput("25-10-2026", {
        prompt_text: "Reply in DD-MM-YYYY format.",
      }),
    ).toBe(true);
    expect(
      isValidCollectInput("next Friday", {
        prompt_text: "Reply in DD-MM-YYYY format.",
      }),
    ).toBe(false);
  });

  it("updates legacy ISO prompts and examples to DD-MM-YYYY", () => {
    const config = {
      prompt_text:
        "Reply in YYYY-MM-DD format, for example: 2026-10-25.",
      validation: "date" as const,
    };
    expect(formatCollectInputPrompt(config.prompt_text, config)).toBe(
      "Reply in DD-MM-YYYY format, for example: 25-10-2026.",
    );
  });

  it("rejects invalid calendar dates and other date formats", () => {
    const config = { prompt_text: "", validation: "date" as const };
    expect(isValidCollectInput("29-02-2026", config)).toBe(false);
    expect(isValidCollectInput("29-02-2024", config)).toBe(true);
    expect(isValidCollectInput("2024-02-29", config)).toBe(false);
    expect(isValidCollectInput("10/25/2026", config)).toBe(false);
  });

  it("validates email, phone, and configured regular expressions", () => {
    expect(
      isValidCollectInput("traveller@example.com", {
        prompt_text: "",
        validation: "email",
      }),
    ).toBe(true);
    expect(
      isValidCollectInput("not-an-email", {
        prompt_text: "",
        validation: "email",
      }),
    ).toBe(false);
    expect(
      isValidCollectInput("+1 (212) 555-1234", {
        prompt_text: "",
        validation: "phone",
      }),
    ).toBe(true);
    expect(
      isValidCollectInput("letters only", {
        prompt_text: "",
        validation: "phone",
      }),
    ).toBe(false);
    expect(
      isValidCollectInput("ABC-123", {
        prompt_text: "",
        validation: "regex",
        regex: "^[A-Z]{3}-\\d{3}$",
      }),
    ).toBe(true);
    expect(
      isValidCollectInput("anything", {
        prompt_text: "",
        validation: "regex",
        regex: "[",
      }),
    ).toBe(false);
  });

  it("accepts non-empty text by default and rejects blank replies", () => {
    expect(isValidCollectInput("some reply", { prompt_text: "" })).toBe(true);
    expect(isValidCollectInput("   ", { prompt_text: "" })).toBe(false);
  });
});
