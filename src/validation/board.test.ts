/**
 * src/validation/board.test.ts — unit tests for board input validation (TASK-004 Phase 2).
 *
 * Pure, fast unit tests for the validation functions in `./board` — NO database, NO Express.
 * Per the Test Strategy (§ Per-Phase Test Guidance, Phase 2), this suite covers the input
 * rules from the spec's § Input Validation Rules:
 *   - name: required on create, must be a string, non-empty, ≤ 255 chars (AC-ERROR-1)
 *   - description: optional; must be a string or null when present
 *   - id path param: must be a positive integer — non-integer/zero rejected before any DB call
 *     (AC-ERROR-3)
 *   - PATCH body: at least one of name/description must be present (AC-ERROR-4)
 *   - plus at least one valid-input pass-through per function
 *
 * Failure contract: validators throw an `HttpError` with `status === 400`. The route layer
 * (Phase 3) catches and forwards these to `next(err)`, where the existing errorHandler maps
 * them to the standard `400 { error: "Bad Request", ... }` shape — the descriptive message is
 * server-side only and never reaches the client.
 */

import { validateCreate, validateUpdate, validateId } from './board';
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
  it('rejects a missing name with a 400', () => {
    expect(thrownStatus(() => validateCreate({}))).toBe(400);
  });

  it('rejects an empty-string name with a 400', () => {
    expect(thrownStatus(() => validateCreate({ name: '' }))).toBe(400);
  });

  it('rejects a name longer than 255 characters with a 400', () => {
    expect(thrownStatus(() => validateCreate({ name: 'a'.repeat(256) }))).toBe(400);
  });

  it('rejects a non-string name with a 400', () => {
    expect(thrownStatus(() => validateCreate({ name: 123 }))).toBe(400);
  });

  it('rejects a non-string, non-null description with a 400', () => {
    expect(thrownStatus(() => validateCreate({ name: 'Sprint 1', description: 42 }))).toBe(400);
  });

  it('accepts a valid name and defaults an omitted description to null', () => {
    expect(validateCreate({ name: 'Sprint 1' })).toEqual({
      name: 'Sprint 1',
      description: null,
    });
  });

  it('accepts a name exactly 255 characters and a string description, ignoring extra fields', () => {
    const name = 'a'.repeat(255);
    expect(validateCreate({ name, description: 'a description', id: 999, extra: true })).toEqual({
      name,
      description: 'a description',
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

  it('rejects an over-long name on update with a 400', () => {
    expect(thrownStatus(() => validateUpdate({ name: 'a'.repeat(256) }))).toBe(400);
  });

  it('accepts a name-only partial update', () => {
    expect(validateUpdate({ name: 'Renamed' })).toEqual({ name: 'Renamed' });
  });

  it('accepts clearing the description to null as the sole field', () => {
    expect(validateUpdate({ description: null })).toEqual({ description: null });
  });
});

describe('validateId', () => {
  it('rejects a non-integer id with a 400', () => {
    expect(thrownStatus(() => validateId('abc'))).toBe(400);
  });

  it('rejects a zero id with a 400', () => {
    expect(thrownStatus(() => validateId('0'))).toBe(400);
  });

  it('parses a valid positive integer id to a number', () => {
    expect(validateId('42')).toBe(42);
  });
});
