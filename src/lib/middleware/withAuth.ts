/*
What this file does: Verifies the mock session headers, applies an optional role gate, and converts thrown errors to HTTP responses.
What calls it: every protected API route.
What it calls: session parsing, role assertions, and response conversion helpers.
Junior mistake: returning 403 when the session is missing, which hides the difference between "not logged in" and "logged in but not allowed".
*/

import { type Session, getSessionFromRequest } from '@/lib/auth/session';
import { jsonError, toErrorResponse } from '@/lib/http/api';
import { assertRoleAllowed } from '@/lib/middleware/withRole';
import { unauthorizedError } from '@/lib/errors';
import { type UserRole } from '@/lib/auth/roles';

export interface WithAuthOptions {
  roles?: readonly UserRole[];
  action?: string;
}

export async function withAuth(
  request: Request,
  options: WithAuthOptions,
  handler: (session: Session) => Promise<Response>
): Promise<Response> {
  const session = getSessionFromRequest(request);

  if (!session) {
    return jsonError(401, 'UNAUTHORIZED', unauthorizedError().message);
  }

  try {
    if (options.roles?.length) {
      assertRoleAllowed(session.role, options.roles, options.action ?? 'perform this action');
    }

    return await handler(session);
  } catch (error) {
    return toErrorResponse(error);
  }
}
