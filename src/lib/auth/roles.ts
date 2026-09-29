/*
What this file does: Defines the small-role model used by auth and permission checks across the app.
What calls it: session parsing, middleware guards, services, and UI session controls.
What it calls: nothing; it is a shared leaf module.
Junior mistake: checking role strings ad hoc in route files instead of using one centralized role model.
*/

export const userRoles = ['owner', 'manager', 'clerk', 'viewer'] as const;

export type UserRole = (typeof userRoles)[number];

export const privilegedRoles = ['owner', 'manager'] as const satisfies readonly UserRole[];

export function isUserRole(value: string | null | undefined): value is UserRole {
  return Boolean(value && (userRoles as readonly string[]).includes(value));
}

export function canManageInventory(role: UserRole): boolean {
  return role === 'owner' || role === 'manager';
}

export function canCreateHold(role: UserRole): boolean {
  return role !== 'viewer';
}

export function canViewAllReservations(role: UserRole): boolean {
  return role === 'owner' || role === 'manager';
}

export function canReleaseAnyReservation(role: UserRole): boolean {
  return role === 'owner' || role === 'manager';
}

export function canViewAlerts(role: UserRole): boolean {
  return role !== 'viewer';
}
