/**
 * client/e2e/interactive-journeys.spec.ts — single-tab interactive E2E journeys (TASK-007 Phase 6).
 *
 * Drives the create/edit/drag write journeys through the REAL Express-served SPA, with the API mocked
 * per-test by the WRITE-AWARE stateful fixture (`seedWritableApi`) so an optimistic UI change can be
 * confirmed against the "server" and a post-drag reload shows the persisted status. Each test maps to
 * the concrete acceptance criteria from memory-bank/tasks/TASK-007.md, called out inline.
 *
 *   AC-HAPPY-1 — create a board from `/` → appears in the list with the correct name
 *   AC-HAPPY-2 — edit a board's name → heading updates in place AND the list reflects it
 *   AC-HAPPY-3 — create a card in a NAMED column → lands in that column only (status-scoped)
 *   AC-HAPPY-4 — edit a card's title + description → updates in place
 *   AC-HAPPY-5 — drag a card across columns (pointer events) → moves + persists across a reload
 *   AC-NAV-1   — cancel a create form → no write request is issued, card count unchanged
 *   AC-ERROR-3 — a failed write surfaces a safe error and preserves the user's input
 *
 * Real-time two-tab journeys (AC-REALTIME-1/2) live in realtime.spec.ts (the `realtime` project, real
 * backend) — they cannot be exercised through a mock, which can never broadcast across browser contexts.
 */

import { test, expect } from '@playwright/test';
import { seedWritableApi, pointerDragCardToColumn, BOARDS } from './fixtures';

test.describe('Create / edit board journeys', () => {
  test('AC-HAPPY-1: create a new board from the list and see it appear', async ({ page }) => {
    await seedWritableApi(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Boards' })).toBeVisible();

    // Open the create-board modal, fill the required name, submit.
    await page.getByRole('button', { name: '+ New Board' }).click();
    const dialog = page.getByRole('dialog', { name: 'Create Board' });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('Board name *').fill('Sprint 42');
    await dialog.getByRole('button', { name: 'Create Board' }).click();

    // The new board appears in the list as a navigable entry (server-assigned, not a placeholder).
    await expect(dialog).toBeHidden();
    const newBoard = page.getByRole('link', { name: /Sprint 42/ });
    await expect(newBoard).toBeVisible();
    // It links to a real board view that loads.
    await newBoard.click();
    await expect(page.getByRole('heading', { level: 1, name: 'Sprint 42' })).toBeVisible();
  });

  test('AC-HAPPY-2: edit a board name → heading updates in place and the list reflects it', async ({
    page,
  }) => {
    await seedWritableApi(page);
    await page.goto('/boards/1');
    await expect(page.getByRole('heading', { level: 1, name: 'Sprint Board' })).toBeVisible();

    // Activate the inline edit affordance next to the board name, change the name, save.
    await page.getByRole('button', { name: 'Edit board name' }).click();
    const editForm = page.getByRole('form', { name: 'Edit board name' });
    await editForm.getByLabel('Board name *').fill('Sprint Board v2');
    await editForm.getByRole('button', { name: 'Save' }).click();

    // The heading updates without a reload …
    await expect(page.getByRole('heading', { level: 1, name: 'Sprint Board v2' })).toBeVisible();
    // … and the change is persisted (the list shows the new name on navigation back).
    await page.getByRole('link', { name: /Back to boards/ }).click();
    await expect(page.getByRole('link', { name: /Sprint Board v2/ })).toBeVisible();
  });
});

test.describe('Create / edit card journeys', () => {
  test('AC-HAPPY-3: create a card in the In Progress column → lands there only', async ({ page }) => {
    await seedWritableApi(page);
    await page.goto('/boards/1');

    const inProgress = page.getByRole('region', { name: 'In Progress' });
    await inProgress.getByRole('button', { name: 'Add card to In Progress column' }).click();

    // The inline add-card form is scoped to this column; fill the required title and submit.
    const addForm = inProgress.getByRole('form', { name: 'Add card to In Progress' });
    await addForm.getByLabel('Card title *').fill('Implement websocket handler');
    await addForm.getByRole('button', { name: 'Add Card' }).click();

    // The card appears in In Progress and NOWHERE else (status-scoped — AC-HAPPY-3 stub-detection).
    await expect(inProgress.getByText('Implement websocket handler')).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'To Do' }).getByText('Implement websocket handler'),
    ).toHaveCount(0);
    await expect(
      page.getByRole('region', { name: 'Done' }).getByText('Implement websocket handler'),
    ).toHaveCount(0);
  });

  test('AC-HAPPY-4: edit a card title and description → updates in place', async ({ page }) => {
    await seedWritableApi(page);
    await page.goto('/boards/1');

    const todo = page.getByRole('region', { name: 'To Do' });
    await expect(todo.getByText('Design login screen')).toBeVisible();
    await page.getByRole('button', { name: 'Edit card: Design login screen' }).click();

    const dialog = page.getByRole('dialog', { name: 'Edit Card' });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('Card title *').fill('Design login screen v2');
    await dialog.getByLabel('Description (optional)').fill('Wireframe + happy-path validation');
    await dialog.getByRole('button', { name: 'Save Changes' }).click();

    // The updated title is shown in the same (To Do) column; the old title is gone (stub-detection).
    await expect(dialog).toBeHidden();
    await expect(todo.getByText('Design login screen v2')).toBeVisible();
    await expect(todo.getByText('Design login screen', { exact: true })).toHaveCount(0);
  });
});

