import { describe, expect, it } from "vitest";
import {
  getFlowVariable,
  interpolateFlowVariables,
} from "./flow-vars";

describe("flow variable paths", () => {
  const vars = {
    name: "Asha",
    destination: { pdf_url: "https://crm.example/destination.pdf" },
  };

  it("resolves flat and nested flow variables with or without the vars prefix", () => {
    expect(getFlowVariable(vars, "destination.pdf_url")).toBe(
      "https://crm.example/destination.pdf",
    );
    expect(
      interpolateFlowVariables(
        "Hello {{vars.name}}: {{destination.pdf_url}}",
        vars,
      ),
    ).toBe("Hello Asha: https://crm.example/destination.pdf");
  });

  it("does not traverse inherited or prototype properties", () => {
    expect(getFlowVariable(vars, "__proto__.constructor")).toBeUndefined();
    expect(getFlowVariable(vars, "destination.toString")).toBeUndefined();
  });

  it("renders missing and non-scalar values as empty strings", () => {
    expect(
      interpolateFlowVariables("{{missing}}/{{destination}}", vars),
    ).toBe("/");
  });
});
