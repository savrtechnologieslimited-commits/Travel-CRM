import { describe, expect, test } from "bun:test";
import {
  formatCustomerLocation,
  formatCustomerPrimaryContact,
  formatCustomerSummary,
} from "./customers.index";

describe("customers screen helpers", () => {
  test("formats the primary customer summary fields for the compact CRM table", () => {
    const customer = {
      full_name: "Asha Verma",
      code: "CUST-1001",
      mobile: "+91 98765 43210",
      whatsapp: "+91 98765 43210",
      email: "asha@example.com",
      city: "Bengaluru",
      state: "Karnataka",
      country: "India",
      created_at: "2024-01-01T00:00:00Z",
    };

    expect(formatCustomerSummary(customer)).toBe("Asha Verma");
    expect(formatCustomerPrimaryContact(customer)).toBe("+91 98765 43210");
    expect(formatCustomerLocation(customer)).toBe("Bengaluru, Karnataka, India");
  });

  test("falls back cleanly when customer contact fields are absent", () => {
    const customer = {
      full_name: "Jane Doe",
      code: "CUST-2002",
      mobile: null,
      whatsapp: null,
      email: null,
      city: null,
      state: null,
      country: null,
    };

    expect(formatCustomerSummary(customer)).toBe("Jane Doe");
    expect(formatCustomerPrimaryContact(customer)).toBe("—");
    expect(formatCustomerLocation(customer)).toBe("—");
  });

  test("uses the mobile number when the WhatsApp number is blank", () => {
    expect(
      formatCustomerPrimaryContact({
        mobile: "+91 98765 43210",
        whatsapp: "  ",
      }),
    ).toBe("+91 98765 43210");
  });
});
