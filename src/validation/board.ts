/**
 * src/validation/board.ts — input validation for the boards API (TASK-004 Phase 2).
 *
 * Pure, synchronous validators run by the Phase-3 route handlers BEFORE any DB call, so invalid
 * input is rejected without touching the pool (spec § Input Validation Rules; AC-ERROR-1/3/4).
 *
 * Contract: each validator returns the normalized, typed value on success and `throw`s a
 * `badRequest` (`HttpError`, status 400) on failure. Route handlers catch and forward via
 * `next(err)`; the centralized errorHandler then renders the standard
 * `400 { error: "Bad Request", path, traceId }` shape. The descriptive throw messages here are
 * for server-side logs only — never sent to the client (see src/errors.ts).
 *
 * Rules enforced (from the spec):
 *   - name: required on create; must be a string; non-empty; ≤ 255 characters.
 *   - description: optional; when present must be a string or null (omitted → null on create).
 *   - id path param: must be a positive integer (rejects non-integer, zero, negative).
 *   - PATCH body: must include at least one recognized field (name or description).
 *   - Unrecognized extra fields are silently ignored (no 400) — kept simple for MVP.
 */

import { badRequest } from '../errors';

/** Max length of the `name` column (VARCHAR(255) in the boards table migration). */
const NAME_MAX_LENGTH = 255;

/** Normalized, validated body for creating a board. */
export interface BoardCreateInput {
  readonly name: string;
  readonly description: string | null;
}

/**
 * Normalized, validated body for updating a board. Both fields optional, but validation
 * guarantees at least one is present. A `description` of `null` means "clear the description".
 */
export interface BoardUpdateInput {
  readonly name?: string;
  readonly description?: string | null;
}

/**
 * Narrow an unknown request body to a plain object. Rejects `null`, arrays, and primitives —
 * the boards API only accepts JSON objects. (express.json() yields `{}` for an empty body.)
 */
function asObject(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw badRequest('request body must be a JSON object');
  }
  return body as Record<string, unknown>;
}

/**
 * Validate a present `name` value: must be a non-empty string of at most 255 characters.
 * Callers guard presence (required-on-create vs optional-on-update) before calling.
 */
function checkName(value: unknown): string {
  if (typeof value !== 'string') {
    throw badRequest('name must be a string');
  }
  if (value.length === 0) {
    throw badRequest('name must not be empty');
  }
  if (value.length > NAME_MAX_LENGTH) {
    throw badRequest(`name must be at most ${NAME_MAX_LENGTH} characters`);
  }
  return value;
}

/**
 * Validate a present `description` value: must be a string or `null`. `null` is a meaningful
 * value (clears the description); callers guard key presence before calling.
 */
function checkDescription(value: unknown): string | null {
  if (value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    throw badRequest('description must be a string or null');
  }
  return value;
}

/**
 * Validate a POST /boards body. `name` is required; `description` defaults to `null` when omitted.
 * Returns the normalized `{ name, description }`; throws `badRequest` on any rule violation.
 */
export function validateCreate(body: unknown): BoardCreateInput {
  const obj = asObject(body);

  if (obj.name === undefined) {
    throw badRequest('name is required');
  }
  const name = checkName(obj.name);
  const description = obj.description === undefined ? null : checkDescription(obj.description);

  return { name, description };
}

/**
 * Validate a PATCH /boards/:id body. At least one of `name` / `description` must be present
 * (an empty or unrecognized-only body is a 400). Returns only the provided, normalized fields.
 *
 * Note: JSON bodies never carry `undefined` values, so `!== undefined` reliably means "key
 * present". A present `description: null` is preserved (clears the column).
 */
export function validateUpdate(body: unknown): BoardUpdateInput {
  const obj = asObject(body);

  const hasName = obj.name !== undefined;
  const hasDescription = obj.description !== undefined;
  if (!hasName && !hasDescription) {
    throw badRequest('update must include at least one of: name, description');
  }

  const result: { name?: string; description?: string | null } = {};
  if (hasName) {
    result.name = checkName(obj.name);
  }
  if (hasDescription) {
    result.description = checkDescription(obj.description);
  }
  return result;
}

/**
 * Validate the `:id` path parameter: must be a positive integer. Rejects non-numeric strings,
 * decimals, signs, zero, and negatives — short-circuiting before any DB query (AC-ERROR-3).
 * Returns the parsed number on success.
 */
export function validateId(raw: string): number {
  // Strict positive-integer match: rejects '', 'abc', '1.5', '-1', '0x10', '12abc'.
  if (!/^[0-9]+$/.test(raw)) {
    throw badRequest(`id path param must be a positive integer, received "${raw}"`);
  }
  const id = Number.parseInt(raw, 10);
  if (!Number.isInteger(id) || id <= 0) {
    throw badRequest(`id path param must be a positive integer, received "${raw}"`);
  }
  return id;
}
