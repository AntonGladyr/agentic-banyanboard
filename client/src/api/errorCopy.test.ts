/**
 * client/src/api/errorCopy.test.ts — write-error copy tests (TASK-007 Phase 1).
 *
 * Verifies the new copy functions introduced in Phase 1:
 *   - writeErrorCopy(category): returns non-empty heading + message for each category;
 *     never contains internal detail (GP5).
 *   - dragRevertErrorCopy(): returns non-empty heading + message for the optimistic drag-rollback
 *     case (AC-ERROR-4: "move failed, reverted").
 *
 * Exact string content is NOT asserted — per Test Strategy "What NOT to Test":
 * "exact visual styling, colors, animation, and copy" is verified by UAT/inspection only.
 */

import { describe, expect, it } from 'vitest';
import { dragRevertErrorCopy, writeErrorCopy } from './errorCopy';
import type { ApiErrorCategory } from './apiClient';

describe('writeErrorCopy — write/edit failure copy', () => {
  it('returns non-empty heading and message for each ApiError category', () => {
    const categories: ApiErrorCategory[] = ['network', 'server', 'notFound'];

    for (const category of categories) {
      const copy = writeErrorCopy(category);
      expect(copy.heading, `heading for category "${category}"`).toBeTruthy();
      expect(copy.message, `message for category "${category}"`).toBeTruthy();
    }
  });

  it('never includes internal detail in the returned copy (GP5)', () => {
    const categories: ApiErrorCategory[] = ['network', 'server', 'notFound'];
    const internalTerms = ['stack', 'trace', 'Error:', 'at ', 'db.query', 'internal'];

    for (const category of categories) {
      const copy = writeErrorCopy(category);
      for (const term of internalTerms) {
        expect(copy.heading).not.toContain(term);
        expect(copy.message).not.toContain(term);
      }
    }
  });
});

describe('dragRevertErrorCopy — drag-and-drop rollback copy (AC-ERROR-4)', () => {
  it('returns non-empty heading and message for the move-failed-reverted case', () => {
    const copy = dragRevertErrorCopy();
    expect(copy.heading).toBeTruthy();
    expect(copy.message).toBeTruthy();
  });
});
