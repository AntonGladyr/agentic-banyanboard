/**
 * client/src/components/Dialog/Dialog.test.tsx — modal dialog primitive tests (TASK-007 Phase 2).
 *
 * The Dialog wraps the native HTML `<dialog>` element (UI/UX creative Spec 1). Verifies the
 * behaviors the forms depend on:
 *   - renders nothing when `open` is false; renders content + role="dialog" when open
 *   - exposes an accessible name via `aria-labelledby` → the title heading
 *   - the close (×) button invokes `onClose` (AC-NAV-1)
 *   - Escape invokes `onClose` (AC-NAV-1)
 *
 * jsdom does not implement `HTMLDialogElement.showModal()`; the component guards that call and falls
 * back to the `open` attribute, so these tests exercise the same code path that runs in a browser.
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Dialog } from './Dialog';

describe('Dialog', () => {
  it('renders nothing when closed', () => {
    render(
      <Dialog open={false} title="Create Board" onClose={() => {}}>
        <p>form body</p>
      </Dialog>,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('form body')).not.toBeInTheDocument();
  });

  it('renders the title, content, and an accessible dialog name when open', () => {
    render(
      <Dialog open title="Create Board" onClose={() => {}}>
        <p>form body</p>
      </Dialog>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAccessibleName('Create Board');
    expect(screen.getByRole('heading', { level: 2, name: 'Create Board' })).toBeInTheDocument();
    expect(screen.getByText('form body')).toBeInTheDocument();
  });

  it('calls onClose when the close button is activated (AC-NAV-1)', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <Dialog open title="Create Board" onClose={onClose}>
        <p>form body</p>
      </Dialog>,
    );
    await user.click(screen.getByRole('button', { name: /close dialog/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when Escape is pressed (AC-NAV-1)', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <Dialog open title="Create Board" onClose={onClose}>
        <input aria-label="field" />
      </Dialog>,
    );
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });
});
