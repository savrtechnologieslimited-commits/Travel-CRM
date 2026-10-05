import type { TeamRole } from "./team-members";

const ROLE_LABELS: Record<TeamRole, string> = {
  admin: "Admin",
  manager: "Manager",
  operations: "Operations Employee",
  read_only: "Read only",
};

export function teamRoleLabel(role: string) {
  return Object.hasOwn(ROLE_LABELS, role) ? ROLE_LABELS[role as TeamRole] : "Unassigned role";
}
