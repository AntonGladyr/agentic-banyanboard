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
import {
  ApiError,
  createCard,
  getBoard,
  getCards,
  updateBoard,
  updateCard,
  updateCardStatus,
} from '../api/apiClient';
import type { ApiErrorCategory } from '../api/apiClient';
import { getClientId } from '../api/clientId';
import { boardViewErrorCopy, dragRevertErrorCopy } from '../api/errorCopy';
import type { Board, BoardRealtimeEvent, Card, CardRealtimeEvent, CardStatus } from '../api/types';
import { useRealtimeBoard } from '../realtime/useRealtimeBoard';
import { BoardForm } from '../components/BoardForm/BoardForm';
import type { BoardFormValues } from '../components/BoardForm/BoardForm';
import { CardForm } from '../components/CardForm/CardForm';
import type { CardFormValues } from '../components/CardForm/CardForm';
import { Dialog } from '../components/Dialog/Dialog';
import { KanbanBoard } from '../components/KanbanBoard/KanbanBoard';
import { MoveCardDialog } from '../components/MoveCardDialog/MoveCardDialog';
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
  const [editingCard, setEditingCard] = useState<Card | null>(null);
  const [movingCard, setMovingCard] = useState<Card | null>(null);
  const [moveError, setMoveError] = useState(false);
  // Ids of cards just changed by a REMOTE collaborator — they briefly flash the highlight (Spec 7).
  const [highlightedCardIds, setHighlightedCardIds] = useState<ReadonlySet<number>>(() => new Set());

  useEffect(() => {
    // Reset to loading whenever the id changes so navigating between boards re-fetches cleanly.
    setState({ status: 'loading' });
    setEditing(false);
    setEditingCard(null);
    setMovingCard(null);
    setMoveError(false);
    setHighlightedCardIds(new Set());
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

  // Create a card in a column (status pre-bound by KanbanBoard), then append it so it appears
  // immediately in the right column (AC-HAPPY-3). A rejection propagates to the inline CardForm,
  // which renders a safe error and stays open (AC-ERROR-3).
  async function handleCreateCard(status: CardStatus, values: CardFormValues): Promise<void> {
    if (id === undefined) {
      return;
    }
    const created = await createCard(
      id,
      { title: values.title, description: values.description, status },
      getClientId(),
    );
    setState((prev) =>
      prev.status === 'success' ? { ...prev, cards: [...prev.cards, created] } : prev,
    );
  }

  // Persist an edited card title/description, then replace it in place (AC-HAPPY-4). A rejection
  // propagates to the CardForm in the dialog, which renders a safe error and stays open (AC-ERROR-3).
  async function handleEditCardSave(values: CardFormValues): Promise<void> {
    if (id === undefined || editingCard === null) {
      return;
    }
    const updated = await updateCard(
      id,
      editingCard.id,
      { title: values.title, description: values.description },
      getClientId(),
    );
    setState((prev) =>
      prev.status === 'success'
        ? { ...prev, cards: prev.cards.map((c) => (c.id === updated.id ? updated : c)) }
        : prev,
    );
    setEditingCard(null);
  }

  // Move a card to a new status column via an OPTIMISTIC update (Architecture Decision 3): the card
  // jumps to the target column immediately, then the PATCH is sent. On success the server entity
  // replaces the optimistic one; on failure the card is rolled back to its original column and a safe
  // rollback error is surfaced (AC-ERROR-4). Shared by pointer drag-drop and the keyboard MoveCardDialog.
  async function handleMoveCard(card: Card, targetStatus: CardStatus): Promise<void> {
    if (id === undefined || card.status === targetStatus) {
      return;
    }
    const originalStatus = card.status;
    setMoveError(false);
    setState((prev) =>
      prev.status === 'success'
        ? {
            ...prev,
            cards: prev.cards.map((c) => (c.id === card.id ? { ...c, status: targetStatus } : c)),
          }
        : prev,
    );
    try {
      const updated = await updateCardStatus(id, card.id, targetStatus, getClientId());
      setState((prev) =>
        prev.status === 'success'
          ? { ...prev, cards: prev.cards.map((c) => (c.id === updated.id ? updated : c)) }
          : prev,
      );
    } catch {
      // Rollback to the original column and signal the failure (no internal detail surfaced — GP5).
      setState((prev) =>
        prev.status === 'success'
          ? {
              ...prev,
              cards: prev.cards.map((c) => (c.id === card.id ? { ...c, status: originalStatus } : c)),
            }
          : prev,
      );
      setMoveError(true);
    }
  }

  // Keyboard "Move to column" selection (MoveCardDialog): close the dialog, then run the shared move.
  function handleMoveSelect(targetStatus: CardStatus): void {
    const card = movingCard;
    setMovingCard(null);
    if (card !== null) {
      void handleMoveCard(card, targetStatus);
    }
  }

  // ─── Real-time collaboration (TASK-007 Phase 5) ──────────────────────────────
  // The hook drops this tab's own echo (Architecture Decision 3), so these handlers only ever apply
  // REMOTE collaborators' changes — exactly what should flash the highlight (UI/UX Spec 7).

  // Flag a card as recently-updated, then clear it after the highlight animation (~600ms) completes.
  function highlightCard(cardId: number): void {
    setHighlightedCardIds((prev) => new Set(prev).add(cardId));
    window.setTimeout(() => {
      setHighlightedCardIds((prev) => {
        const next = new Set(prev);
        next.delete(cardId);
        return next;
      });
    }, 650);
  }

  // Apply a remote card create/update/delete by swapping the full entity into local state by id
  // (Architecture Decision 2). A created/updated card flashes; a delete just removes it (AC-REALTIME-1/2).
  function applyCardEvent(event: CardRealtimeEvent): void {
    setState((prev) => {
      if (prev.status !== 'success') {
        return prev;
      }
      if (event.type === 'card:deleted') {
        return { ...prev, cards: prev.cards.filter((c) => c.id !== event.card.id) };
      }
      const exists = prev.cards.some((c) => c.id === event.card.id);
      const cards = exists
        ? prev.cards.map((c) => (c.id === event.card.id ? event.card : c))
        : [...prev.cards, event.card];
      return { ...prev, cards };
    });
    if (event.type !== 'card:deleted') {
      highlightCard(event.card.id);
    }
  }

  // Apply a remote board rename in place — the heading change is self-evident, so no flash (Spec 7).
  function applyBoardEvent(event: BoardRealtimeEvent): void {
    setState((prev) => (prev.status === 'success' ? { ...prev, board: event.board } : prev));
  }

  useRealtimeBoard(id, getClientId(), { onCardEvent: applyCardEvent, onBoardEvent: applyBoardEvent });

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
      {/* Optimistic-move rollback banner (AC-ERROR-4): shown only after a failed move on a loaded board. */}
      {state.status === 'success' && moveError ? (
        <div className={styles.moveError}>
          <ErrorMessage
            heading={dragRevertErrorCopy().heading}
            message={dragRevertErrorCopy().message}
          />
        </div>
      ) : null}
      {renderBody(
        state,
        handleCreateCard,
        setEditingCard,
        handleMoveCard,
        setMovingCard,
        highlightedCardIds,
      )}
      <Dialog open={editingCard !== null} title="Edit Card" onClose={() => setEditingCard(null)}>
        {editingCard !== null ? (
          <CardForm
            formLabel="Edit card"
            submitLabel="Save Changes"
            initialValues={{ title: editingCard.title, description: editingCard.description }}
            onSubmit={handleEditCardSave}
            onCancel={() => setEditingCard(null)}
          />
        ) : null}
      </Dialog>
      <MoveCardDialog card={movingCard} onMove={handleMoveSelect} onClose={() => setMovingCard(null)} />
    </section>
  );
}

function renderBody(
  state: LoadState,
  onCreateCard: (status: CardStatus, values: CardFormValues) => Promise<void>,
  onEditCard: (card: Card) => void,
  onMoveCard: (card: Card, targetStatus: CardStatus) => void,
  onRequestMove: (card: Card) => void,
  highlightedCardIds: ReadonlySet<number>,
): ReactNode {
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
      onCreateCard={onCreateCard}
      onEditCard={onEditCard}
      onMoveCard={onMoveCard}
      onRequestMove={onRequestMove}
      highlightedCardIds={highlightedCardIds}
    />
  );
}
