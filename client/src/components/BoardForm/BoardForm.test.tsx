/**
 * client/src/components/BoardForm/BoardForm.test.tsx — board form content tests (TASK-007 Phase 2).
 *
 * BoardForm is a content-only component (name + description fields) reused in two contexts: inside
 * the Dialog for create-board, and inline for edit-board (UI/UX creative Spec 2/3). It owns its own
 * validation + submit state machine and calls the parent-supplied `onSubmit`/`onCancel` — it never
 * imports the apiClient itself, so the page decides which write method to call.
 *
 * Verifies:
 *   - empty name blocks submit, shows the inline `role="alert"` validation error, no onSubmit (AC-ERROR-1)
 *   - a valid submit calls onSubmit with trimmed values (empty description → null)
 *   - Cancel and Escape both call onCancel without submitting (AC-NAV-1)
 *   - the submit button is disabled while a submit is in flight (AC-LOADING-1)
 *   - an onSubmit rejection surfaces the safe write-error copy and preserves the user's input (AC-ERROR-3)
 *   - initialValues pre-fill the fields (edit mode)
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BoardForm } from './BoardForm';
import { ApiError } from '../../api/apiClient';

function renderForm(overrides: Partial<Parameters<typeof BoardForm>[0]> = {}) {
  const onSubmit = overrides.onSubmit ?? vi.fn().mockResolvedValue(undefined);
  const onCancel = overrides.onCancel ?? vi.fn();
  render(
    <BoardForm
      formLabel="Create board"
      submitLabel="Create Board"
      onSubmit={onSubmit}
      onCancel={onCancel}
      {...overrides}
    />,
  );
  return { onSubmit, onCancel };
}

describe('BoardForm', () => {
  it('renders a required name field and an optional description field', () => {
    renderForm();
    expect(screen.getByRole('textbox', { name: /board name/i })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /description/i })).toBeInTheDocument();
  });

  it('blocks submit and shows a validation alert when the name is empty (AC-ERROR-1)', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();

    await user.click(screen.getByRole('button', { name: 'Create Board' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Board name is required');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('does not submit a name that is only whitespace (AC-ERROR-1)', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();

    await user.type(screen.getByRole('textbox', { name: /board name/i }), '   ');
    await user.click(screen.getByRole('button', { name: 'Create Board' }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Board name is required');
  });

  it('calls onSubmit with trimmed values and null for an empty description (AC-HAPPY-1)', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();

    await user.type(screen.getByRole('textbox', { name: /board name/i }), '  Sprint 42  ');
    await user.click(screen.getByRole('button', { name: 'Create Board' }));

    expect(onSubmit).toHaveBeenCalledWith({ name: 'Sprint 42', description: null });
  });

  it('passes the description through when provided', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();

    await user.type(screen.getByRole('textbox', { name: /board name/i }), 'Sprint 42');
    await user.type(screen.getByRole('textbox', { name: /description/i }), 'Q3 planning');
    await user.click(screen.getByRole('button', { name: 'Create Board' }));

    expect(onSubmit).toHaveBeenCalledWith({ name: 'Sprint 42', description: 'Q3 planning' });
  });

  it('calls onCancel when the cancel button is clicked, without submitting (AC-NAV-1)', async () => {
    const user = userEvent.setup();
    const { onSubmit, onCancel } = renderForm();

    await user.click(screen.getByRole('button', { name: /cancel/i }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('calls onCancel when Escape is pressed in the form (AC-NAV-1)', async () => {
    const user = userEvent.setup();
    const { onCancel } = renderForm();

    await user.type(screen.getByRole('textbox', { name: /board name/i }), 'x');
    await user.keyboard('{Escape}');

    expect(onCancel).toHaveBeenCalled();
  });

  it('disables the submit button while the submit is in flight (AC-LOADING-1)', async () => {
    const user = userEvent.setup();
    // Never-resolving promise so the submit stays pending.
    const onSubmit = vi.fn(() => new Promise<void>(() => {}));
    renderForm({ onSubmit });

    await user.type(screen.getByRole('textbox', { name: /board name/i }), 'Sprint 42');
    await user.click(screen.getByRole('button', { name: 'Create Board' }));

    expect(screen.getByRole('button', { name: 'Create Board' })).toBeDisabled();
  });

  it('shows safe write-error copy and preserves input when onSubmit rejects (AC-ERROR-3)', async () => {
    const user = userEvent.setup();
    const onSubmit = vi
      .fn()
      .mockRejectedValue(new ApiError('server', 'secret stack at db.query internal-detail'));
    renderForm({ onSubmit });

    await user.type(screen.getByRole('textbox', { name: /board name/i }), 'Sprint 42');
    await user.click(screen.getByRole('button', { name: 'Create Board' }));

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText("Couldn't save changes")).toBeInTheDocument();
    // Guiding Principle 5: no internal detail leaks to the user.
    expect(screen.queryByText(/internal-detail/)).not.toBeInTheDocument();
    expect(screen.queryByText(/db\.query/)).not.toBeInTheDocument();
    // Input is preserved so the user can retry without re-typing.
    expect(screen.getByRole('textbox', { name: /board name/i })).toHaveValue('Sprint 42');
  });

  it('pre-fills the fields from initialValues (edit mode)', () => {
    renderForm({
      initialValues: { name: 'Alpha Project', description: 'existing desc' },
      submitLabel: 'Save',
    });
    expect(screen.getByRole('textbox', { name: /board name/i })).toHaveValue('Alpha Project');
    expect(screen.getByRole('textbox', { name: /description/i })).toHaveValue('existing desc');
  });
});
