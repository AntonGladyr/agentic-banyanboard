/**
 * client/src/api/formatRelative.ts — minimal relative-time formatter (TASK-008 Phase 3).
 *
 * The activity feed shows each move's timestamp as a relative string ("just now", "2 minutes ago",
 * "3 days ago"). UI/UX creative § Decision Area 2 specifies a small client-side utility rather than
 * an external library (Guiding Principle 4 — no dependency that doesn't earn its keep). Buckets:
 * seconds → "just now", minutes, hours, days, weeks; beyond ~4 weeks it falls back to an absolute
 * "Mon D" / "Mon D, YYYY" date. Future timestamps (clock skew) are clamped to "just now".
 *
 * `now` is injectable so callers/tests can pass a fixed reference time for determinism.
 */

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

/** Pluralize a whole-number count with its unit ("1 minute" / "2 minutes"). */
function plural(count: number, unit: string): string {
  return `${count} ${unit}${count === 1 ? '' : 's'} ago`;
}

/**
 * Format an ISO-8601 string (or `Date`) as a short relative time string against `now` (defaults to
 * the current time). Returns "just now" for anything under a minute (and for future timestamps).
 * Beyond four weeks it returns an absolute date so old entries stay precise.
 */
export function formatRelative(input: string | Date, now: Date = new Date()): string {
  const then = input instanceof Date ? input : new Date(input);
  const elapsed = now.getTime() - then.getTime();

  if (Number.isNaN(elapsed) || elapsed < MINUTE) {
    return 'just now';
  }
  if (elapsed < HOUR) {
    return plural(Math.floor(elapsed / MINUTE), 'minute');
  }
  if (elapsed < DAY) {
    return plural(Math.floor(elapsed / HOUR), 'hour');
  }
  if (elapsed < WEEK) {
    return plural(Math.floor(elapsed / DAY), 'day');
  }
  if (elapsed < 4 * WEEK) {
    return plural(Math.floor(elapsed / WEEK), 'week');
  }
  // Older than ~4 weeks: show an absolute date. Include the year only when it differs from `now`.
  const sameYear = then.getFullYear() === now.getFullYear();
  return then.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}
