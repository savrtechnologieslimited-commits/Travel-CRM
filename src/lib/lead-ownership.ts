const FULL_LEAD_VISIBILITY_ROLES = new Set(["admin", "developer", "manager"]);

export function hasFullLeadVisibility(roles: readonly string[]) {
  return roles.some((role) => FULL_LEAD_VISIBILITY_ROLES.has(role));
}
