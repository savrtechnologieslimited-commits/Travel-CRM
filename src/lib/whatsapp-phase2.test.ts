import {
  createTravelFlow,
  evaluateTravelFlowMessage,
  renderTemplatePreview,
  resolveTemplateVariables,
  validateTemplate,
} from "./whatsapp-phase2";

describe("whatsapp template management", () => {
  test("validates required template fields", () => {
    expect(validateTemplate({ name: "", body: "Hi {{name}}" })).toEqual({
      valid: false,
      errors: ["Template name is required"],
    });

    expect(
      validateTemplate({
        name: "Welcome",
        language: "en",
        category: "marketing",
        body: "Hi {{name}}",
      }),
    ).toEqual({ valid: true, errors: [] });
  });

  test("renders template preview and resolves variables", () => {
    const preview = renderTemplatePreview(
      {
        name: "Welcome",
        header: "Travel offer",
        body: "Hi {{name}}, your trip to {{destination}} starts on {{travel_date}}.",
        footer: "Thanks!",
      },
      { name: "Amit", destination: "Dubai", travel_date: "2026-11-15" },
    );

    expect(preview).toContain("Hi Amit");
    expect(preview).toContain("Dubai");
    expect(preview).toContain("2026-11-15");
  });

  test("resolves template variables without mutating the original template", () => {
    const template = { body: "Hi {{name}}, budget {{budget}}" };
    const rendered = resolveTemplateVariables(template, { name: "Neha", budget: "₹120000" });

    expect(rendered.body).toBe("Hi Neha, budget ₹120000");
    expect(template.body).toBe("Hi {{name}}, budget {{budget}}");
  });
});

describe("travel flow simulator", () => {
  test("creates a travel flow definition and activates it", () => {
    const flow = createTravelFlow({
      name: "Travel enquiry flow",
      description: "Local deterministic conversion flow",
      active: true,
    });

    expect(flow.name).toBe("Travel enquiry flow");
    expect(flow.active).toBe(true);
    expect(flow.steps[0].id).toBe("start");
  });

  test("handles button branch for international and destination PDF", () => {
    let state = createTravelFlow({ name: "Travel enquiry flow", active: true }).state;
    const start = evaluateTravelFlowMessage(state, "Hi");
    expect(start.reply).toContain("Welcome");

    state = start.state;
    const scope = evaluateTravelFlowMessage(state, "International");
    expect(scope.reply).toContain("Please choose a destination");

    state = scope.state;
    const destination = evaluateTravelFlowMessage(state, "Dubai");
    expect(destination.reply).toContain("Dubai");
    expect(destination.reply).toContain("PDF");
  });

  test("collects travel answers and finishes the flow", () => {
    let state = createTravelFlow({ name: "Travel enquiry flow", active: true }).state;
    state = evaluateTravelFlowMessage(state, "Hi").state;
    state = evaluateTravelFlowMessage(state, "Domestic").state;
    state = evaluateTravelFlowMessage(state, "Goa").state;
    state = evaluateTravelFlowMessage(state, "Amit").state;
    state = evaluateTravelFlowMessage(state, "2026-12-10").state;
    state = evaluateTravelFlowMessage(state, "2").state;
    state = evaluateTravelFlowMessage(state, "1").state;
    state = evaluateTravelFlowMessage(state, "Bengaluru").state;
    state = evaluateTravelFlowMessage(state, "120000").state;
    state = evaluateTravelFlowMessage(state, "Window seat and vegetarian meals").state;

    const result = evaluateTravelFlowMessage(state, "done");
    expect(result.completed).toBe(true);
    expect(result.state.answers.name).toBe("Amit");
    expect(result.state.answers.destination).toBe("Goa");
  });

  test("speaks to agent and stops automation", () => {
    const flow = createTravelFlow({ name: "Travel enquiry flow", active: true });
    const result = evaluateTravelFlowMessage(flow.state, "Speak to Agent");

    expect(result.completed).toBe(true);
    expect(result.state.humanActive).toBe(true);
    expect(result.reply).toContain("travel specialist");
  });
});
