/*
What this file does: Reads the request headers that stand in for a session in this learning build.
What calls it: src/lib/middleware/withAuth.ts and any server-side helper that needs the current actor.
What it calls: the role helpers in src/lib/auth/roles.ts.
Junior mistake: treating the header names as optional in the handler but forgetting to reject missing user identity before business logic runs.
*/

import { isUserRole, type UserRole } from '@/lib/auth/roles';

export interface Session {
  userId: string;
  displayName: string;
  role: UserRole;
}

export function getSessionFromRequest(request: Request): Session | null {
  const userId = request.headers.get('x-user-id')?.trim();
  const displayName = request.headers.get('x-user-name')?.trim() || 'Unnamed User';
  const roleHeader = request.headers.get('x-user-role');

  if (!userId || !isUserRole(roleHeader)) {
    return null;
  }

  return {
    userId,
    displayName,
    role: roleHeader,
  };
}
