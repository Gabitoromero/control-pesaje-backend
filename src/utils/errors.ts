/**
 * Thrown when a soft-delete is blocked because active references exist.
 * Equivalent to a database-level ON DELETE RESTRICT, enforced in the service layer.
 */
export class RestrictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RestrictError';
  }
}

/**
 * Thrown when input data violates a business rule that Zod cannot express.
 * Maps to HTTP 400 in the controller layer.
 */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}
