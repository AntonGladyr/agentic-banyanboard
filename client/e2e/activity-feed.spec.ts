/**
 * client/e2e/activity-feed.spec.ts — Realtime Activity Feed E2E, hermetic `chromium` project
 * (TASK-008 Phase 4; implements memory-bank/uat/spec-TASK-008-e2e.md Scenarios 1–3).
 *
 * These run against the mocked API (`page.route` via fixtures.ts) — DB-free, no Postgres. The feed's
 * own SSE-delivered "own-tab live entry" (Scenario 1) is exercised by INJECTING a simulated
 * `activity:card_moved` frame through a controllable `EventSource` stub (installFakeEventSource +
 * emitActivityFrame) — a mocked project cannot broadcast a real one. The genuine two-tab cross-tab SSE
 * path lives in activity-feed.realtime.spec.ts (the `realtime` project, real backend).
 *
 * AC coverage here: AC-ENTRY-1 (panel visible), AC-EMPTY-1 (empty state), AC-LOAD-1 / AC-HAPPY-3
 * (persisted history newest-first), AC-LOADING-1 (Spinner during a delayed fetch), AC-HAPPY-2 own-tab
 * (live entry prepends), Scenario 2 (mobile stack-below layout), Scenario 3 (non-fatal feed error).
 */

import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  HAPPY_PATH_SEED,
  seedApi,
  seedWritableApi,
  seedActivity,
  seedActivityRoute,
  makeActivity,
  installFakeEventSource,
  emitActivityFrame,
} from './fixtures';
import type { ActivityFixture } from './fixtures';

const BOARD_ID = 1;
const BOARD_NAME = 'Sprint Board';
const BOARD_PATH = `/boards/${BOARD_ID}`;

/** Newest-first activity history (occurred_at DESC) — AC-HAPPY-3 ordering contract. */
function historyFixtures(): ActivityFixture[] {
  const now = Date.now();
  const minutesAgo = (m: number): string => new Date(now - m * 60_000).toISOString();
  return [
    // index 0 = newest, must render at the TOP of the feed.
    makeActivity(2, BOARD_ID, 13, 'Write smoke tests', 'in_progress', 'done', minutesAgo(5)),
    makeActivity(1, BOARD_ID, 12, 'Implement API client', 'todo', 'in_progress', minutesAgo(30)),
  ];
}

/** Fail any test that triggers a native browser dialog (the journey's Verify item — none should fire). */
function failOnNativeDialog(page: Page): void {
  page.on('dialog', (dialog) => {
    throw new Error(`Unexpected native ${dialog.type()} dialog: "${dialog.message()}"`);
  });
}

/**
 * Feed entries, SCOPED to the Activity landmark. The kanban cards also expose the `listitem` role, so
 * an unscoped `getByRole('listitem')` would also match the board's cards — feed assertions must scope.
 */
function feedItems(page: Page) {
  return page.getByRole('complementary', { name: 'Activity' }).getByRole('listitem');
}

/** The always-present feed landmark + its heading (AC-ENTRY-1 — visible without any interaction). */
function expectFeedPanelVisible(page: Page): Promise<void> {
  const panel = page.getByRole('complementary', { name: 'Activity' });
  return Promise.all([
    expect(panel).toBeVisible(),
    expect(page.getByRole('heading', { name: 'Activity', level: 2 })).toBeVisible(),
  ]).then(() => undefined);
}

