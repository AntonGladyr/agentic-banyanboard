/**
 * client/src/components/CardForm/CardForm.tsx — create/edit card form content (TASK-007 Phase 3).
 *
 * UI/UX creative Spec 4/5: a content-only form reused in two contexts — inline within a Column for
 * create-card (title only; `showDescription={false}` keeps the column footer lightweight, matching the
 * Trello/Linear add-card pattern) and inside the Dialog for edit-card (title + description). Like
 * BoardForm, it owns its own validation + submit state machine and delegates the actual write to the
 * parent via `onSubmit`, so it never imports the apiClient: the page chooses `createCard` vs
 * `updateCard` (and binds the column status on create).
 *
 * State machine (mirrors BoardForm / the FEAT-006 page pattern): `idle | submitting | error`.
 *   - On submit, a blank/whitespace title is rejected client-side with an inline `role="alert"` error
 *     and NO call to `onSubmit` (AC-ERROR-2).
 *   - A valid submit transitions to `submitting` (submit button disabled — AC-LOADING-1) and awaits
 *     `onSubmit`. The parent closes the surface on success.
 *   - If `onSubmit` rejects, it maps to a safe `writeErrorCopy` message (keyed on `ApiError.category`,
 *     never raw detail — GP5) and preserves the user's input so they can retry (AC-ERROR-3).
 *
 * Escape cancels (AC-NAV-1). In the Dialog context the Dialog also handles Escape — both simply invoke
 * the close path, which is idempotent.
 */

import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent, ReactNode } from 'react';
import { ApiError } from '../../api/apiClient';
import type { ApiErrorCategory } from '../../api/apiClient';
import { VALIDATION_COPY, writeErrorCopy } from '../../api/errorCopy';
import styles from './CardForm.module.css';

/** The values a card form yields — `description` is `null` when the field is blank or hidden. */
export interface CardFormValues {
  readonly title: string;
  readonly description: string | null;
}

interface CardFormProps {
  /** Accessible label for the form region (e.g. "Add card to To Do" / "Edit card"). */
  readonly formLabel: string;
  /** Visible text + accessible name of the submit button (e.g. "Add Card" / "Save Changes"). */
  readonly submitLabel: string;
  /** Pre-fills the fields for the edit context; omitted for create. */
  readonly initialValues?: { readonly title: string; readonly description: string | null };
  /** Whether to render the description field. `false` for the lightweight inline create-card form. */
  readonly showDescription?: boolean;
  /** Performs the write. Resolves on success (parent closes the surface); rejects on failure. */
  readonly onSubmit: (values: CardFormValues) => Promise<void>;
  /** Closes the form without writing (Cancel button / Escape). */
  readonly onCancel: () => void;
}

type SubmitState =
  | { readonly status: 'idle' }
  | { readonly status: 'submitting' }
  | { readonly status: 'error'; readonly category: ApiErrorCategory };

export function CardForm({
  formLabel,
  submitLabel,
  initialValues,
  showDescription = true,
  onSubmit,
  onCancel,
}: CardFormProps): ReactNode {
  const [title, setTitle] = useState(initialValues?.title ?? '');
  const [description, setDescription] = useState(initialValues?.description ?? '');
  const [titleMissing, setTitleMissing] = useState(false);
  const [submit, setSubmit] = useState<SubmitState>({ status: 'idle' });

  const titleId = useId();
  const titleErrorId = useId();
  const descriptionId = useId();
  const titleRef = useRef<HTMLInputElement>(null);

  const isSubmitting = submit.status === 'submitting';

  useEffect(() => {
    // Focus the title field on mount so typing starts immediately in both inline and modal contexts.
    titleRef.current?.focus();
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const trimmedTitle = title.trim();
    if (trimmedTitle === '') {
      setTitleMissing(true); // AC-ERROR-2: block submit, no API call
      return;
    }
    setTitleMissing(false);
    setSubmit({ status: 'submitting' });
    const trimmedDescription = description.trim();
    try {
      await onSubmit({
        title: trimmedTitle,
        description: trimmedDescription === '' ? null : trimmedDescription,
      });
      // Success: the parent closes the surface. Reset to idle in case it stays mounted.
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
        <label htmlFor={titleId}>Card title *</label>
        <input
          ref={titleRef}
          id={titleId}
          type="text"
          value={title}
          autoComplete="off"
          aria-required="true"
          aria-invalid={titleMissing}
          aria-describedby={titleMissing ? titleErrorId : undefined}
          onChange={(event) => setTitle(event.target.value)}
        />
        {titleMissing ? (
          <span id={titleErrorId} role="alert" aria-live="assertive" className={styles.fieldError}>
            {VALIDATION_COPY.cardTitleRequired}
          </span>
        ) : null}
      </div>

      {showDescription ? (
        <div className={styles.field}>
          <label htmlFor={descriptionId}>Description (optional)</label>
          <textarea
            id={descriptionId}
            value={description}
            rows={3}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>
      ) : null}

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
