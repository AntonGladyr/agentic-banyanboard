/**
 * src/errors.ts — typed HTTP errors that integrate with the centralized errorHandler.
 *
 * `src/middleware/errorHandler.ts` maps a forwarded error to an HTTP response by reading a
 * numeric `status` (or `statusCode`) in the 4xx range; anything else becomes a 500. `HttpError`
 * carries that `status` so domain code (validation, route handlers) can signal an intended
 * client-error status simply by `throw`ing / `next(err)`-ing one of these.
 *
 * SECURITY (Guiding Principle 5): the `message` here is for SERVER-SIDE logs only. errorHandler
 * never echoes `err.message` to the client — it emits a fixed safe label per status
 * (e.g. 400 → "Bad Request"). So messages may be descriptive for debugging without leaking
 * anything to callers.
 */

/** An error carrying an intended HTTP status code, recognized by the centralized errorHandler. */
export class HttpError extends Error {
  /** The HTTP status this error maps to (e.g. 400, 404). Read by errorHandler. */
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    // Restore the prototype chain so `instanceof HttpError` holds when targeting ES5-class
    // emit semantics; harmless under ES2022. Keeps unit-test `toBeInstanceOf` assertions stable.
    Object.setPrototypeOf(this, HttpError.prototype);
  }
}

/** Build a 400 Bad Request error (client supplied invalid input). */
export function badRequest(message: string): HttpError {
  return new HttpError(400, message);
}

/** Build a 404 Not Found error (requested resource does not exist). */
export function notFoundError(message: string): HttpError {
  return new HttpError(404, message);
}
