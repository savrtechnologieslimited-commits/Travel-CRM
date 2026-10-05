export type BusinessVisibleUser = {
  id: string;
  is_active: boolean;
};

export function isBusinessVisibleUser(
  user: BusinessVisibleUser,
  developerUserIds: ReadonlySet<string>,
  includeInactive = false,
) {
  return (includeInactive || user.is_active) && !developerUserIds.has(user.id);
}

export function filterBusinessVisibleUsers<T extends BusinessVisibleUser>(
  users: T[],
  developerUserIds: ReadonlySet<string>,
  includeInactive = false,
) {
  return users.filter((user) => isBusinessVisibleUser(user, developerUserIds, includeInactive));
}

export function filterAssignmentsToBusinessVisibleUsers<T extends { employee_id: string }>(
  assignments: T[],
  businessVisibleEmployeeIds: ReadonlySet<string>,
) {
  return assignments.filter((assignment) => businessVisibleEmployeeIds.has(assignment.employee_id));
}
