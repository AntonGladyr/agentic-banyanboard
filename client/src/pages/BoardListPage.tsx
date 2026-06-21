/**
 * client/src/pages/BoardListPage.tsx — board list page (`/`) — TASK-006 Phase 3.
 *
 * Fetches all boards from `GET /api/v1/boards` on mount and renders one of four mutually exclusive
 * states beneath the always-present `Boards` heading (UI/UX creative state machine):
 *   - loading → <Spinner>                                         (AC-LOADING-1)
 *   - error   → <ErrorMessage> with copy keyed on ApiError.category (AC-ERROR-1)
 *   - success + empty → <EmptyState> "No boards yet"              (AC-ENTRY-2)
 *   - success + boards → <ul> of <BoardEntry> navigable links     (AC-ENTRY-1)
 *
 * Accessibility: the `<h1>` receives focus on mount so client-side navigation from the board view
 * lands at the top of content; the document title is set on mount (UI/UX Accessibility Requirements).
 * The fetch is cancelled via AbortController on unmount so a late response never sets state on an
 * unmounted component.
 */

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ApiError, getBoards } from '../api/apiClient';
import type { ApiErrorCategory } from '../api/apiClient';
import { boardListErrorCopy } from '../api/errorCopy';
import type { Board } from '../api/types';
import { BoardEntry } from '../components/BoardEntry/BoardEntry';
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

  return (
    <section className={styles.page} aria-labelledby="board-list-heading">
      <h1 id="board-list-heading" ref={headingRef} tabIndex={-1} className={styles.heading}>
        Boards
      </h1>
      {renderBody(state)}
    </section>
  );
}
