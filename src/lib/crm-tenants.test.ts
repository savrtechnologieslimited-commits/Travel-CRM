import { describe, expect, test } from "bun:test";
import { validateCreateCrmTenantInput } from "./crm-tenants";

describe("CRM tenant creation validation", () => {
  test("normalizes a valid tenant name and slug", () => {
    expect(validateCreateCrmTenantInput({ name: "  North Star Tours ", slug: "north-star-tours" })).toEqual({
      name: "North Star Tours",
      slug: "north-star-tours",
    });
  });

  test("rejects invalid names and unsafe/noncanonical slugs", () => {
    expect(() => validateCreateCrmTenantInput({ name: " ", slug: "travel-co" })).toThrow("Tenant name");
    expect(() => validateCreateCrmTenantInput({ name: "Travel", slug: "Travel Co" })).toThrow("Tenant slug");
    expect(() => validateCreateCrmTenantInput({ name: "Travel", slug: "ab" })).toThrow("Tenant slug");
  });
});
