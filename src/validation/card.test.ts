/**
 * src/validation/card.test.ts — unit tests for card input validation (TASK-005 Phase 2).
 *
 * Pure, fast unit tests for the validation functions in `./card` — NO database, NO Express.
 * Per the Test Strategy (§ Per-Phase Test Guidance, Phase 2), this suite covers the input
 * rules from the spec's § Input Validation Rules:
 *   - title: required on create, must be a string, non-empty, ≤ 255 chars (AC-ERROR-1)
 *   - description: optional; must be a string or null when present
 *   - position: optional; when present must be a non-negative integer (AC-ERROR-5)
 *   - PATCH body: at least one of title/description/position must be present (AC-ERROR-4)
 *   - id/boardId path param: positive integer — delegates to the shared `validateId` (AC-ERROR-3)
 *   - plus a valid-input pass-through per function
 *
 * Failure contract: validators throw an `HttpError` with `status === 400`. The route layer
 * (Phase 3) catches and forwards these to `next(err)`, where the existing errorHandler maps
 * them to the standard `400 { error: "Bad Request", ... }` shape — the descriptive message is
 * server-side only and never reaches the client.
 */

import { validateCreate, validateUpdate, validateId } from './card';
import { HttpError } from '../errors';

/**
 * Invoke `fn`, assert it threw an `HttpError`, and return that error's status. Fails the test
 * if `fn` does not throw — so a validator that wrongly accepts bad input is caught.
 */
function thrownStatus(fn: () => unknown): number {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(HttpError);
    return (err as HttpError).status;
  }
  throw new Error('expected validator to throw, but it returned normally');
}

describe('validateCreate', () => {
  it('rejects a missing title with a 400', () => {
    expect(thrownStatus(() => validateCreate({}))).toBe(400);
  });

  it('rejects an empty-string title with a 400', () => {
    expect(thrownStatus(() => validateCreate({ title: '' }))).toBe(400);
  });

  it('rejects a title longer than 255 characters with a 400', () => {
    expect(thrownStatus(() => validateCreate({ title: 'a'.repeat(256) }))).toBe(400);
  });

  it('rejects a non-string title with a 400', () => {
    expect(thrownStatus(() => validateCreate({ title: 123 }))).toBe(400);
  });

  it('rejects a non-string, non-null description with a 400', () => {
    expect(thrownStatus(() => validateCreate({ title: 'Implement login', description: 42 }))).toBe(
      400,
    );
  });

  it('rejects a negative position with a 400', () => {
    expect(thrownStatus(() => validateCreate({ title: 'X', position: -1 }))).toBe(400);
  });

  it('rejects a non-integer (string) position with a 400', () => {
    expect(thrownStatus(() => validateCreate({ title: 'X', position: 'top' }))).toBe(400);
  });

  it('rejects a fractional position with a 400', () => {
    expect(thrownStatus(() => validateCreate({ title: 'X', position: 1.5 }))).toBe(400);
  });

  // ── status (FEAT-006 Phase 1) ──────────────────────────────────────────────────────────────
  it('rejects an unrecognized status value with a 400', () => {
    expect(thrownStatus(() => validateCreate({ title: 'X', status: 'archived' }))).toBe(400);
  });

  it('rejects a non-string status with a 400', () => {
    expect(thrownStatus(() => validateCreate({ title: 'X', status: 1 }))).toBe(400);
  });

  it('rejects an empty-string status with a 400', () => {
    expect(thrownStatus(() => validateCreate({ title: 'X', status: '' }))).toBe(400);
  });

  it.each(['todo', 'in_progress', 'done'])(
    'accepts the valid status value %p',
    (status) => {
      expect(validateCreate({ title: 'X', status })).toEqual({
        title: 'X',
        description: null,
        position: 0,
        status,
      });
    },
  );

  it('accepts a valid title and defaults omitted description to null, position to 0, status to todo', () => {
    expect(validateCreate({ title: 'Implement login' })).toEqual({
      title: 'Implement login',
      description: null,
      position: 0,
      status: 'todo',
    });
  });

  it('accepts a title exactly 255 chars, a string description, and position 0, ignoring extras', () => {
    const title = 'a'.repeat(255);
    expect(
      validateCreate({ title, description: 'a description', position: 0, id: 999, extra: true }),
    ).toEqual({
      title,
      description: 'a description',
      position: 0,
      status: 'todo',
    });
  });
});

describe('validateUpdate', () => {
  it('rejects an empty body with a 400 (no fields to update)', () => {
    expect(thrownStatus(() => validateUpdate({}))).toBe(400);
  });

  it('rejects a body with only unrecognized fields with a 400', () => {
    expect(thrownStatus(() => validateUpdate({ foo: 'bar' }))).toBe(400);
  });

  it('rejects an over-long title on update with a 400', () => {
    expect(thrownStatus(() => validateUpdate({ title: 'a'.repeat(256) }))).toBe(400);
  });

  it('rejects a negative position on update with a 400', () => {
    expect(thrownStatus(() => validateUpdate({ position: -5 }))).toBe(400);
  });

  it('accepts a title-only partial update', () => {
    expect(validateUpdate({ title: 'Renamed' })).toEqual({ title: 'Renamed' });
  });

  it('accepts clearing the description to null as the sole field', () => {
    expect(validateUpdate({ description: null })).toEqual({ description: null });
  });

  it('accepts a position-only partial update', () => {
    expect(validateUpdate({ position: 3 })).toEqual({ position: 3 });
  });

  // ── status (FEAT-006 Phase 1) ──────────────────────────────────────────────────────────────
  it('treats status as a recognized field — a status-only update is valid', () => {
    expect(validateUpdate({ status: 'in_progress' })).toEqual({ status: 'in_progress' });
  });

  it('rejects an unrecognized status value on update with a 400', () => {
    expect(thrownStatus(() => validateUpdate({ status: 'archived' }))).toBe(400);
  });

  it('rejects a non-string status on update with a 400', () => {
    expect(thrownStatus(() => validateUpdate({ status: 42 }))).toBe(400);
  });
});

describe('validateId (re-exported for boardId/:id path params)', () => {
  it('rejects a non-integer id with a 400', () => {
    expect(thrownStatus(() => validateId('abc'))).toBe(400);
  });

  it('parses a valid positive integer id to a number', () => {
    expect(validateId('42')).toBe(42);
  });
});
