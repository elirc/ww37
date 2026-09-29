/*
What this file does: Centralizes role-based guard clauses so routes and services do not repeat authorization logic.
What calls it: withAuth.ts and reservation/inventory services when they need a yes/no permission answer.
What it calls: the error helpers in src/lib/errors.ts.
Junior mistake: checking "is manager?" in one file and "is owner?" in another, which creates permission drift.
*/

import { type UserRole } from '@/lib/auth/roles';
import { canReleaseAnyReservation, canManageInventory, canViewAllReservations, canViewAlerts, canCreateHold } from '@/lib/auth/roles';
import { forbiddenError } from '@/lib/errors';

export function assertRoleAllowed(role: UserRole, allowedRoles: readonly UserRole[], action: string): void {
  if (!allowedRoles.includes(role)) {
    throw forbiddenError(`You must be one of ${allowedRoles.join(', ')} to ${action}.`);
  }
}

export function canManageInventoryAction(role: UserRole): boolean {
  return canManageInventory(role);
}

export function canCreateHoldAction(role: UserRole): boolean {
  return canCreateHold(role);
}

export function canReleaseReservationAction(role: UserRole): boolean {
  return canReleaseAnyReservation(role);
}

export function canViewAllReservationAction(role: UserRole): boolean {
  return canViewAllReservations(role);
}

export function canReadAlertsAction(role: UserRole): boolean {
  return canViewAlerts(role);
}
