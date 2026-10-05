import { describe, expect, test } from "bun:test";
import {
  DEFAULT_SUPPLIER_EMAIL_TEMPLATE,
  readSupplierEmailTemplate,
  renderSupplierEmailTemplate,
} from "./supplier-email-template";

describe("supplier email templates", () => {
  test("uses the default template when no saved value exists", () => {
    expect(readSupplierEmailTemplate(null)).toEqual(DEFAULT_SUPPLIER_EMAIL_TEMPLATE);
  });

  test("renders supported placeholders and keeps unknown placeholders editable", () => {
    const rendered = renderSupplierEmailTemplate(
      {
        subject: "{{client_name}} — {{destination}}",
        body: "{{supplier_name}} / {{custom_field}}",
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
    });
  });
});
