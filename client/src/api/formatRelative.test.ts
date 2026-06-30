/**
 * client/src/api/formatRelative.test.ts — relative-time formatter tests (TASK-008 Phase 3).
 *
 * `formatRelative` renders an activity entry's `occurred_at` as a short relative string. All cases
 * pass a fixed `now` so the assertions are deterministic (no reliance on the wall clock).
 */

import { describe, expect, it } from 'vitest';
import { formatRelative } from './formatRelative';

const NOW = new Date('2026-06-30T12:00:00.000Z');

/** A timestamp `ms` milliseconds before NOW, as an ISO string. */
function ago(ms: number): string {
  return new Date(NOW.getTime() - ms).toISOString();
}

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

describe('formatRelative', () => {
  it('returns "just now" for anything under a minute', () => {
    expect(formatRelative(ago(0), NOW)).toBe('just now');
    expect(formatRelative(ago(59 * SECOND), NOW)).toBe('just now');
  });

  it('clamps future timestamps (clock skew) to "just now"', () => {
    expect(formatRelative(new Date(NOW.getTime() + 5 * MINUTE), NOW)).toBe('just now');
  });

  it('formats minutes with correct pluralization', () => {
    expect(formatRelative(ago(MINUTE), NOW)).toBe('1 minute ago');
    expect(formatRelative(ago(2 * MINUTE), NOW)).toBe('2 minutes ago');
    expect(formatRelative(ago(59 * MINUTE), NOW)).toBe('59 minutes ago');
  });

  it('formats hours', () => {
    expect(formatRelative(ago(HOUR), NOW)).toBe('1 hour ago');
    expect(formatRelative(ago(5 * HOUR), NOW)).toBe('5 hours ago');
  });

  it('formats days', () => {
    expect(formatRelative(ago(DAY), NOW)).toBe('1 day ago');
    expect(formatRelative(ago(3 * DAY), NOW)).toBe('3 days ago');
  });

  it('formats weeks up to ~4 weeks', () => {
    expect(formatRelative(ago(WEEK), NOW)).toBe('1 week ago');
    expect(formatRelative(ago(3 * WEEK), NOW)).toBe('3 weeks ago');
  });

  it('falls back to an absolute date beyond ~4 weeks', () => {
    // ~2 months earlier — should render an absolute "Mon D" (same year, year omitted).
    const result = formatRelative(ago(8 * WEEK), NOW);
    expect(result).not.toMatch(/ago$/);
    expect(result).toMatch(/May/);
  });

  it('returns "just now" for an unparseable date rather than throwing', () => {
    expect(formatRelative('not-a-date', NOW)).toBe('just now');
  });
});
