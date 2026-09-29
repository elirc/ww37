/*
What this file does: Converts successful results and known failures into a consistent JSON HTTP response shape.
What calls it: route handlers and auth middleware.
What it calls: AppError in src/lib/errors.ts and ZodError from zod.
Junior mistake: returning different error shapes from every route, which makes the UI and tests brittle.
*/

import { ZodError } from 'zod';

import { AppError } from '@/lib/errors';

export function jsonOk<T>(body: T, status = 200): Response {
  return Response.json(body, { status });
}

export function jsonError(status: number, code: string, message: string, details?: unknown): Response {
  return Response.json(
    {
      error: {
        code,
        message,
        details,
      },
    },
    { status }
  );
}

export function toErrorResponse(error: unknown): Response {
  if (error instanceof AppError) {
    return jsonError(error.statusCode, error.code, error.message, error.details);
  }

  if (error instanceof ZodError) {
    return jsonError(400, 'VALIDATION_ERROR', 'Request payload is invalid', {
      issues: error.issues,
    });
  }

  return jsonError(500, 'INTERNAL_SERVER_ERROR', 'Unexpected server error');
}
