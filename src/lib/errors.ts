/*
What this file does: Standardizes application errors so route handlers can turn domain failures into HTTP responses.
What calls it: services, auth middleware, and validation boundary helpers.
What it calls: nothing; it is a shared utility leaf.
Junior mistake: throwing plain Error objects for expected failures and then guessing the HTTP status code later.
*/

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export function unauthorizedError(message = 'Authentication required'): AppError {
  return new AppError(401, 'UNAUTHORIZED', message);
}

export function forbiddenError(message = 'You do not have permission to perform this action'): AppError {
  return new AppError(403, 'FORBIDDEN', message);
}

export function notFoundError(message = 'Resource not found'): AppError {
  return new AppError(404, 'NOT_FOUND', message);
}

export function conflictError(message = 'Request conflicts with current inventory state', details?: unknown): AppError {
  return new AppError(409, 'CONFLICT', message, details);
}

export function validationError(message = 'Request payload is invalid', details?: unknown): AppError {
  return new AppError(400, 'VALIDATION_ERROR', message, details);
}