test.describe.serial('Activity feed — happy path (mocked)', () => {
  test.beforeEach(async ({ page }) => {
    failOnNativeDialog(page);
    await installFakeEventSource(page);
  });

  test('AC-ENTRY-1 + AC-EMPTY-1: panel is visible and shows the empty state when there is no activity', async ({
    page,
  }) => {
    await seedApi(page, HAPPY_PATH_SEED);
    await seedActivity(page, []); // 200 [] — no recorded moves

    await page.goto(BOARD_PATH);
    await expect(page.getByRole('heading', { level: 1, name: BOARD_NAME })).toBeVisible();

    await expectFeedPanelVisible(page);
    // A real empty state, not a blank area or a stuck spinner (AC-EMPTY-1).
    await expect(page.getByText('No activity yet')).toBeVisible();
    await expect(feedItems(page)).toHaveCount(0);
  });

  test('AC-LOAD-1 + AC-HAPPY-3: persisted history renders newest-first with title, from→to, timestamp', async ({
    page,
  }) => {
    await seedApi(page, HAPPY_PATH_SEED);
    await seedActivity(page, historyFixtures());

    await page.goto(BOARD_PATH);
    await expectFeedPanelVisible(page);

    const items = feedItems(page);
    await expect(items).toHaveCount(2);

    // Newest-first: the in_progress→done move is at the top, the todo→in_progress move second.
    await expect(items.nth(0)).toHaveAttribute(
      'aria-label',
      /^Write smoke tests moved from In Progress to Done .+/,
    );
    await expect(items.nth(1)).toHaveAttribute(
      'aria-label',
      /^Implement API client moved from To Do to In Progress .+/,
    );

    // Visible content: card title + human from→to labels are shown (AC-LOAD-1 / AC-ENTRY-1).
    await expect(items.nth(0)).toContainText('Write smoke tests');
    await expect(items.nth(0)).toContainText('In Progress');
    await expect(items.nth(0)).toContainText('Done');

    // Live-region attributes are present so screen readers announce additions (UI/UX § Decision Area 5).
    const list = page.locator('aside ul[role="list"]');
    await expect(list).toHaveAttribute('aria-live', 'polite');
    await expect(list).toHaveAttribute('aria-relevant', 'additions');
  });

  test('AC-LOADING-1: a slow activity fetch shows the Spinner before the list', async ({ page }) => {
    await seedApi(page, HAPPY_PATH_SEED);
    // Delay > the Spinner's 200ms appearance delay so it is observable (sub-200ms hides it by design).
    await seedActivity(page, historyFixtures(), 700);

    await page.goto(BOARD_PATH);
    const panel = page.getByRole('complementary', { name: 'Activity' });
    await expect(panel).toBeVisible();

    // While the fetch is in flight, the feed body is the loading Spinner — not blank, not the list.
    await expect(panel.getByRole('status', { name: 'Loading content' })).toBeVisible();

    // Once the delayed response resolves, the list replaces the Spinner.
    await expect(feedItems(page)).toHaveCount(2);
    await expect(panel.getByRole('status', { name: 'Loading content' })).toHaveCount(0);
  });

  test('AC-HAPPY-2 (own tab): moving a card prepends a new live entry at the top of the feed', async ({
    page,
  }) => {
    await seedWritableApi(page, HAPPY_PATH_SEED); // PATCH must succeed for the move
    await seedActivity(page, []); // start empty, then the move adds the first entry

    await page.goto(BOARD_PATH);
    await expectFeedPanelVisible(page);
    await expect(page.getByText('No activity yet')).toBeVisible();

    // Open the per-card Move dialog (keyboard-accessible move path — distinct from the drag handle).
    await page.getByRole('button', { name: 'Move card: Design login screen' }).click();
    await expect(page.getByRole('heading', { name: 'Move card' })).toBeVisible();
    await page.getByRole('radio', { name: 'In Progress' }).check();

    const patch = page.waitForResponse(
      (r) => /\/api\/v1\/boards\/\d+\/cards\/11$/.test(r.url()) && r.request().method() === 'PATCH',
    );
    // `exact` so the submit button does not also match the per-card "Move card: …" buttons.
    await page.getByRole('button', { name: 'Move', exact: true }).click();
    await patch;

    // The card moved optimistically to its new column on the kanban (Scenario 1 step 5).
    await expect(
      page.getByRole('region', { name: 'In Progress' }).getByText('Design login screen'),
    ).toBeVisible();

    // Now the server "broadcasts" the recorded move — inject the activity:card_moved frame (no originId,
    // so the originating tab is NOT echo-dropped; the mover sees its own entry — AC-HAPPY-2.2).
    await emitActivityFrame(
      page,
      makeActivity(
        9001,
        BOARD_ID,
        11,
        'Design login screen',
        'todo',
        'in_progress',
        new Date().toISOString(),
      ),
    );

    // A new entry prepends at the TOP of the feed within ~1s, with the correct title + source→target +
    // a "just now" timestamp, replacing the empty state.
    const items = feedItems(page);
    await expect(items).toHaveCount(1, { timeout: 2000 });
    await expect(items.nth(0)).toHaveAttribute(
      'aria-label',
      /^Design login screen moved from To Do to In Progress just now$/,
    );
    await expect(page.getByText('No activity yet')).toHaveCount(0);
  });
});

test.describe('Activity feed — mobile viewport (Scenario 2)', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test('Scenario 2: the feed stacks BELOW the full-width kanban at ≤900px, no body horizontal overflow', async ({
    page,
  }) => {
    failOnNativeDialog(page);
    await installFakeEventSource(page);
    await seedApi(page, HAPPY_PATH_SEED);
    await seedActivity(page, historyFixtures());

    await page.goto(BOARD_PATH);
    await expect(page.getByRole('heading', { level: 1, name: BOARD_NAME })).toBeVisible();

    const feed = page.getByRole('complementary', { name: 'Activity' });
    await expect(feed).toBeVisible();

    const todoColumn = page.getByRole('region', { name: 'To Do' });
    const feedBox = await feed.boundingBox();
    const todoBox = await todoColumn.boundingBox();
    if (feedBox === null || todoBox === null) {
      throw new Error('Could not resolve feed or kanban column bounding box');
    }

    // Stack-below signature: the feed sits vertically below the kanban (greater y) and is NOT pushed
    // into a right sidebar (its left edge overlaps the columns horizontally, rather than sitting beyond
    // the columns' right edge as it would on the desktop two-column layout).
    expect(feedBox.y).toBeGreaterThan(todoBox.y);
    expect(feedBox.x).toBeLessThan(todoBox.x + todoBox.width);

    // The page body must not scroll horizontally (the kanban's own overflow-x is the only x-scroller).
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1); // allow a 1px rounding tolerance

    // The feed content stays legible (visible, non-zero size).
    await expect(feedItems(page).first()).toBeVisible();
  });
});

test.describe('Activity feed — non-fatal fetch error (Scenario 3)', () => {
  test('Scenario 3: an activity-fetch 500 shows a compact inline error; the board still renders', async ({
    page,
  }) => {
    failOnNativeDialog(page);
    await installFakeEventSource(page);
    await seedApi(page, HAPPY_PATH_SEED);
    // The board/cards fetches succeed; only the activity fetch fails — its failure is non-fatal.
    await seedActivityRoute(page, (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal Server Error' }),
      }),
    );

    await page.goto(BOARD_PATH);

    // The board and kanban render normally — the feed failure does not knock out the page.
    await expect(page.getByRole('heading', { level: 1, name: BOARD_NAME })).toBeVisible();
    await expect(page.getByRole('region', { name: 'To Do' })).toBeVisible();

    // The feed shows a compact, safe inline error — no raw JSON, no internal detail (GP5).
    const feed = page.getByRole('complementary', { name: 'Activity' });
    await expect(feed.getByText('Could not load activity')).toBeVisible();
    await expect(feed.getByText('Try reloading the page.')).toBeVisible();
    await expect(feed.getByText(/Internal Server Error|500|stack/i)).toHaveCount(0);
  });
});
