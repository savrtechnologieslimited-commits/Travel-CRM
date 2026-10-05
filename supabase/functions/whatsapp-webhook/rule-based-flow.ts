export type RuleBasedFlow = "WELCOME" | "DESTINATION" | "QUESTIONS" | "COMPLETED";
export type RuleBasedStep =
  | "START"
  | "SCOPE"
  | "DESTINATION"
  | "NAME"
  | "TRAVEL_DATE"
  | "ADULTS"
  | "CHILDREN"
  | "DEPARTURE_CITY"
  | "BUDGET"
  | "SPECIAL_REQUIREMENTS"
  | "COMPLETED";

export type RuleBasedConversation = {
  id: string;
  customer_id: string | null;
  assigned_employee_id: string | null;
  lead_id: string | null;
  enquiry_id: string | null;
  conversation_mode: "AI_ACTIVE" | "HUMAN_ACTIVE";
  current_flow: RuleBasedFlow;
  current_step: RuleBasedStep;
};

export type RuleBasedRequirements = {
  destination_id: string | null;
  destination_text: string | null;
  scope: "domestic" | "international" | null;
  name: string | null;
  travel_start_date: string | null;
  adults: number | null;
  children: number | null;
  departure_city: string | null;
  approximate_budget: number | null;
  special_requirements: string | null;
  document_status: "sent" | "unavailable" | "not_checked";
};

export type RuleBasedDestination = {
  id: string;
  name: string;
  scope: "domestic" | "international";
  is_active: boolean;
};

export type RuleBasedReply = {
  text: string;
  buttons?: string[];
  list?: { id: string; title: string; description?: string }[];
  document?: { url: string; name?: string | null };
};

export type RuleBasedFlowOperations = {
  getConversation: (conversationId: string) => Promise<RuleBasedConversation>;
  getRequirements: (conversationId: string) => Promise<RuleBasedRequirements>;
  saveConversation: (input: {
    conversationId: string;
    patch: Partial<Pick<RuleBasedConversation, "assigned_employee_id" | "lead_id" | "enquiry_id" | "conversation_mode" | "current_flow" | "current_step">>;
  }) => Promise<void>;
  saveRequirements: (input: {
    conversationId: string;
    patch: Partial<RuleBasedRequirements>;
  }) => Promise<void>;
  listDestinations: (scope: "domestic" | "international") => Promise<RuleBasedDestination[]>;
  findDestinationEmployee: (destinationId: string | null) => Promise<string | null>;
  createEnquiry: (input: {
    customerId: string | null;
    destinationId: string | null;
    assignedEmployeeId: string | null;
    source: "WHATSAPP";
  }) => Promise<{ id: string; enquiry_number: string }>;
  upsertLead: (input: {
    conversationId: string;
    customerId: string | null;
    enquiryId: string;
    destinationId: string | null;
    assignedEmployeeId: string | null;
    customerName: string | null;
  }) => Promise<{ id: string }>;
  updateCustomerName: (customerId: string, name: string) => Promise<void>;
  notifyAssignedEmployee?: (input: { employeeId: string; conversationId: string; enquiryNumber: string }) => Promise<void>;
  findDestinationDocument: (destinationId: string) => Promise<{ url: string; name?: string | null } | null>;
  sendReply: (conversationId: string, reply: RuleBasedReply) => Promise<void>;
};

const QUESTION_COPY: Record<RuleBasedStep, string> = {
  START: "Welcome! How can we help you?",
  SCOPE: "Please choose Domestic or International.",
  DESTINATION: "Please choose a destination from the list.",
  NAME: "What is your name?",
  TRAVEL_DATE: "What is your travel date? Please use YYYY-MM-DD.",
  ADULTS: "How many adults are travelling?",
  CHILDREN: "How many children are travelling?",
  DEPARTURE_CITY: "Which city will you depart from?",
  BUDGET: "What is your approximate budget in INR?",
  SPECIAL_REQUIREMENTS: "Do you have any special requirements? Reply None if not.",
  COMPLETED: "Thank you. Your travel request has been recorded.",
};

