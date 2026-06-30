/**
 * client/src/api/labels.test.ts — status label mapping tests (TASK-008 Phase 3).
 *
 * `statusLabel` maps stored card statuses to the human-readable column names the activity feed
 * renders ("To Do → In Progress"). Verifies the three known statuses and the safe fallback.
 */

import { describe, expect, it } from 'vitest';
import { statusLabel } from './labels';

describe('statusLabel', () => {
  it('maps the three known statuses to their column labels', () => {
    expect(statusLabel('todo')).toBe('To Do');
    expect(statusLabel('in_progress')).toBe('In Progress');
    expect(statusLabel('done')).toBe('Done');
  });

  it('falls back to the raw value for an unknown status (never blank)', () => {
    expect(statusLabel('archived')).toBe('archived');
  });
});
