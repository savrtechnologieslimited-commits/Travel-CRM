import { escapeEmailHtml, toEmailHtml } from "./email-content";

export type SupplierEmailTemplate = {
  subject: string;
  body: string;
  signature: string;
};

export const DEFAULT_SUPPLIER_EMAIL_SIGNATURE = [
  "Best regards,",
  "{{assigned_team_member}}",
  "SAVR Travels",
].join("\n");

export const DEFAULT_SUPPLIER_EMAIL_TEMPLATE: SupplierEmailTemplate = {
  subject: "Enquiry for {{client_name}} — {{destination}}",
  body: [
    "Dear {{supplier_name}},",
    "",
    "We have a new enquiry for your review.",
    "",
    "Client: {{client_name}}",
    "Supplier contact: {{contact_name}}",
    "Lead name: {{lead_name}}",
    "CRM Lead ID: {{crm_lead_id}}",
    "Team member assigned to lead: {{assigned_team_member}}",
    "",
    "Destination: {{destination}}",
    "Trip dates: {{trip_start_date}} to {{trip_end_date}}",
    "",
    "Requirements:",
    "{{client_requirement}}",
  ].join("\n"),
  signature: DEFAULT_SUPPLIER_EMAIL_SIGNATURE,
};

export const SUPPLIER_EMAIL_PLACEHOLDERS = [
  { label: "Supplier name", token: "supplier_name" },
  { label: "Supplier contact name", token: "contact_name" },
  { label: "Client name", token: "client_name" },
  { label: "Lead name", token: "lead_name" },
  { label: "CRM Lead ID", token: "crm_lead_id" },
  { label: "Team member assigned to lead", token: "assigned_team_member" },
  { label: "Destination", token: "destination" },
  { label: "Trip start date", token: "trip_start_date" },
  { label: "Trip end date", token: "trip_end_date" },
  { label: "Client requirement", token: "client_requirement" },
] as const;

export type SupplierEmailPlaceholder = (typeof SUPPLIER_EMAIL_PLACEHOLDERS)[number]["token"];

export function readSupplierEmailTemplate(value: unknown): SupplierEmailTemplate {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return DEFAULT_SUPPLIER_EMAIL_TEMPLATE;
  }
  const template = value as Partial<Record<keyof SupplierEmailTemplate, unknown>>;
  const body =
    typeof template.body === "string" ? template.body : DEFAULT_SUPPLIER_EMAIL_TEMPLATE.body;
  const hasSignature = typeof template.signature === "string";
  const legacySignature = `\n\n${DEFAULT_SUPPLIER_EMAIL_SIGNATURE}`;
  return {
    subject:
      typeof template.subject === "string"
        ? template.subject
        : DEFAULT_SUPPLIER_EMAIL_TEMPLATE.subject,
    body:
      !hasSignature && body.endsWith(legacySignature)
        ? body.slice(0, -legacySignature.length)
        : body,
    signature:
      typeof template.signature === "string"
        ? template.signature
        : DEFAULT_SUPPLIER_EMAIL_SIGNATURE,
  };
}

export function renderSupplierEmailTemplate(
  template: SupplierEmailTemplate,
  values: Record<SupplierEmailPlaceholder, string>,
): SupplierEmailTemplate {
  const render = (text: string, richText: boolean) =>
    text.replace(/\{\{([a-z_]+)\}\}/g, (placeholder, name: string) =>
      name in values
        ? richText
          ? escapeEmailHtml(values[name as SupplierEmailPlaceholder])
          : values[name as SupplierEmailPlaceholder]
        : placeholder,
    );
  return {
    subject: render(template.subject, false),
    body: render(
      template.body,
      /<(?:a|b|blockquote|br|div|em|h[1-3]|hr|i|img|li|ol|p|span|strong|u|ul)\b/i.test(
        template.body,
      ),
    ),
    signature: render(
      template.signature,
      /<(?:a|b|blockquote|br|div|em|h[1-3]|hr|i|img|li|ol|p|span|strong|u|ul)\b/i.test(
        template.signature,
      ),
    ),
  };
}

export function appendSupplierEmailSignature(body: string, signature: string): string {
  const trimmedSignature = toEmailHtml(signature.trim());
  if (!trimmedSignature) return body;
  const bodyHtml = toEmailHtml(body.trimEnd());
  const trimmedBody = bodyHtml.trimEnd();
  return trimmedBody ? `${trimmedBody}<br><br>${trimmedSignature}` : trimmedSignature;
}
