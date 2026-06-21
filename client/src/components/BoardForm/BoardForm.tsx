/**
 * client/src/components/BoardForm/BoardForm.tsx — create/edit board form content (TASK-007 Phase 2).
 *
 * UI/UX creative Spec 2/3: a content-only form (name + optional description) reused in two contexts —
 * inside the Dialog for create-board, and inline (replacing the `<h1>`) for edit-board. It owns its
 * own validation + submit state machine and delegates the actual write to the parent via `onSubmit`,
 * so it never imports the apiClient: the page chooses `createBoard` vs `updateBoard`.
 *
 * State machine (mirrors the FEAT-006 page pattern): `idle | submitting | error`.
 *   - On submit, a blank/whitespace name is rejected client-side with an inline `role="alert"` error
 *     and NO call to `onSubmit` (AC-ERROR-1).
 *   - A valid submit transitions to `submitting` (submit button disabled — AC-LOADING-1) and awaits
 *     `onSubmit`. The parent closes the surface on success.
 *   - If `onSubmit` rejects, it maps to a safe `writeErrorCopy` message (keyed on `ApiError.category`,
 *     never raw detail — GP5) and preserves the user's input so they can retry (AC-ERROR-3).
 *
 * Escape cancels (AC-NAV-1) for the inline edit-board context; in the Dialog context the Dialog also
 * handles Escape — both simply invoke the close path, which is idempotent.
 */

import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent, ReactNode } from 'react';
import { ApiError } from '../../api/apiClient';
import type { ApiErrorCategory } from '../../api/apiClient';
import { VALIDATION_COPY, writeErrorCopy } from '../../api/errorCopy';
import styles from './BoardForm.module.css';

/** The values a board form yields — `description` is `null` when the field is left blank. */
export interface BoardFormValues {
  readonly name: string;
  readonly description: string | null;
}

interface BoardFormProps {
  /** Accessible label for the form region (e.g. "Create board" / "Edit board name"). */
  readonly formLabel: string;
  /** Visible text + accessible name of the submit button (e.g. "Create Board" / "Save"). */
  readonly submitLabel: string;
  /** Pre-fills the fields for the edit context; omitted for create. */
  readonly initialValues?: { readonly name: string; readonly description: string | null };
  /** Performs the write. Resolves on success (parent closes the surface); rejects on failure. */
  readonly onSubmit: (values: BoardFormValues) => Promise<void>;
  /** Closes the form without writing (Cancel button / Escape). */
  readonly onCancel: () => void;
  /** Focus the name field on mount — used for the inline edit-board context (the Dialog focuses its own). */
  readonly autoFocus?: boolean;
}

type SubmitState =
  | { readonly status: 'idle' }
  | { readonly status: 'submitting' }
  | { readonly status: 'error'; readonly category: ApiErrorCategory };

export function BoardForm({
  formLabel,
  submitLabel,
  initialValues,
  onSubmit,
  onCancel,
  autoFocus = false,
}: BoardFormProps): ReactNode {
  const [name, setName] = useState(initialValues?.name ?? '');
  const [description, setDescription] = useState(initialValues?.description ?? '');
  const [nameMissing, setNameMissing] = useState(false);
  const [submit, setSubmit] = useState<SubmitState>({ status: 'idle' });

  const nameId = useId();
  const nameErrorId = useId();
  const descriptionId = useId();
  const nameRef = useRef<HTMLInputElement>(null);

  const isSubmitting = submit.status === 'submitting';

  useEffect(() => {
    if (autoFocus) {
      nameRef.current?.focus();
    }
  }, [autoFocus]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const trimmedName = name.trim();
    if (trimmedName === '') {
      setNameMissing(true); // AC-ERROR-1: block submit, no API call
      return;
    }
    setNameMissing(false);
    setSubmit({ status: 'submitting' });
    const trimmedDescription = description.trim();
    try {
      await onSubmit({ name: trimmedName, description: trimmedDescription === '' ? null : trimmedDescription });
      // Success: the parent is responsible for closing the surface. Reset to idle in case it stays mounted.
      setSubmit({ status: 'idle' });
    } catch (err: unknown) {
      const category: ApiErrorCategory = err instanceof ApiError ? err.category : 'server';
      setSubmit({ status: 'error', category }); // AC-ERROR-3: input is preserved (state untouched)
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLFormElement>): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      onCancel(); // AC-NAV-1
    }
  }

  return (
    <form className={styles.form} aria-label={formLabel} noValidate onSubmit={handleSubmit} onKeyDown={handleKeyDown}>
      <div className={styles.field}>
        <label htmlFor={nameId}>Board name *</label>
        <input
          ref={nameRef}
          id={nameId}
          type="text"
          value={name}
          autoComplete="off"
          aria-required="true"
          aria-invalid={nameMissing}
          aria-describedby={nameMissing ? nameErrorId : undefined}
          onChange={(event) => setName(event.target.value)}
        />
        {nameMissing ? (
          <span id={nameErrorId} role="alert" aria-live="assertive" className={styles.fieldError}>
            {VALIDATION_COPY.boardNameRequired}
          </span>
        ) : null}
      </div>

      <div className={styles.field}>
        <label htmlFor={descriptionId}>Description (optional)</label>
        <textarea
          id={descriptionId}
          value={description}
          rows={3}
          onChange={(event) => setDescription(event.target.value)}
        />
      </div>

      {submit.status === 'error' ? (
        <div role="alert" className={styles.submitError}>
          <strong className={styles.submitErrorHeading}>{writeErrorCopy(submit.category).heading}</strong>
          <span>{writeErrorCopy(submit.category).message}</span>
        </div>
      ) : null}

      <div className={styles.actions}>
        <button type="button" className={styles.secondary} onClick={onCancel}>
          Cancel
        </button>
        <button
          type="submit"
          className={styles.primary}
          disabled={isSubmitting}
          aria-disabled={isSubmitting}
        >
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
