/**
 * client/e2e/board-journeys.spec.ts — entry-to-success E2E journeys (TASK-006 Phase 5).
 *
 * Implements the AC journeys from memory-bank/tasks/TASK-006.md as runnable Playwright specs,
 * driven against the real Express-served SPA (SERVE_CLIENT=true) with the read API mocked per-test
 * (see fixtures.ts). Each test maps to one or more acceptance criteria, called out inline.
 *
 *   AC-ENTRY-1 / AC-HAPPY-1 — list → click board → cards in the correct columns (+ stub-detection)
 *   AC-ENTRY-2              — empty board list shows the empty state
 *   AC-HAPPY-2              — back-navigation returns to the board list
 *   AC-HAPPY-3              — board with no cards shows three columns, each empty
 *   AC-ERROR-1              — API unreachable on the list shows the error state
 *   AC-ERROR-2              — unknown board id (404) shows the error state with back-nav
 *   AC-NAV-1                — direct URL load / refresh of /boards/:id renders the SPA
 */

import { test, expect } from '@playwright/test';
import { seedApi, HAPPY_PATH_SEED, BOARDS, makeBoard } from './fixtures';

test.describe('Board list journeys', () => {
  test('AC-ENTRY-1 + AC-HAPPY-1: lists boards, navigates, and shows board-specific cards by column', async ({
    page,
  }) => {
    await seedApi(page);
    await page.goto('/');

    // The list page identifies the app and shows the seeded board names as navigable links.
    await expect(page.getByRole('heading', { level: 1, name: 'Boards' })).toBeVisible();
    const sprintLink = page.getByRole('link', { name: /Sprint Board/ });
    await expect(sprintLink).toBeVisible();
    await expect(page.getByRole('link', { name: /Personal Tasks/ })).toBeVisible();

    // Navigate into the first board.
    await sprintLink.click();
    await expect(page).toHaveURL(/\/boards\/1$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Sprint Board' })).toBeVisible();

    // Cards are partitioned into the correct status columns (region landmarks labelled per column).
    const todo = page.getByRole('region', { name: 'To Do' });
    const inProgress = page.getByRole('region', { name: 'In Progress' });
    const done = page.getByRole('region', { name: 'Done' });
    await expect(todo.getByText('Design login screen')).toBeVisible();
    await expect(inProgress.getByText('Implement API client')).toBeVisible();
    await expect(done.getByText('Write smoke tests')).toBeVisible();

    // Stub-detection: a DIFFERENT board shows a DIFFERENT set of cards.
    await page.goto('/boards/2');
    await expect(page.getByRole('heading', { level: 1, name: 'Personal Tasks' })).toBeVisible();
    await expect(page.getByText('Buy groceries')).toBeVisible();
    await expect(page.getByText('Design login screen')).toHaveCount(0);
  });

  test('AC-ENTRY-2: empty board list shows the empty state', async ({ page }) => {
    await seedApi(page, { boards: [], cardsByBoard: {} });
    await page.goto('/');

    await expect(page.getByRole('heading', { level: 1, name: 'Boards' })).toBeVisible();
    await expect(page.getByText('No boards yet')).toBeVisible();
    // No board links are rendered.
    await expect(page.getByRole('link', { name: /Sprint Board/ })).toHaveCount(0);
  });

  test('AC-ERROR-1: API unreachable on the list shows the error state, not a blank screen', async ({
    page,
  }) => {
    // Abort the boards request to simulate an unreachable backend → apiClient maps to 'network'.
    await page.route('**/api/v1/boards', (route) => route.abort());
    await page.goto('/');

    await expect(page.getByText('Could not load boards')).toBeVisible();
    // The generic, internal-detail-free copy is shown (Guiding Principle 5).
    await expect(page.getByText(/server is not reachable/i)).toBeVisible();
  });
});

test.describe('Board view journeys', () => {
  test('AC-HAPPY-2: back-navigation returns to the board list', async ({ page }) => {
    await seedApi(page);
    await page.goto('/boards/1');
    await expect(page.getByRole('heading', { level: 1, name: 'Sprint Board' })).toBeVisible();

    await page.getByRole('link', { name: /Back to boards/ }).click();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Boards' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Sprint Board/ })).toBeVisible();
  });

  test('AC-HAPPY-3: a board with no cards renders all three columns, each empty', async ({
    page,
  }) => {
    // Board 3 exists but has zero cards.
    await seedApi(page, {
      boards: [...BOARDS, makeBoard(3, 'Empty Board', null)],
      cardsByBoard: { ...HAPPY_PATH_SEED.cardsByBoard, 3: [] },
    });
    await page.goto('/boards/3');

    await expect(page.getByRole('heading', { level: 1, name: 'Empty Board' })).toBeVisible();
    // All three column regions are present (never omitted) and each shows the empty state.
    await expect(page.getByRole('region', { name: 'To Do' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'In Progress' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Done' })).toBeVisible();
    await expect(page.getByText('No cards yet')).toHaveCount(3);
  });

  test('AC-ERROR-2: unknown board id shows the not-found state with back-nav still present', async ({
    page,
  }) => {
    await seedApi(page); // board 99999 is not in the seed → mocked 404
    await page.goto('/boards/99999');

    await expect(page.getByText('Board not found')).toBeVisible();
    // The recovery affordance is still reachable in the error state.
    await expect(page.getByRole('link', { name: /Back to boards/ })).toBeVisible();
  });

  test('AC-NAV-1: direct URL load of /boards/:id renders the SPA (Express history fallback)', async ({
    page,
  }) => {
    await seedApi(page);

    // Navigate directly to the deep route (no prior visit to '/') — the document request is served
    // by the real Express SPA history fallback, then the SPA renders the board view.
    const response = await page.goto('/boards/1');
    expect(response?.status()).toBe(200);

    await expect(page.getByRole('heading', { level: 1, name: 'Sprint Board' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'To Do' }).getByText('Design login screen')).toBeVisible();

    // A reload of the same deep URL must also render (refresh path of AC-NAV-1).
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Sprint Board' })).toBeVisible();
  });
});
