/**
 * client/src/components/CardForm/CardForm.test.tsx — card form content tests (TASK-007 Phase 3).
 *
 * CardForm is a content-only component (title + optional description) reused in two contexts: inline
 * within a Column for create-card (title only — `showDescription={false}`), and inside the Dialog for
 * edit-card (title + description). It mirrors BoardForm: it owns its own validation + submit state
 * machine and calls the parent-supplied `onSubmit`/`onCancel` — it never imports the apiClient, so the
 * parent decides which write method to call.
 *
 * Verifies:
 *   - title field always present; description present only when `showDescription` (default true)
 *   - empty/whitespace title blocks submit, shows the inline `role="alert"` validation error (AC-ERROR-2)
 *   - a valid submit calls onSubmit with trimmed values (empty description → null)
 *   - Cancel and Escape both call onCancel without submitting (AC-NAV-1)
 *   - the submit button is disabled while a submit is in flight (AC-LOADING-1)
 *   - an onSubmit rejection surfaces the safe write-error copy and preserves input (AC-ERROR-3)
 *   - initialValues pre-fill the fields (edit mode — AC-HAPPY-4)
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CardForm } from './CardForm';
import { ApiError } from '../../api/apiClient';

function renderForm(overrides: Partial<Parameters<typeof CardForm>[0]> = {}) {
  const onSubmit = overrides.onSubmit ?? vi.fn().mockResolvedValue(undefined);
  const onCancel = overrides.onCancel ?? vi.fn();
  render(
    <CardForm
      formLabel="Add card to To Do"
      submitLabel="Add Card"
      onSubmit={onSubmit}
      onCancel={onCancel}
      {...overrides}
    />,
  );
  return { onSubmit, onCancel };
}

describe('CardForm', () => {
  it('renders a required title field', () => {
    renderForm();
    expect(screen.getByRole('textbox', { name: /title/i })).toBeInTheDocument();
  });

  it('renders the description field by default (edit context)', () => {
    renderForm({ submitLabel: 'Save Changes' });
    expect(screen.getByRole('textbox', { name: /description/i })).toBeInTheDocument();
  });

  it('omits the description field when showDescription is false (inline create context)', () => {
    renderForm({ showDescription: false });
    expect(screen.getByRole('textbox', { name: /title/i })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /description/i })).not.toBeInTheDocument();
  });

  it('blocks submit and shows a validation alert when the title is empty (AC-ERROR-2)', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();

    await user.click(screen.getByRole('button', { name: 'Add Card' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Card title is required');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('does not submit a title that is only whitespace (AC-ERROR-2)', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();

    await user.type(screen.getByRole('textbox', { name: /title/i }), '   ');
    await user.click(screen.getByRole('button', { name: 'Add Card' }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Card title is required');
  });

  it('calls onSubmit with the trimmed title and null description in create context (AC-HAPPY-3)', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm({ showDescription: false });

    await user.type(screen.getByRole('textbox', { name: /title/i }), '  Implement websocket handler  ');
    await user.click(screen.getByRole('button', { name: 'Add Card' }));

    expect(onSubmit).toHaveBeenCalledWith({ title: 'Implement websocket handler', description: null });
  });

  it('passes the description through when provided (edit context — AC-HAPPY-4)', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm({ submitLabel: 'Save Changes' });

    await user.type(screen.getByRole('textbox', { name: /title/i }), 'Fix login redirect bug');
    await user.type(
      screen.getByRole('textbox', { name: /description/i }),
      'POST /login should redirect to dashboard after success',
    );
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    expect(onSubmit).toHaveBeenCalledWith({
      title: 'Fix login redirect bug',
      description: 'POST /login should redirect to dashboard after success',
    });
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

    await user.type(screen.getByRole('textbox', { name: /title/i }), 'x');
    await user.keyboard('{Escape}');

    expect(onCancel).toHaveBeenCalled();
  });

  it('disables the submit button while the submit is in flight (AC-LOADING-1)', async () => {
    const user = userEvent.setup();
    // Never-resolving promise so the submit stays pending.
    const onSubmit = vi.fn(() => new Promise<void>(() => {}));
    renderForm({ onSubmit });

    await user.type(screen.getByRole('textbox', { name: /title/i }), 'New card');
    await user.click(screen.getByRole('button', { name: 'Add Card' }));

    expect(screen.getByRole('button', { name: 'Add Card' })).toBeDisabled();
  });

  it('shows safe write-error copy and preserves input when onSubmit rejects (AC-ERROR-3)', async () => {
    const user = userEvent.setup();
    const onSubmit = vi
      .fn()
      .mockRejectedValue(new ApiError('server', 'secret stack at db.query internal-detail'));
    renderForm({ onSubmit });

    await user.type(screen.getByRole('textbox', { name: /title/i }), 'New card');
    await user.click(screen.getByRole('button', { name: 'Add Card' }));

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText("Couldn't save changes")).toBeInTheDocument();
    // Guiding Principle 5: no internal detail leaks to the user.
    expect(screen.queryByText(/internal-detail/)).not.toBeInTheDocument();
    expect(screen.queryByText(/db\.query/)).not.toBeInTheDocument();
    // Input is preserved so the user can retry without re-typing.
    expect(screen.getByRole('textbox', { name: /title/i })).toHaveValue('New card');
  });

  it('pre-fills the fields from initialValues (edit mode — AC-HAPPY-4)', () => {
    renderForm({
      initialValues: { title: 'Fix login bug', description: 'existing desc' },
      submitLabel: 'Save Changes',
    });
    expect(screen.getByRole('textbox', { name: /title/i })).toHaveValue('Fix login bug');
    expect(screen.getByRole('textbox', { name: /description/i })).toHaveValue('existing desc');
  });
});
