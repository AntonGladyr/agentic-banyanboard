/**
 * client/src/pages/BoardListPage.tsx — board list page (`/`) — TASK-006 Phase 3; TASK-007 Phase 2.
 *
 * Fetches all boards from `GET /api/v1/boards` on mount and renders one of four mutually exclusive
 * states beneath the always-present `Boards` heading (UI/UX creative state machine):
 *   - loading → <Spinner>                                         (AC-LOADING-1)
 *   - error   → <ErrorMessage> with copy keyed on ApiError.category (AC-ERROR-1)
 *   - success + empty → <EmptyState> "No boards yet"              (AC-ENTRY-2)
 *   - success + boards → <ul> of <BoardEntry> navigable links     (AC-ENTRY-1)
 *
 * TASK-007 Phase 2 adds a "New Board" action in the page header that opens a modal create-board form
 * (UI/UX creative Spec 2). On success the created board is appended to the in-memory list so it
 * appears immediately without a refetch (AC-HAPPY-1); on failure the BoardForm surfaces a safe error
 * and the dialog stays open with the user's input preserved (AC-ERROR-3).
 *
 * Accessibility: the `<h1>` receives focus on mount so client-side navigation from the board view
 * lands at the top of content; the document title is set on mount (UI/UX Accessibility Requirements).
 * The fetch is cancelled via AbortController on unmount so a late response never sets state on an
 * unmounted component.
 */

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ApiError, createBoard, getBoards } from '../api/apiClient';
import type { ApiErrorCategory } from '../api/apiClient';
import { getClientId } from '../api/clientId';
import { boardListErrorCopy } from '../api/errorCopy';
import type { Board } from '../api/types';
import { BoardEntry } from '../components/BoardEntry/BoardEntry';
import { BoardForm } from '../components/BoardForm/BoardForm';
import type { BoardFormValues } from '../components/BoardForm/BoardForm';
import { Dialog } from '../components/Dialog/Dialog';
import { EmptyState } from '../components/EmptyState/EmptyState';
import { ErrorMessage } from '../components/ErrorMessage/ErrorMessage';
import { Spinner } from '../components/Spinner/Spinner';
import styles from './BoardListPage.module.css';

type LoadState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly boards: Board[] }
  | { readonly status: 'error'; readonly category: ApiErrorCategory };

function renderBody(state: LoadState): ReactNode {
  if (state.status === 'loading') {
    return <Spinner />;
  }
  if (state.status === 'error') {
    const copy = boardListErrorCopy(state.category);
    return <ErrorMessage heading={copy.heading} message={copy.message} />;
  }
  if (state.boards.length === 0) {
    return <EmptyState heading="No boards yet" message="Create your first board to get started." />;
  }
  return (
    <ul className={styles.list}>
      {state.boards.map((board) => (
        <BoardEntry key={board.id} board={board} />
      ))}
    </ul>
  );
}

export function BoardListPage(): ReactNode {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    document.title = 'BanyanBoard — Boards';
    // Move focus to the page heading on mount so client-side navigation lands at the top of content.
    headingRef.current?.focus();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    getBoards(controller.signal)
      .then((boards) => setState({ status: 'success', boards }))
      .catch((err: unknown) => {
        if (controller.signal.aborted) {
          return; // request cancelled on unmount — not a real failure
        }
        const category: ApiErrorCategory = err instanceof ApiError ? err.category : 'server';
        setState({ status: 'error', category });
      });
    return () => controller.abort();
  }, []);

  // Create a board, then append it so it appears immediately (AC-HAPPY-1). A rejection propagates to
  // the BoardForm, which renders a safe error and keeps the dialog open (AC-ERROR-3).
  async function handleCreate(values: BoardFormValues): Promise<void> {
    const created = await createBoard(values, getClientId());
    setState((prev) =>
      prev.status === 'success'
        ? { status: 'success', boards: [...prev.boards, created] }
        : { status: 'success', boards: [created] },
    );
    setCreating(false);
  }

  return (
    <section className={styles.page} aria-labelledby="board-list-heading">
      <div className={styles.header}>
        <h1 id="board-list-heading" ref={headingRef} tabIndex={-1} className={styles.heading}>
          Boards
        </h1>
        <button type="button" className={styles.newBoard} onClick={() => setCreating(true)}>
          + New Board
        </button>
      </div>
      {renderBody(state)}
      <Dialog open={creating} title="Create Board" onClose={() => setCreating(false)}>
        <BoardForm
          formLabel="Create board"
          submitLabel="Create Board"
          onSubmit={handleCreate}
          onCancel={() => setCreating(false)}
        />
      </Dialog>
    </section>
  );
}
