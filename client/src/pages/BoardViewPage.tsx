/**
 * client/src/pages/BoardViewPage.tsx — board view page (`/boards/:id`).
 *
 * TASK-006 PHASE 2 SKELETON. This routing-skeleton placeholder establishes the page's a11y
 * contract: the always-present `← Back to boards` link rendered BEFORE the `<h1>` (so it is
 * reachable in loading and error states — UI/UX creative Decision Area 9), an `<h1>` that receives
 * focus on mount, and a document-title update. Phase 4 replaces the placeholder body with the
 * parallel `getBoard(id)` + `getCards(id)` fetch, the three status-mapped columns, and the
 * loading / empty / error states.
 */

import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';

export function BoardViewPage(): ReactNode {
  const { id } = useParams<{ id: string }>();
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    document.title = 'BanyanBoard — Board';
    headingRef.current?.focus();
  }, [id]);

  return (
    <section aria-labelledby="board-view-heading">
      <Link to="/">← Back to boards</Link>
      <h1 id="board-view-heading" ref={headingRef} tabIndex={-1}>
        Board {id}
      </h1>
      {/* Phase 4: fetch board + cards, render three status-mapped columns, with loading/empty/error states. */}
    </section>
  );
}
