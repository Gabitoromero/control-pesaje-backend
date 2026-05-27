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
