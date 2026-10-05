export type TemplateStatus =
  | "LOCAL_DRAFT"
  | "META_APPROVED"
  | "META_REJECTED"
  | "SYNC_REQUIRED";

export type TemplateDefinition = {
  id?: string;
  name: string;
  language?: string;
  category?: string;
  status?: TemplateStatus;
  header?: string;
  body: string;
  footer?: string;
  variables?: string[];
  buttons?: string[];
};

export type TemplateValidationResult = {
  valid: boolean;
  errors: string[];
};

export function validateTemplate(template: Partial<TemplateDefinition>): TemplateValidationResult {
  const errors: string[] = [];

  if (!template.name?.trim()) {
    errors.push("Template name is required");
  }

  if (!template.body?.trim()) {
    errors.push("Template body is required");
  }

  return { valid: errors.length === 0, errors };
}

export function resolveTemplateVariables(
  template: Pick<TemplateDefinition, "header" | "body" | "footer">,
  values: Record<string, string | number | boolean | null | undefined>,
): Pick<TemplateDefinition, "header" | "body" | "footer"> {
  const render = (input?: string) => {
    if (!input) return input;
    return input.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => {
      const value = values[key];
      if (value === null || value === undefined) return "";
      return String(value);
    });
  };

  return {
    header: render(template.header),
    body: render(template.body),
    footer: render(template.footer),
  };
}

export function renderTemplatePreview(
  template: Partial<TemplateDefinition>,
  values: Record<string, string | number | boolean | null | undefined> = {},
): string {
  const resolved = resolveTemplateVariables(
    {
      header: template.header,
      body: template.body ?? "",
      footer: template.footer,
    },
    values,
  );

  return [resolved.header, resolved.body, resolved.footer]
    .filter((section) => Boolean(section?.trim()))
    .join("\n\n");
}

export type TravelFlowStepId =
  | "start"
  | "scope"
  | "destination"
  | "name"
  | "travel_date"
  | "adults"
  | "children"
  | "departure_city"
  | "budget"
  | "special_requirements"
  | "completed";

export type TravelFlowStep = {
  id: TravelFlowStepId;
  label: string;
  type: "trigger" | "action" | "question" | "condition" | "end";
};

export type TravelFlowState = {
  currentStep: TravelFlowStepId;
  answers: Record<string, string | number | null | undefined>;
  scope: "domestic" | "international" | null;
  destination: string | null;
  humanActive: boolean;
  completed: boolean;
};

export type TravelFlowDefinition = {
  id: string;
  name: string;
  description: string;
  active: boolean;
  state: TravelFlowState;
  steps: TravelFlowStep[];
};

export const DEFAULT_TRAVEL_FLOW_STEPS: TravelFlowStep[] = [
  { id: "start", label: "Start", type: "trigger" },
  { id: "scope", label: "Domestic / International", type: "condition" },
  { id: "destination", label: "Destination", type: "action" },
  { id: "name", label: "Name", type: "question" },
  { id: "travel_date", label: "Travel date", type: "question" },
  { id: "adults", label: "Adults", type: "question" },
  { id: "children", label: "Children", type: "question" },
  { id: "departure_city", label: "Departure city", type: "question" },
  { id: "budget", label: "Budget", type: "question" },
  { id: "special_requirements", label: "Requirements", type: "question" },
  { id: "completed", label: "Completed", type: "end" },
];

export function createTravelFlow(options: {
  id?: string;
  name: string;
  description?: string;
  active?: boolean;
}): TravelFlowDefinition {
  const state: TravelFlowState = {
    currentStep: "start",
    answers: {},
    scope: null,
    destination: null,
    humanActive: false,
    completed: false,
  };

  return {
    id: options.id ?? `flow-${Math.random().toString(36).slice(2, 10)}`,
    name: options.name,
    description: options.description ?? "Local deterministic travel flow for WhatsApp.",
    active: options.active ?? true,
    state,
    steps: DEFAULT_TRAVEL_FLOW_STEPS,
  };
}

