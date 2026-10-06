import { describe, expect, test } from "bun:test";
import {
  appendSupplierEmailSignature,
  DEFAULT_SUPPLIER_EMAIL_TEMPLATE,
  readSupplierEmailTemplate,
  renderSupplierEmailTemplate,
} from "./supplier-email-template";

describe("supplier email templates", () => {
  test("uses the default template when no saved value exists", () => {
    expect(readSupplierEmailTemplate(null)).toEqual(DEFAULT_SUPPLIER_EMAIL_TEMPLATE);
  });

  test("migrates the previous inline default signature to its own field", () => {
    expect(
      readSupplierEmailTemplate({
        subject: DEFAULT_SUPPLIER_EMAIL_TEMPLATE.subject,
        body: `${DEFAULT_SUPPLIER_EMAIL_TEMPLATE.body}\n\n${DEFAULT_SUPPLIER_EMAIL_TEMPLATE.signature}`,
      }),
    ).toEqual(DEFAULT_SUPPLIER_EMAIL_TEMPLATE);
  });

  test("renders supported placeholders and keeps unknown placeholders editable", () => {
    const rendered = renderSupplierEmailTemplate(
      {
        subject: "{{client_name}} — {{destination}}",
        body: "{{supplier_name}} / {{custom_field}}",
        signature: "Regards,\n{{assigned_team_member}}",
      },
      {
        supplier_name: "Coastal Stays",
        contact_name: "Asha",
        client_name: "Ravi Kumar",
        lead_name: "Ravi Kumar",
        crm_lead_id: "LD-1042",
        assigned_team_member: "Neha",
        destination: "Goa",
        trip_start_date: "04 Oct 2026",
        trip_end_date: "10 Oct 2026",
        client_requirement: "Two rooms",
      },
    );

    expect(rendered).toEqual({
      subject: "Ravi Kumar — Goa",
      body: "Coastal Stays / {{custom_field}}",
      signature: "Regards,\nNeha",
    });
  });

  test("escapes placeholder data when rendering a rich-text template", () => {
    const rendered = renderSupplierEmailTemplate(
      {
        subject: "Trip",
        body: "<p>{{client_name}}</p>",
        signature: "<p>{{assigned_team_member}}</p>",
      },
      {
        supplier_name: "",
        contact_name: "",
        client_name: '<img src=x onerror="alert(1)">',
        lead_name: "",
        crm_lead_id: "",
        assigned_team_member: "<script>alert(1)</script>",
        destination: "",
        trip_start_date: "",
        trip_end_date: "",
        client_requirement: "",
      },
    );
    expect(rendered.body).toBe("<p>&lt;img src=x onerror=&quot;alert(1)&quot;&gt;</p>");
    expect(rendered.signature).toBe("<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>");
  });

  test("appends the editable signature to the composed email body", () => {
    expect(appendSupplierEmailSignature("Enquiry details\n", "Regards,\nNeha")).toBe(
      "Enquiry details<br><br>Regards,<br>Neha",
    );
    expect(appendSupplierEmailSignature("Enquiry details", "  ")).toBe("Enquiry details");
  });
});