function normalise(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function isNewRequest(value: string): boolean {
  return /^(new|another|start)\s+(trip|request|enquiry)|new enquiry|start over$/i.test(normalise(value));
}

function isAgentRequest(value: string): boolean {
  return /speak\s+to\s+(an?\s+)?agent|human|call me/i.test(normalise(value));
}

function isGreeting(value: string): boolean {
  return /^(hi|hello|hey|namaste|start|menu)[!. ]*$/i.test(normalise(value));
}

function parseDate(value: string): string | null {
  const text = normalise(value);
  const match = text.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && date.getUTCDate() === day
    ? `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`
    : null;
}

function parseNonNegativeInteger(value: string): number | null {
  const match = normalise(value).match(/^\d+$/);
  return match ? Number(match[0]) : null;
}

function parseBudget(value: string): number | null {
  const match = normalise(value).replace(/,/g, "").match(/^(?:inr|rs\.?|₹\s*)?\s*(\d+(?:\.\d+)?)\s*(k|l|lakh|lakhs)?$/i);
  if (!match) return null;
  const multiplier = match[2]?.toLowerCase() === "k" ? 1_000 : match[2] ? 100_000 : 1;
  return Number(match[1]) * multiplier;
}

async function ensureJourney(
  conversation: RuleBasedConversation,
  requirements: RuleBasedRequirements,
  operations: RuleBasedFlowOperations,
): Promise<{ conversation: RuleBasedConversation; requirements: RuleBasedRequirements; enquiryNumber?: string }> {
  if (conversation.enquiry_id) return { conversation, requirements };
  const assignedEmployeeId = await operations.findDestinationEmployee(requirements.destination_id);
  const enquiry = await operations.createEnquiry({
    customerId: conversation.customer_id,
    destinationId: requirements.destination_id,
    assignedEmployeeId,
    source: "WHATSAPP",
  });
  const lead = await operations.upsertLead({
    conversationId: conversation.id,
    customerId: conversation.customer_id,
    enquiryId: enquiry.id,
    destinationId: requirements.destination_id,
    assignedEmployeeId,
    customerName: requirements.name,
  });
  await operations.saveConversation({
    conversationId: conversation.id,
    patch: {
      assigned_employee_id: assignedEmployeeId,
      enquiry_id: enquiry.id,
      lead_id: lead.id,
    },
  });
  if (assignedEmployeeId && enquiry.enquiry_number && operations.notifyAssignedEmployee) {
    try {
      await operations.notifyAssignedEmployee({
        employeeId: assignedEmployeeId,
        conversationId: conversation.id,
        enquiryNumber: enquiry.enquiry_number,
      });
    } catch {
      // Notification delivery is ancillary; it must not interrupt the
      // deterministic customer journey or canonical enquiry creation.
    }
  }
  return {
    conversation: { ...conversation, assigned_employee_id: assignedEmployeeId, enquiry_id: enquiry.id, lead_id: lead.id },
    requirements,
    enquiryNumber: enquiry.enquiry_number,
  };
}

export async function processRuleBasedWhatsAppMessage(
  conversationId: string,
  body: string,
  operations: RuleBasedFlowOperations,
): Promise<{ flow: RuleBasedFlow; step: RuleBasedStep; enquiryNumber?: string }> {
  let conversation = await operations.getConversation(conversationId);
  let requirements = await operations.getRequirements(conversationId);
  const text = body.trim();

  if (conversation.conversation_mode === "HUMAN_ACTIVE") {
    return { flow: conversation.current_flow, step: conversation.current_step };
  }

  if (isNewRequest(text)) {
    conversation = { ...conversation, enquiry_id: null, lead_id: null, current_flow: "WELCOME", current_step: "START" };
    requirements = { ...requirements, destination_id: null, destination_text: null, scope: null, name: null, travel_start_date: null, adults: null, children: null, departure_city: null, approximate_budget: null, special_requirements: null, document_status: "not_checked" };
    await operations.saveConversation({ conversationId, patch: { enquiry_id: null, lead_id: null, current_flow: "WELCOME", current_step: "START" } });
    await operations.saveRequirements({ conversationId, patch: requirements });
  }

  if (isAgentRequest(text)) {
    const journey = await ensureJourney(conversation, requirements, operations);
    await operations.saveConversation({ conversationId, patch: { conversation_mode: "HUMAN_ACTIVE", current_flow: "COMPLETED", current_step: "COMPLETED" } });
    await operations.sendReply(conversationId, { text: "A travel specialist will be with you shortly." });
    return { flow: "COMPLETED", step: "COMPLETED", enquiryNumber: journey.enquiryNumber };
  }

  if (conversation.current_step === "START" || (conversation.current_flow === "WELCOME" && isGreeting(text))) {
    await operations.saveConversation({ conversationId, patch: { current_flow: "WELCOME", current_step: "SCOPE" } });
    await operations.sendReply(conversationId, { text: QUESTION_COPY.START, buttons: ["Domestic", "International", "Speak to Agent"] });
    return { flow: "WELCOME", step: "SCOPE" };
  }

  const lower = normalise(text);
  if (conversation.current_step === "SCOPE") {
    const scope = lower === "domestic" || lower === "international" ? lower : null;
    if (!scope) {
      await operations.sendReply(conversationId, { text: QUESTION_COPY.SCOPE, buttons: ["Domestic", "International", "Speak to Agent"] });
      return { flow: "WELCOME", step: "SCOPE" };
    }
    const destinations = await operations.listDestinations(scope);
    await operations.saveRequirements({ conversationId, patch: { scope } });
    await operations.saveConversation({ conversationId, patch: { current_flow: "DESTINATION", current_step: "DESTINATION" } });
    await operations.sendReply(conversationId, destinations.length
      ? { text: `Please choose a ${scope} destination:`, list: destinations.map((item) => ({ id: item.id, title: item.name })) }
      : { text: `No ${scope} destinations are currently available.` });
    return { flow: "DESTINATION", step: "DESTINATION" };
  }

  if (conversation.current_step === "DESTINATION") {
    const destinations = await operations.listDestinations(requirements.scope ?? "domestic");
    const destination = destinations.find((item) => normalise(item.name) === lower || item.id === text);
    if (!destination) {
      await operations.sendReply(conversationId, { text: QUESTION_COPY.DESTINATION });
      return { flow: "DESTINATION", step: "DESTINATION" };
    }
    requirements = { ...requirements, destination_id: destination.id, destination_text: destination.name, document_status: "not_checked" };
    const journey = await ensureJourney(conversation, requirements, operations);
    await operations.saveRequirements({ conversationId, patch: requirements });
    const document = await operations.findDestinationDocument(destination.id);
    if (document) {
      await operations.sendReply(conversationId, {
        text: `Here is information for ${destination.name}.`,
        document,
      });
      requirements = { ...requirements, document_status: "sent" };
    } else {
      requirements = { ...requirements, document_status: "unavailable" };
    }
    await operations.saveRequirements({ conversationId, patch: requirements });
    await operations.saveConversation({ conversationId, patch: { current_flow: "QUESTIONS", current_step: "NAME" } });
    await operations.sendReply(conversationId, { text: `Your enquiry ${journey.enquiryNumber} is started. ${QUESTION_COPY.NAME}` });
    return { flow: "QUESTIONS", step: "NAME", enquiryNumber: journey.enquiryNumber };
  }

  const journey = await ensureJourney(conversation, requirements, operations);
  conversation = journey.conversation;
  const next: Record<RuleBasedStep, RuleBasedStep> = { NAME: "TRAVEL_DATE", TRAVEL_DATE: "ADULTS", ADULTS: "CHILDREN", CHILDREN: "DEPARTURE_CITY", DEPARTURE_CITY: "BUDGET", BUDGET: "SPECIAL_REQUIREMENTS", SPECIAL_REQUIREMENTS: "COMPLETED", START: "SCOPE", SCOPE: "DESTINATION", DESTINATION: "NAME", COMPLETED: "COMPLETED" };
  let patch: Partial<RuleBasedRequirements> = {};
  if (conversation.current_step === "NAME") {
    if (!text) return { flow: "QUESTIONS", step: "NAME" };
    patch = { name: text };
    await operations.updateCustomerName(conversation.customer_id!, text);
    await operations.upsertLead({ conversationId, customerId: conversation.customer_id, enquiryId: conversation.enquiry_id!, destinationId: requirements.destination_id, assignedEmployeeId: conversation.assigned_employee_id, customerName: text });
  } else if (conversation.current_step === "TRAVEL_DATE") patch = { travel_start_date: parseDate(text) };
  else if (conversation.current_step === "ADULTS") patch = { adults: parseNonNegativeInteger(text) };
  else if (conversation.current_step === "CHILDREN") patch = { children: parseNonNegativeInteger(text) };
  else if (conversation.current_step === "DEPARTURE_CITY") patch = { departure_city: text || null };
  else if (conversation.current_step === "BUDGET") patch = { approximate_budget: parseBudget(text) };
  else if (conversation.current_step === "SPECIAL_REQUIREMENTS") patch = { special_requirements: lower === "none" ? null : text };

  const value = Object.values(patch)[0];
  if (value === null && ["TRAVEL_DATE", "ADULTS", "CHILDREN", "BUDGET"].includes(conversation.current_step)) {
    await operations.sendReply(conversationId, { text: QUESTION_COPY[conversation.current_step] });
    return { flow: "QUESTIONS", step: conversation.current_step };
  }
  requirements = { ...requirements, ...patch };
  await operations.saveRequirements({ conversationId, patch });
  const nextStep = next[conversation.current_step];
  const nextFlow = nextStep === "COMPLETED" ? "COMPLETED" : "QUESTIONS";
  await operations.saveConversation({ conversationId, patch: { current_flow: nextFlow, current_step: nextStep } });
  await operations.sendReply(conversationId, { text: nextStep === "COMPLETED" ? QUESTION_COPY.COMPLETED : QUESTION_COPY[nextStep] });
  return { flow: nextFlow, step: nextStep, enquiryNumber: journey.enquiryNumber };
}