test.describe('Drag-and-drop journey', () => {
  test('AC-HAPPY-5: drag a card from To Do to In Progress (pointer) and persist across reload', async ({
    page,
  }) => {
    await seedWritableApi(page);
    await page.goto('/boards/1');

    const todo = page.getByRole('region', { name: 'To Do' });
    const inProgress = page.getByRole('region', { name: 'In Progress' });
    await expect(todo.getByText('Design login screen')).toBeVisible();

    await pointerDragCardToColumn(page, 'Design login screen', 'In Progress');

    // The card left To Do and arrived in In Progress (optimistic move applied).
    await expect(inProgress.getByText('Design login screen')).toBeVisible();
    await expect(todo.getByText('Design login screen')).toHaveCount(0);

    // The status change was persisted: a full reload (re-fetch from the "server") keeps it in place.
    await page.reload();
    await expect(
      page.getByRole('region', { name: 'In Progress' }).getByText('Design login screen'),
    ).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'To Do' }).getByText('Design login screen'),
    ).toHaveCount(0);
  });
});

test.describe('Cancel + error journeys', () => {
  test('AC-NAV-1: cancelling the add-card form issues no write and leaves the column unchanged', async ({
    page,
  }) => {
    const log = await seedWritableApi(page);
    await page.goto('/boards/1');

    const todo = page.getByRole('region', { name: 'To Do' });
    const beforeCount = await todo.getByRole('heading', { level: 3 }).count();

    await todo.getByRole('button', { name: 'Add card to To Do column' }).click();
    const addForm = todo.getByRole('form', { name: 'Add card to To Do' });
    await addForm.getByLabel('Card title *').fill('A card I will abandon');
    // Escape cancels the inline form (AC-NAV-1).
    await page.keyboard.press('Escape');

    await expect(addForm).toBeHidden();
    await expect(todo.getByRole('heading', { level: 3 })).toHaveCount(beforeCount);
    // No write request was ever issued.
    expect(log.writes).toHaveLength(0);
  });

  test('AC-ERROR-3: a failed board create shows a safe error and preserves the input', async ({
    page,
  }) => {
    // Reads succeed; the POST fails with a 500 so the form surfaces the safe write-error copy.
    await page.route('**/api/v1/boards', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Internal Server Error' }),
        });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(BOARDS) });
    });

    await page.goto('/');
    await page.getByRole('button', { name: '+ New Board' }).click();
    const dialog = page.getByRole('dialog', { name: 'Create Board' });
    await dialog.getByLabel('Board name *').fill('Doomed Board');
    await dialog.getByRole('button', { name: 'Create Board' }).click();

    // A safe, category-keyed error is shown (no HTTP status / server detail leaked — GP5) …
    await expect(dialog.getByText("Couldn't save changes")).toBeVisible();
    // … and the user's input is preserved so they can retry without re-typing (AC-ERROR-3).
    await expect(dialog.getByLabel('Board name *')).toHaveValue('Doomed Board');
  });
});
