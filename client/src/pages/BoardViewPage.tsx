/**
 * client/src/pages/BoardViewPage.tsx — board view page (`/boards/:id`) — TASK-006 Phase 4; TASK-007 Phase 2.
 *
 * On mount it fires `getBoard(id)` and `getCards(id)` IN PARALLEL (`Promise.all`, no waterfall —
 * UI/UX creative + NFR perf budget) and renders one of three mutually exclusive states beneath the
 * always-present `← Back to boards` link:
 *   - loading → <Spinner>                                              (AC-LOADING-1)
 *   - error   → <ErrorMessage> (with back-nav) keyed on ApiError.category — notFound/network/server (AC-ERROR-2)
 *   - success → <h1> board name + <KanbanBoard> with cards partitioned by `status` (AC-HAPPY-1/3)
 *
 * TASK-007 Phase 2 adds an inline edit-board affordance (UI/UX creative Spec 3): an edit icon next to
 * the board name switches the heading into an in-place BoardForm pre-filled with the current name and
 * description. On success the heading (and document title) update in place without a reload
 * (AC-HAPPY-2); Cancel/Escape restores the heading with no API call (AC-NAV-1); a write failure keeps
 * the inline form open with a safe error (AC-ERROR-3).
 *
 * The `← Back to boards` link is rendered BEFORE the `<h1>` so it is reachable in loading and error
 * states (UI/UX creative Decision Area 9 / AC-HAPPY-2 / AC-ERROR-2). The `<h1>` receives focus on
 * mount so client-side navigation lands at the top of content, and the document title is set once
 * the board name is known. The parallel fetch is cancelled via AbortController on unmount.
 */

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiError, getBoard, getCards, updateBoard } from '../api/apiClient';
import type { ApiErrorCategory } from '../api/apiClient';
import { getClientId } from '../api/clientId';
import { boardViewErrorCopy } from '../api/errorCopy';
import type { Board, Card, CardStatus } from '../api/types';
import { BoardForm } from '../components/BoardForm/BoardForm';
import type { BoardFormValues } from '../components/BoardForm/BoardForm';
import { KanbanBoard } from '../components/KanbanBoard/KanbanBoard';
import { ErrorMessage } from '../components/ErrorMessage/ErrorMessage';
import { Spinner } from '../components/Spinner/Spinner';
import styles from './BoardViewPage.module.css';

type LoadState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly board: Board; readonly cards: Card[] }
  | { readonly status: 'error'; readonly category: ApiErrorCategory };

/** Return the subset of cards matching a single status — i.e. the contents of one kanban column. */
function cardsByStatus(cards: Card[], status: CardStatus): Card[] {
  return cards.filter((card) => card.status === status);
}

export function BoardViewPage(): ReactNode {
  const { id } = useParams<{ id: string }>();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    // Reset to loading whenever the id changes so navigating between boards re-fetches cleanly.
    setState({ status: 'loading' });
    setEditing(false);
    if (id === undefined) {
      return;
    }
    const controller = new AbortController();
    // Fire both requests in parallel — no waterfall (NFR perf budget).
    Promise.all([getBoard(id, controller.signal), getCards(id, controller.signal)])
      .then(([board, cards]) => setState({ status: 'success', board, cards }))
      .catch((err: unknown) => {
        if (controller.signal.aborted) {
          return; // request cancelled on unmount / id change — not a real failure
        }
        const category: ApiErrorCategory = err instanceof ApiError ? err.category : 'server';
        setState({ status: 'error', category });
      });
    return () => controller.abort();
  }, [id]);

  useEffect(() => {
    // Move focus to the heading on mount/route change so navigation lands at the top of content.
    headingRef.current?.focus();
  }, [id]);

  useEffect(() => {
    document.title =
      state.status === 'success' ? `BanyanBoard — ${state.board.name}` : 'BanyanBoard — Board';
  }, [state]);

  // Persist a board-name/description edit, then update the heading in place (AC-HAPPY-2). A rejection
  // propagates to the inline BoardForm, which renders a safe error and stays open (AC-ERROR-3).
  async function handleEditSave(values: BoardFormValues): Promise<void> {
    if (id === undefined) {
      return;
    }
    const updated = await updateBoard(id, values, getClientId());
    setState((prev) => (prev.status === 'success' ? { ...prev, board: updated } : prev));
    setEditing(false);
    // Return focus to the edit trigger now that the heading is restored.
    editButtonRef.current?.focus();
  }

  function cancelEdit(): void {
    setEditing(false);
    editButtonRef.current?.focus();
  }

  const board = state.status === 'success' ? state.board : null;
  const showInlineEdit = board !== null && editing;

  return (
    <section className={styles.page} aria-labelledby="board-view-heading">
      {/* Rendered before the <h1> so it is reachable in loading and error states (AC-HAPPY-2 / AC-ERROR-2). */}
      <Link to="/" className={styles.backNav}>
        ← Back to boards
      </Link>
      {showInlineEdit ? (
        <div className={styles.editBoardRow}>
          <BoardForm
            formLabel="Edit board name"
            submitLabel="Save"
            autoFocus
            initialValues={{ name: board.name, description: board.description }}
            onSubmit={handleEditSave}
            onCancel={cancelEdit}
          />
        </div>
      ) : (
        <div className={styles.headingRow}>
          <h1 id="board-view-heading" ref={headingRef} tabIndex={-1} className={styles.heading}>
            {board !== null ? board.name : 'Board'}
          </h1>
          {board !== null ? (
            <button
              ref={editButtonRef}
              type="button"
              className={styles.editBoard}
              aria-label="Edit board name"
              onClick={() => setEditing(true)}
            >
              ✎
            </button>
          ) : null}
        </div>
      )}
      {renderBody(state)}
    </section>
  );
}

function renderBody(state: LoadState): ReactNode {
  if (state.status === 'loading') {
    return <Spinner />;
  }
  if (state.status === 'error') {
    // No `backLink` here: the page-level `← Back to boards` link above the <h1> is always present in
    // the error state, so it already satisfies the AC-ERROR-2 recovery affordance without a duplicate.
    const copy = boardViewErrorCopy(state.category);
    return <ErrorMessage heading={copy.heading} message={copy.message} />;
  }
  return (
    <KanbanBoard
      todoCards={cardsByStatus(state.cards, 'todo')}
      inProgressCards={cardsByStatus(state.cards, 'in_progress')}
      doneCards={cardsByStatus(state.cards, 'done')}
    />
  );
}
