/**
 * client/src/components/Dialog/Dialog.tsx — reusable modal dialog primitive (TASK-007 Phase 2).
 *
 * UI/UX creative Spec 1: a single `<Dialog>` used for create-board (Phase 2) and edit-card (Phase 3).
 * Built on the native HTML `<dialog>` element so focus trapping, the `::backdrop` overlay, and
 * Escape semantics come from the platform at zero JS cost (GP4 — no new dependencies). The element
 * is controlled by the `open` prop: it is rendered only while open, calls `showModal()` on mount, and
 * restores focus to the previously-focused trigger element on close.
 *
 * Robustness: `HTMLDialogElement.showModal()` is unavailable under jsdom (and very old browsers), so
 * the call is guarded and falls back to setting the `open` attribute — the same component runs in
 * tests and in the browser. Escape is handled explicitly via `onKeyDown` (in addition to the native
 * `cancel` event) so the close path is consistent across environments; the parent owns `open`, so the
 * native default is prevented and `onClose` drives state.
 *
 * Accessibility: implicit `role="dialog"`, `aria-modal` via `showModal()`, `aria-labelledby` → the
 * title `<h2>`, an explicit close (×) button, and focus moved to the first form field on open.
 */

import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import styles from './Dialog.module.css';

interface DialogProps {
  /** Whether the dialog is open. The dialog renders nothing when false. */
  readonly open: boolean;
  /** Accessible title shown as the dialog heading and used as its accessible name. */
  readonly title: string;
  /** Called when the user dismisses the dialog (close button, Escape, or backdrop) without submitting. */
  readonly onClose: () => void;
  /** Dialog body — typically a form content component (e.g. BoardForm). */
  readonly children: ReactNode;
}

export function Dialog({ open, title, onClose, children }: DialogProps): ReactNode {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) {
      return;
    }
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    if (dialog) {
      if (typeof dialog.showModal === 'function') {
        try {
          dialog.showModal();
        } catch {
          dialog.setAttribute('open', ''); // already open / unsupported — fall back to the attribute
        }
      } else {
        dialog.setAttribute('open', ''); // jsdom: showModal is not implemented
      }
      // Move focus to the first form field (not the close button) so typing can start immediately.
      const field = dialog.querySelector<HTMLElement>('input, textarea, select');
      (field ?? dialog.querySelector<HTMLElement>('button'))?.focus();
    }
    return () => {
      // Restore focus to whatever opened the dialog (trigger-ref pattern).
      previouslyFocused.current?.focus?.();
    };
  }, [open]);

  if (!open) {
    return null;
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDialogElement>): void {
    if (event.key === 'Escape') {
      event.preventDefault(); // parent owns `open`; prevent the native auto-close from desyncing state
      onClose();
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onKeyDown={handleKeyDown}
    >
      <div className={styles.header}>
        <h2 id={titleId} className={styles.title}>
          {title}
        </h2>
        <button type="button" className={styles.close} aria-label="Close dialog" onClick={onClose}>
          ×
        </button>
      </div>
      <div className={styles.content}>{children}</div>
    </dialog>
  );
}
