/**
 * client/e2e/activity-feed.realtime.spec.ts — cross-tab live activity delivery E2E, `realtime` project
 * (TASK-008 Phase 4; implements memory-bank/uat/spec-TASK-008-e2e.md Scenario 4).
 *
 * Runs against a REAL backend (real PostgreSQL `banyanboard_e2e` + `REALTIME_ENABLED=true`) behind the
 * single-origin Express-served build — NOT the per-test mock the `chromium` activity spec uses. A mocked
 * API can never broadcast an SSE event from one browser context to another, so the cross-tab activity
 * delivery (AC-HAPPY-2 cross-tab) is only meaningful end-to-end: a card move in Tab A must record an
 * `activity_events` row AND push an `activity:card_moved` frame to BOTH tabs over a genuine
 * `text/event-stream` connection.
 *
 * The activity event carries NO `originId` (unlike `card:updated`), so the echo-drop in
 * `useRealtimeBoard` never suppresses it — BOTH the mover's tab (AC-HAPPY-2 own-tab) and the observer
 * tab (AC-HAPPY-2 cross-tab) receive the entry. Each test provisions its own board (unique name →
 * unique SERIAL id) via the real API so the shared E2E DB allows non-interfering runs.
 */

import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

/** The ~1s localhost SSE budget for live delivery (productBrief NFR / AC-HAPPY-2); 2s ceiling for CI slack. */
const REALTIME_BUDGET_MS = 2000;

/** Create a board through the real API and return its server-assigned id. */
async function createBoard(page: Page, name: string): Promise<number> {
  const res = await page.request.post('/api/v1/boards', { data: { name } });
  expect(res.status(), 'board create should return 201').toBe(201);
  const board = (await res.json()) as { id: number };
  return board.id;
}

/** Create a card on a board through the real API (status defaults to To Do). */
async function createCard(page: Page, boardId: number, title: string): Promise<void> {
  const res = await page.request.post(`/api/v1/boards/${boardId}/cards`, {
    data: { title, status: 'todo' },
  });
  expect(res.status(), 'card create should return 201').toBe(201);
}

/**
 * Open a tab to the board and wait until its SSE subscription is live. SSE does not replay missed
 * events, so a subscriber MUST be registered before any mutation — rendering the board runs the
 * subscription effect, and a short settle covers the connect/registration round-trip.
 */
async function openSubscribedTab(page: Page, boardId: number, boardName: string): Promise<void> {
  await page.goto(`/boards/${boardId}`);
  await expect(page.getByRole('heading', { level: 1, name: boardName })).toBeVisible();
  // The feed history fetch settles to its empty state before any move records the first entry.
  await expect(page.getByText('No activity yet')).toBeVisible();
  await page.waitForTimeout(700); // let the EventSource connect + the server register the subscriber
}

/**
 * Feed entries, SCOPED to the Activity landmark. The kanban cards also expose the `listitem` role, so
 * an unscoped `getByRole('listitem')` would also match the board's cards — feed assertions must scope.
 */
function feedItems(page: Page) {
  return page.getByRole('complementary', { name: 'Activity' }).getByRole('listitem');
}

/** Move a card to a target column via the keyboard-accessible MoveCardDialog (deterministic vs. drag). */
async function moveCardViaDialog(page: Page, cardTitle: string, targetLabel: string): Promise<void> {
  await page.getByRole('button', { name: `Move card: ${cardTitle}` }).click();
  await expect(page.getByRole('heading', { name: 'Move card' })).toBeVisible();
  await page.getByRole('radio', { name: targetLabel }).check();
  // `exact` so the submit button does not also match the per-card "Move card: …" buttons.
  await page.getByRole('button', { name: 'Move', exact: true }).click();
}

test.describe.serial('Activity feed — cross-tab live delivery (real backend)', () => {
  test('AC-HAPPY-2: a real card move appears in BOTH the mover and observer tabs within ~1s', async ({
    page,
    browser,
  }) => {
    const boardName = 'Activity RT Board';
    const boardId = await createBoard(page, boardName);
    await createCard(page, boardId, 'Ship the feed');

    // Tab A (the mover).
    await page.goto(`/boards/${boardId}`);
    await expect(
      page.getByRole('region', { name: 'To Do' }).getByText('Ship the feed'),
    ).toBeVisible();
    await expect(page.getByText('No activity yet')).toBeVisible();

    // Tab B (the observer) — a separate context so it has a distinct originId (a genuine "second user").
    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    try {
      await openSubscribedTab(pageB, boardId, boardName);

      // Tab A moves the card To Do → Done via the real PATCH (records a row + broadcasts the event).
      await moveCardViaDialog(page, 'Ship the feed', 'Done');
      await expect(
        page.getByRole('region', { name: 'Done' }).getByText('Ship the feed'),
      ).toBeVisible();

      const movedEntry = /^Ship the feed moved from To Do to Done /;

      // Mover tab sees its OWN entry prepended (activity events carry no originId — AC-HAPPY-2 own-tab).
      await expect(feedItems(page).first()).toHaveAttribute('aria-label', movedEntry, {
        timeout: REALTIME_BUDGET_MS,
      });

      // Observer tab receives the SAME entry over real cross-tab SSE within ~1s (AC-HAPPY-2 cross-tab).
      await expect(feedItems(pageB).first()).toHaveAttribute('aria-label', movedEntry, {
        timeout: REALTIME_BUDGET_MS,
      });

      // The observer's kanban also syncs the moved card (TASK-007 transport intact).
      await expect(
        pageB.getByRole('region', { name: 'Done' }).getByText('Ship the feed'),
      ).toBeVisible({ timeout: REALTIME_BUDGET_MS });

      // Reload the mover tab: the persisted history loads on mount, newest-first (AC-LOAD-1) — proving
      // the move was recorded in activity_events, not just delivered live.
      await page.reload();
      await expect(feedItems(page).first()).toHaveAttribute('aria-label', movedEntry, {
        timeout: REALTIME_BUDGET_MS,
      });
    } finally {
      await contextB.close();
    }
  });
});
