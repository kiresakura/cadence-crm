import type { z } from "zod";

export type ErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_FAILED"
  | "CONFLICT"
  | "BAD_REQUEST"
  | "PAYLOAD_TOO_LARGE";

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION_FAILED: 422,
  CONFLICT: 409,
  BAD_REQUEST: 400,
  PAYLOAD_TOO_LARGE: 413,
};

export type FieldErrors = Record<string, string[]>;

/** An expected, user-facing error. Anything else is treated as an internal failure. */
export class AppError extends Error {
  readonly status: number;

  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly fieldErrors?: FieldErrors,
  ) {
    super(message);
    this.name = "AppError";
    this.status = STATUS_BY_CODE[code];
  }
}

export class UnauthenticatedError extends AppError {
  constructor(message = "Please sign in to continue.") {
    super("UNAUTHENTICATED", message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You do not have permission to do that.") {
    super("FORBIDDEN", message);
  }
}

export class NotFoundError extends AppError {
  constructor(entity = "Record") {
    super("NOT_FOUND", `${entity} not found.`);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, fieldErrors?: FieldErrors) {
    super("VALIDATION_FAILED", message, fieldErrors);
  }

  static forField(field: string, message: string): ValidationError {
    return new ValidationError(message, { [field]: [message] });
  }
}

export class ConflictError extends AppError {
  constructor(message: string, fieldErrors?: FieldErrors) {
    super("CONFLICT", message, fieldErrors);
  }
}

export function zodFieldErrors(error: z.ZodError): FieldErrors {
  const fieldErrors: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.map(String).join(".") : "_form";
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return fieldErrors;
}

/** Parses untrusted input, converting schema failures into a `ValidationError`. */
export function parseInput<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ValidationError("Please fix the highlighted fields.", zodFieldErrors(result.error));
  }
  return result.data;
}
