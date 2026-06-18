/**
 * src/validation/card.ts — input validation for the cards API (TASK-005 Phase 2).
 *
 * Pure, synchronous validators run by the Phase-3 route handlers BEFORE any DB call, so invalid
 * input is rejected without touching the pool (spec § Input Validation Rules; AC-ERROR-1/4/5).
 * Mirrors `src/validation/board.ts` exactly in contract and structure.
 *
 * Contract: each validator returns the normalized, typed value on success and `throw`s a
 * `badRequest` (`HttpError`, status 400) on failure. Route handlers catch and forward via
 * `next(err)`; the centralized errorHandler then renders the standard
 * `400 { error: "Bad Request", path, traceId }` shape. The descriptive throw messages here are
 * for server-side logs only — never sent to the client (see src/errors.ts).
 *
 * Rules enforced (from the spec):
 *   - title: required on create; must be a string; non-empty; ≤ 255 characters.
 *   - description: optional; when present must be a string or null (omitted → null on create).
 *   - position: optional; when present must be a non-negative integer (omitted → 0 on create).
 *   - PATCH body: must include at least one recognized field (title, description, or position).
 *   - boardId / id path params: positive integer — reuses the domain-agnostic `validateId` from
 *     `./board` (re-exported here so the cards router imports all card validation from one place).
 *   - Unrecognized extra fields are silently ignored (no 400) — kept simple for MVP.
 */

import { badRequest } from '../errors';

// `validateId` is domain-agnostic (positive-integer path param). Reuse it directly for the
// board-scoped `:boardId` and the card `:id`, and re-export so callers have a single import site.
export { validateId } from './board';

/** Max length of the `title` column (VARCHAR(255) in the cards table migration). */
const TITLE_MAX_LENGTH = 255;

/** Normalized, validated body for creating a card. */
export interface CardCreateInput {
  readonly title: string;
  readonly description: string | null;
  readonly position: number;
}

/**
 * Normalized, validated body for updating a card. All fields optional, but validation guarantees
 * at least one is present. A `description` of `null` means "clear the description".
 */
export interface CardUpdateInput {
  readonly title?: string;
  readonly description?: string | null;
  readonly position?: number;
}

/**
 * Narrow an unknown request body to a plain object. Rejects `null`, arrays, and primitives —
 * the cards API only accepts JSON objects. (express.json() yields `{}` for an empty body.)
 */
function asObject(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw badRequest('request body must be a JSON object');
  }
  return body as Record<string, unknown>;
}

/**
 * Validate a present `title` value: must be a non-empty string of at most 255 characters.
 * Callers guard presence (required-on-create vs optional-on-update) before calling.
 */
function checkTitle(value: unknown): string {
  if (typeof value !== 'string') {
    throw badRequest('title must be a string');
  }
  if (value.length === 0) {
    throw badRequest('title must not be empty');
  }
  if (value.length > TITLE_MAX_LENGTH) {
    throw badRequest(`title must be at most ${TITLE_MAX_LENGTH} characters`);
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
 * Validate a present `position` value: must be a non-negative integer (number type, integral,
 * ≥ 0). Rejects strings, fractions, negatives, NaN, and Infinity. Callers guard presence
 * (omitted → defaults to 0 on create) before calling.
 */
function checkPosition(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw badRequest('position must be a non-negative integer');
  }
  return value;
}

/**
 * Validate a POST /cards body. `title` is required; `description` defaults to `null` and
 * `position` to `0` when omitted. Returns the normalized `{ title, description, position }`;
 * throws `badRequest` on any rule violation.
 */
export function validateCreate(body: unknown): CardCreateInput {
  const obj = asObject(body);

  if (obj.title === undefined) {
    throw badRequest('title is required');
  }
  const title = checkTitle(obj.title);
  const description = obj.description === undefined ? null : checkDescription(obj.description);
  const position = obj.position === undefined ? 0 : checkPosition(obj.position);

  return { title, description, position };
}

/**
 * Validate a PATCH /cards/:id body. At least one of `title` / `description` / `position` must be
 * present (an empty or unrecognized-only body is a 400). Returns only the provided, normalized
 * fields.
 *
 * Note: JSON bodies never carry `undefined` values, so `!== undefined` reliably means "key
 * present". A present `description: null` is preserved (clears the column).
 */
export function validateUpdate(body: unknown): CardUpdateInput {
  const obj = asObject(body);

  const hasTitle = obj.title !== undefined;
  const hasDescription = obj.description !== undefined;
  const hasPosition = obj.position !== undefined;
  if (!hasTitle && !hasDescription && !hasPosition) {
    throw badRequest('update must include at least one of: title, description, position');
  }

  const result: { title?: string; description?: string | null; position?: number } = {};
  if (hasTitle) {
    result.title = checkTitle(obj.title);
  }
  if (hasDescription) {
    result.description = checkDescription(obj.description);
  }
  if (hasPosition) {
    result.position = checkPosition(obj.position);
  }
  return result;
}