function normaliseChoice(value: string): string {
  return value.trim().toLowerCase();
}

export function evaluateTravelFlowMessage(
  state: TravelFlowState,
  message: string,
): { state: TravelFlowState; reply: string; completed: boolean } {
  const text = message.trim();
  const nextState: TravelFlowState = { ...state, answers: { ...state.answers } };

  const isGreeting = /^(hi|hello|hey|namaste|start)$/i.test(text);
  const isAgentRequest = /speak\s+to\s+(an?\s+)?agent|human/i.test(text);

  if (isAgentRequest) {
    return {
      state: {
        ...nextState,
        currentStep: "completed",
        humanActive: true,
        completed: true,
      },
      reply: "A travel specialist will be with you shortly.",
      completed: true,
    };
  }

  if (nextState.currentStep === "start") {
    if (isGreeting) {
      nextState.currentStep = "scope";
      return {
        state: nextState,
        reply: "Welcome! Please choose Domestic or International.",
        completed: false,
      };
    }

    return {
      state: nextState,
      reply: "Welcome! Please choose Domestic or International.",
      completed: false,
    };
  }

  if (nextState.currentStep === "scope") {
    const choice = normaliseChoice(text);
    if (choice === "domestic" || choice === "international") {
      nextState.scope = choice as "domestic" | "international";
      nextState.currentStep = "destination";
      return {
        state: nextState,
        reply: `Please choose a destination from the ${choice} list.`,
        completed: false,
      };
    }

    return {
      state: nextState,
      reply: "Please choose Domestic or International.",
      completed: false,
    };
  }

  if (nextState.currentStep === "destination") {
    const destination = text || "your destination";
    nextState.destination = destination;
    nextState.answers.destination = destination;
    nextState.currentStep = "name";
    return {
      state: nextState,
      reply: `Here is the ${destination} PDF. What is your name?`,
      completed: false,
    };
  }

  if (nextState.currentStep === "name") {
    nextState.answers.name = text;
    nextState.currentStep = "travel_date";
    return {
      state: nextState,
      reply: "What is your travel date? Please use YYYY-MM-DD.",
      completed: false,
    };
  }

  if (nextState.currentStep === "travel_date") {
    nextState.answers.travel_date = text;
    nextState.currentStep = "adults";
    return {
      state: nextState,
      reply: "How many adults are travelling?",
      completed: false,
    };
  }

  if (nextState.currentStep === "adults") {
    nextState.answers.adults = Number(text) || text;
    nextState.currentStep = "children";
    return {
      state: nextState,
      reply: "How many children are travelling?",
      completed: false,
    };
  }

  if (nextState.currentStep === "children") {
    nextState.answers.children = Number(text) || text;
    nextState.currentStep = "departure_city";
    return {
      state: nextState,
      reply: "Which city will you depart from?",
      completed: false,
    };
  }

  if (nextState.currentStep === "departure_city") {
    nextState.answers.departure_city = text;
    nextState.currentStep = "budget";
    return {
      state: nextState,
      reply: "What is your approximate budget in INR?",
      completed: false,
    };
  }

  if (nextState.currentStep === "budget") {
    nextState.answers.budget = text;
    nextState.currentStep = "special_requirements";
    return {
      state: nextState,
      reply: "Do you have any special requirements? Reply None if not.",
      completed: false,
    };
  }

  if (nextState.currentStep === "special_requirements") {
    nextState.answers.special_requirements = text === "None" ? null : text;
    nextState.currentStep = "completed";
    nextState.completed = true;
    return {
      state: nextState,
      reply: `Thank you. Your travel request has been recorded for ${nextState.answers.name ?? "the customer"}.`,
      completed: true,
    };
  }

  return {
    state: nextState,
    reply: "Thank you. Your travel request has been recorded.",
    completed: true,
  };
}
