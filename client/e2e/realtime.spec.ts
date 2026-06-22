/**
 * client/e2e/realtime.spec.ts — two-tab real-time collaboration E2E (TASK-007 Phase 6, AC-REALTIME-1/2).
 *
 * Runs in the `realtime` Playwright project against a REAL backend (real PostgreSQL `banyanboard_e2e`
 * + `REALTIME_ENABLED=true`) behind the single-origin Express-served build — NOT the per-test mock the
 * single-tab journeys use. A mocked API can never broadcast an SSE event from one browser context to
 * another, so the live-collaboration ACs are only meaningful end-to-end: a mutation in Tab A must reach
 * Tab B over a genuine `text/event-stream` connection, with no Vite proxy in the path (exactly the prod
 * topology the Architecture creative phase flagged for verification).
 *
 *   AC-REALTIME-1 — a card moved (dragged) in Tab A appears in its new column in Tab B within 2s,
 *                   without a refresh, and OTHER cards are unaffected (stub-detection).
 *   AC-REALTIME-2 — a card created in Tab A appears in Tab B's column within 2s, without a refresh.
 *
 * Two SEPARATE browser contexts back the two tabs, so each gets its own per-tab `originId` — the server
 * echoes that id on every event and the originating tab drops its own echo (Architecture Decision 3 /
 * R5); only a DIFFERENT tab applies the update. Each test provisions its own board (unique name → unique
 * SERIAL id) via the real API, so the shared DB allows parallel, non-interfering runs.
 */

import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { pointerDragCardToColumn } from './fixtures';

/** The 2s localhost real-time budget from productBrief NFRs / AC-REALTIME-1/2. */
const REALTIME_BUDGET_MS = 2000;

/** Create a board through the real API and return its server-assigned id. */
async function createBoard(page: Page, name: string): Promise<number> {
  const res = await page.request.post('/api/v1/boards', { data: { name } });
  expect(res.status(), 'board create should return 201').toBe(201);
  const board = (await res.json()) as { id: number };
  return board.id;
}

/** Create a card on a board through the real API (status defaults to To Do). */
async function createCard(
  page: Page,
  boardId: number,
  title: string,
  status: 'todo' | 'in_progress' | 'done' = 'todo',
): Promise<void> {
  const res = await page.request.post(`/api/v1/boards/${boardId}/cards`, {
    data: { title, status },
  });
  expect(res.status(), 'card create should return 201').toBe(201);
}

/**
 * Open a second tab to the board and wait until its SSE subscription is live on the server. SSE does
 * not replay missed events, so the subscriber MUST be registered before Tab A mutates — rendering the
 * board runs the subscription effect, and a short settle covers the connection/registration round-trip.
 */
async function openSubscribedTab(
  page: Page,
  boardId: number,
  boardName: string,
): Promise<void> {
  await page.goto(`/boards/${boardId}`);
  await expect(page.getByRole('heading', { level: 1, name: boardName })).toBeVisible();
  // Settle: let the EventSource connect and the server register the subscriber before any mutation.
  await page.waitForTimeout(700);
}

test.describe('Two-tab real-time collaboration', () => {
  test('AC-REALTIME-2: a card created in Tab A appears in Tab B within 2s, no refresh', async ({
    page,
    browser,
  }) => {
    const boardName = 'RT Create Board';
    const boardId = await createBoard(page, boardName);

    // Tab A.
    await page.goto(`/boards/${boardId}`);
    await expect(page.getByRole('heading', { level: 1, name: boardName })).toBeVisible();

    // Tab B — a separate context so it has a distinct originId (a genuine "second user").
    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    try {
      await openSubscribedTab(pageB, boardId, boardName);
      const todoB = pageB.getByRole('region', { name: 'To Do' });
      await expect(todoB.getByText('New feature: dark mode')).toHaveCount(0);

      // Tab A creates a card in To Do via the UI.
      const todoA = page.getByRole('region', { name: 'To Do' });
      await todoA.getByRole('button', { name: 'Add card to To Do column' }).click();
      const form = todoA.getByRole('form', { name: 'Add card to To Do' });
      await form.getByLabel('Card title *').fill('New feature: dark mode');
      await form.getByRole('button', { name: 'Add Card' }).click();
      await expect(todoA.getByText('New feature: dark mode')).toBeVisible();

      // Tab B receives the new card over SSE within the 2s budget, with no manual refresh.
      await expect(todoB.getByText('New feature: dark mode')).toBeVisible({
        timeout: REALTIME_BUDGET_MS,
      });
    } finally {
      await contextB.close();
    }
  });

  test('AC-REALTIME-1: a card moved in Tab A moves in Tab B within 2s; other cards unaffected', async ({
    page,
    browser,
  }) => {
    const boardName = 'RT Move Board';
    const boardId = await createBoard(page, boardName);
    await createCard(page, boardId, 'Fix login bug', 'todo');
    await createCard(page, boardId, 'Untouched card', 'todo');

    // Tab A.
    await page.goto(`/boards/${boardId}`);
    await expect(
      page.getByRole('region', { name: 'To Do' }).getByText('Fix login bug'),
    ).toBeVisible();

    // Tab B.
    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    try {
      await openSubscribedTab(pageB, boardId, boardName);
      await expect(
        pageB.getByRole('region', { name: 'To Do' }).getByText('Fix login bug'),
      ).toBeVisible();

      // Tab A drags the card To Do → In Progress (pointer events).
      await pointerDragCardToColumn(page, 'Fix login bug', 'In Progress');
      await expect(
        page.getByRole('region', { name: 'In Progress' }).getByText('Fix login bug'),
      ).toBeVisible();

      // Tab B reflects the move within 2s, without a refresh …
      await expect(
        pageB.getByRole('region', { name: 'In Progress' }).getByText('Fix login bug'),
      ).toBeVisible({ timeout: REALTIME_BUDGET_MS });
      await expect(
        pageB.getByRole('region', { name: 'To Do' }).getByText('Fix login bug'),
      ).toHaveCount(0);

      // Stub-detection: the move is specific to the dragged card — the other card stays in To Do.
      await expect(
        pageB.getByRole('region', { name: 'To Do' }).getByText('Untouched card'),
      ).toBeVisible();
    } finally {
      await contextB.close();
    }
  });
});
