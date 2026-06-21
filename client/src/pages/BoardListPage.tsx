/**
 * client/src/pages/BoardListPage.tsx — board list page (`/`).
 *
 * TASK-006 PHASE 2 SKELETON. This routing-skeleton placeholder establishes the page's a11y
 * contract (an `<h1>` that receives focus on mount, and a document-title update on route change —
 * UI/UX Accessibility Requirements). Phase 3 replaces the placeholder body with the live
 * `apiClient.getBoards()` fetch and the loading / empty / error / list states.
 */

import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

export function BoardListPage(): ReactNode {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    document.title = 'BanyanBoard — Boards';
    // Move focus to the page heading on mount so client-side navigation lands at the top of content.
    headingRef.current?.focus();
  }, []);

  return (
    <section aria-labelledby="board-list-heading">
      <h1 id="board-list-heading" ref={headingRef} tabIndex={-1}>
        Boards
      </h1>
      {/* Phase 3: fetch + render board list, with loading/empty/error states. */}
    </section>
  );
}
