# UI/UX Decision: Realtime Activity Feed (TASK-008)

**Created**: 2026-06-30
**Status**: DECIDED
**Decision Type**: UI/UX
**Task**: TASK-008 (FEAT-008) — Level 3
**Scope**: Feed panel location/layout on the board view page, entry presentation, empty/loading states,
live-entry behavior, and accessibility for the read-only activity feed component.

---

## User Context

### Target Users

- **Primary**: Alex the Dev — software engineer on a 4-person team. Zero context-switch overhead is the
  goal. Needs to glance at recent card moves (e.g., during an async standup) without navigating away
  from the board. Reads the feed while the kanban columns are also visible.
- **Secondary (1)**: Jordan the PM — part-time coordinator. Monitors board state passively; benefits
  from a persistent, glanceable activity log without having to ask teammates.
- **Secondary (2)**: Sam the Maker — solo developer. The feed is useful when revisiting a board after
  a break to see what changed. Less critical than for team users.

### User Goals

1. Glance at recent card movements without losing sight of the current board state
2. See new entries appear automatically as teammates move cards (no page reload)
3. Understand what a feed entry means — which card, which column it moved from/to, when — in one read
4. Know when the feed is loading vs. empty vs. populated (distinct, non-confusing states)

### Use Cases

| Use Case | User | Goal | Frequency |
|----------|------|------|-----------|
| Async standup: check what moved since yesterday | Alex | Scan last 5–10 entries without context switching | Daily |
| See own card move confirmed in the feed | Alex | Verify PATCH success via live entry | Several times/day |
| Notice a teammate moved a card live | Alex, Jordan | Awareness of concurrent activity | Whenever others are active |
| Return to board after a break, check history | Sam, Jordan | Orient quickly on recent changes | Occasionally |

### Constraints

- **Devices**: Desktop primary; tablet-usable (min ~768 px). Mobile-first is explicitly NOT a priority
  for MVP (productBrief). The board view page is already `max-width: 1280px`.
- **Accessibility**: WCAG 2.1 AA (reasonable effort per productBrief). Mandatory: list semantics for
  the feed entries, keyboard reachability, visible focus indicators, color contrast ≥ 4.5:1, live
  region announcement for new entries.
- **Existing Patterns**: CSS Modules + `tokens.css` CSS Custom Properties (established TASK-006).
  Reuse `Spinner` (loading, `role="status"` + `aria-live="polite"`), `EmptyState` (empty copy).
  No new styling framework (Guiding Principle 4). State machine pattern
  (`loading | success | error`).
- **Layout constraint**: `KanbanBoard` currently occupies the full `max-width: 1280px` of
  `.page` via `grid-template-columns: repeat(3, minmax(260px, 1fr))` inside an `overflow-x: auto`
  scroller. Any feed panel must work alongside this or below it without breaking the kanban's
  horizontal-scroll behavior or minimum column widths (260 px per column = 780 px min for 3 columns
  plus gaps).
- **Visibility requirement (v1)**: The feed must be **always visible** on the board view page when
  the board is in `success` load state — not hidden behind a toggle or user action (TASK-008 Spec §
  Invocation Method: "it is always visible alongside the board").

---

## User Flow

### Flow Diagram

```
[User navigates to /boards/:id]
           |
           v
[BoardViewPage mounts — fires getBoard + getCards + getActivity in parallel]
           |
    ┌──────┴──────┐
    |             |
[loading]    [success]
    |             |
[Spinner in    [Feed panel visible alongside kanban]
 feed panel]       |
                   |──→ [Feed loading] → data arrives → [list or empty state]
                   |
                   |──→ [SSE event: activity:card_moved]
                   |          |
                   |          v
                   |   [New entry prepends at top of feed]
                   |
                   |──→ [User drags a card]
                              |
                              v
                   [Optimistic kanban update → PATCH → server records event → SSE → feed prepends]
```

### Flow Description

1. **Entry**: User navigates to `/boards/:id`. `BoardViewPage` fires `getBoard`, `getCards`, and
   `getActivity` in parallel (no waterfall, consistent with existing NFR perf budget).
2. **Loading**: Board shows `<Spinner>` in the page body (existing behavior). The feed panel area
   shows its own inline `<Spinner>` (AC-LOADING-1) — the panel container is visible but its content
   area shows loading state.
3. **Feed data arrives**: If events exist, the feed renders a `<ul>` of entries (newest first).
   If no events, an empty state renders ("No activity yet"). The kanban columns render simultaneously
   from their own parallel fetch.
4. **Live update**: An SSE `activity:card_moved` event arrives. `useRealtimeBoard`'s `onActivityEvent`
   handler prepends the new entry to the feed list. The entry appears at the top with a brief
   highlight. The user sees it without scrolling.
5. **Exit**: The user continues interacting with the kanban board. The feed is passive/read-only —
   no user action is needed to interact with it (no buttons, no toggles).

### Error States

| Error | Cause | User Recovery |
|-------|-------|---------------|
| `getActivity` network/500 failure | Server or network fault | Feed panel shows a short error message (reuses `ErrorMessage` copy pattern). The board and kanban still render — feed error is non-fatal. |
| SSE connection lost | Network interruption | Existing `useRealtimeBoard` reconnect behavior handles this; the feed shows the last-known state (no special feed-specific handling needed). |
| Feed data fetch returns 404 (board not found) | Board was deleted while navigating | The board-level 404 is caught by the existing `BoardViewPage` error state — the entire page shows the board-not-found error (the feed panel never renders in this case). |

---

## Options Explored

### Option 1: Right Sidebar Panel (two-column layout)

A persistent right sidebar panel alongside the three kanban columns. The page layout changes from
full-width kanban to a two-column grid: `[kanban area] [feed sidebar]`.

**Wireframe/Layout**:
```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│  ← Back to boards                                                                       │
│  h1: Alpha Project  [✎]                                                                 │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                    │                   │
│  ┌────────────────┬────────────────┬────────────────┐              │  Activity         │
│  │ TO DO          │ IN PROGRESS    │ DONE           │              │  ─────────────    │
│  │ [light blue]   │ [light amber]  │ [light green]  │              │  Card A           │
│  │ ┌────────────┐ │ ┌────────────┐ │ ┌────────────┐ │              │  To Do → In Prog  │
│  │ │ Card A     │ │ │ Card B     │ │ │ Card C     │ │              │  2 mins ago       │
│  │ └────────────┘ │ └────────────┘ │ └────────────┘ │              │  ─────────────    │
│  │ ┌────────────┐ │                │                │              │  Card D           │
│  │ │ Card D     │ │  No cards yet  │  No cards yet  │              │  In Prog → Done   │
│  │ └────────────┘ │                │                │              │  5 mins ago       │
│  │                │                │                │              │  ─────────────    │
│  │ [+ Add card]   │ [+ Add card]   │ [+ Add card]   │              │  No activity yet  │
│  └────────────────┴────────────────┴────────────────┘              │  (or Spinner)     │
│                                                                    └───────────────────┘
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

**Approach**: `BoardViewPage.module.css` gains a two-column CSS Grid layout:
`grid-template-columns: 1fr 260px` (or `minmax(0, 1fr) 260px`) on the `.boardLayout` row. The kanban
goes in the first column; the feed panel in the second. The kanban columns compress slightly to fit
within the new narrower first column. At the current `max-width: 1280px`, with a 260 px sidebar +
`var(--space-4)` gap, the kanban gets ~1004 px — enough for three columns at `minmax(260px, 1fr)` to
NOT trigger horizontal scroll on large desktops (3 × 260 px = 780 px min fits in ~1004 px). On tablet
(768–1024 px), the sidebar narrows or moves below.

**User Flow**: User sees the feed panel on the right at all times. New entries appear at the top of the
feed column. The feed scrolls independently of the kanban.

**Key UI Elements**: Persistent `<aside>` panel with a section heading "Activity", scrollable `<ul>`
of entries, independent scroll from kanban, top-sticky section label.

**Pros**:
- Simultaneously visible with the kanban at all times — maximum glanceability (core Alex persona goal)
- Industry-standard pattern for persistent side-panel metadata (GitHub, Linear, Jira all use this)
- The feed scroll is independent: the user can scroll the feed history without scrolling the kanban
- Persistent visibility satisfies the v1 "always visible" requirement without any interaction
- No layout disruption on the kanban side beyond a narrower first column

**Cons**:
- At tablet widths (768–1024 px), the two-column layout becomes cramped. The kanban needs
  `overflow-x: auto` scroll (which it already has), but the sidebar + kanban side-by-side may be
  tight. Mitigation: below 900 px, the sidebar stacks below the kanban (responsive breakpoint).
- Reduces the horizontal space available for the kanban columns (from ~1280 px to ~1004 px on large
  desktop). The three kanban columns can still reach `minmax(260px, 1fr)` minimum, but they are
  somewhat narrower than the current full-width layout.
- The sidebar requires a fixed or minimum width to be useful; at very narrow widths the feed becomes
  illegible if forced to coexist.

**Usability**: High
**Accessibility**: High
**Implementation Complexity**: Medium (layout change to `BoardViewPage.module.css` + CSS for responsive
behavior at tablet; otherwise straightforward)

---

### Option 2: Always-Visible Strip Below the Kanban

The feed panel is a full-width horizontal strip below the three kanban columns. It renders at all
times and does not change the kanban column layout.

**Wireframe/Layout**:
```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ← Back to boards                                                           │
│  h1: Alpha Project  [✎]                                                     │
├────────────────────┬───────────────────┬────────────────────────────────────┤
│ TO DO              │ IN PROGRESS       │ DONE                               │
│ [light blue]       │ [light amber]     │ [light green]                      │
│ ┌────────────────┐ │ ┌───────────────┐ │ ┌──────────────────────────────┐   │
│ │ Card A         │ │ │ Card B        │ │ │ Card C                       │   │
│ └────────────────┘ │ └───────────────┘ │ └──────────────────────────────┘   │
│                   │                   │                                    │
│ [+ Add card]      │ [+ Add card]      │ [+ Add card]                       │
├────────────────────┴───────────────────┴────────────────────────────────────┤
│  Activity                                                                   │
│  ───────────────────────────────────────────────────────────────────────── │
│  Card A · To Do → In Progress · 2 mins ago                                  │
│  Card D · In Progress → Done · 5 mins ago                                   │
│  Card B · To Do → In Progress · 1 hour ago                                  │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Approach**: The feed is a `<section>` rendered in `BoardViewPage.tsx` below the `<KanbanBoard>`
render. No layout change to the kanban. The page uses its existing vertical flow (stacked block
elements). The feed section has a fixed max-height with `overflow-y: auto` scroll.

**User Flow**: User scrolls down past the kanban to see the feed. New entries prepend at the top
of the feed list (below the "Activity" heading). On a monitor where the kanban is tall, the feed may
be below the fold.

**Key UI Elements**: Full-width `<section>` below kanban, "Activity" heading, `<ul>` of entries with
`max-height` + `overflow-y: auto`, top-anchored new entries.

**Pros**:
- Zero impact on the kanban layout — the three columns retain their current full `max-width: 1280px`
- Simpler implementation — just append a new `<section>` in `BoardViewPage.tsx`
- No responsive complexity: at any viewport width, the strip is always full-width below the columns
- Horizontal layout of entries works well at full width — more text visible per entry

**Cons**:
- **May be below the fold**: if the kanban has many cards, the user must scroll down to see the feed.
  This directly conflicts with the "zero context-switch overhead" goal for Alex — checking the feed
  means scrolling away from the board view.
- **Not simultaneously visible with the kanban** on typical laptop screens (768–900 px tall). This
  significantly reduces glanceability compared to a sidebar.
- New entries prepend at the feed top, but the user may not see them unless they scroll to the feed.
  A `aria-live` announcement helps screen reader users but sighted users miss the visual feedback.
- The "always visible" v1 requirement is technically satisfied (the section is always rendered) but
  experientially broken (scrolled out of view).

**Usability**: Medium (below-fold is a significant friction point for Alex's primary use case)
**Accessibility**: High (semantics and contrast are straightforward at full width)
**Implementation Complexity**: Low

---

### Option 3: Collapsible Drawer/Panel (toggle-to-show)

The feed is behind a toggle button. A "Show Activity" button or tab opens a side panel or bottom
drawer that overlays or pushes the kanban.

**Wireframe/Layout**:
```
┌─────────────────────────────────────────────────────────┐
│  ← Back to boards                                       │
│  h1: Alpha Project  [✎]          [📋 Activity (3)]     │ ← toggle button in heading row
├────────────────────┬───────────────────┬────────────────┤
│ TO DO              │ IN PROGRESS       │ DONE           │
│ ...full-width kanban...                                 │
└─────────────────────────────────────────────────────────┘

When open (panel slides in from right, overlays board):
┌────────────────────────────────────────────────────────────────────────────────────┐
│  ← Back to boards                                                                  │
│  h1: Alpha Project  [✎]                           [📋 Activity (3)]               │
├─────────────────────────────────────────────────────────┬──────────────────────────┤
│  TO DO    │  IN PROGRESS  │  DONE                       │  Activity           [×] │
│  (dimmed  │  (dimmed)     │  (dimmed behind overlay)    │  ──────────────────     │
│   behind) │               │                             │  Card A                 │
│           │               │                             │  To Do → In Prog        │
│           │               │                             │  2 mins ago             │
│           │               │                             │  ──────────────────     │
└───────────────────────────────────────────────────────────────────────────────────┘
```

**Approach**: A toggle button (with a badge count of new entries) sits in the heading row. Clicking it
opens a `<aside>` panel (or drawer) that overlays the kanban content. The panel has its own close
button and an optional backdrop.

**User Flow**: User must click "Activity" to see the feed. The feed is NOT automatically visible. This
requires a deliberate user action for every check.

**Key UI Elements**: Toggle button in heading row (with unread count badge), slide-in `<aside>` panel
with close button, optional backdrop overlay.

**Pros**:
- Kanban retains full-width layout at all times — zero reduction of kanban horizontal space
- On small desktops, the drawer prevents the "cramped sidebar" problem of Option 1
- A badge count on the toggle button could surface "3 new events" without opening the feed

**Cons**:
- **Directly violates the v1 "always visible" requirement** (TASK-008 Spec § Invocation Method):
  "it is always visible alongside the board" — a collapsible drawer is hidden by default.
- Requires an additional user interaction (click to open) for every standup check — this is the
  "context-switch overhead" Alex explicitly wants to avoid.
- Implementation is the most complex: toggle state, animation, backdrop, focus trap (if overlay),
  badge/count tracking.
- An unread count badge requires defining "what is unread" — a concept not in the v1 spec.
- A future TASK (e.g., FEAT-009) could legitimately add a drawer as a power-user alternative.

**Usability**: Low (violates always-visible requirement; adds interaction overhead)
**Accessibility**: Medium (drawer requires focus trap, Escape, focus return — more a11y work than
Option 1 or 2)
**Implementation Complexity**: High

---

### Option 4: Right Sidebar with Responsive Stack-Below

Identical to Option 1 (right sidebar panel alongside the kanban) but with an explicit responsive
breakpoint: at viewport widths below 900 px, the feed panel stacks **below** the kanban columns
(same as Option 2's layout), and the kanban retains full-width within the available area.

**Wireframe/Layout (desktop > 900 px)**:
```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│  ← Back to boards                                                                        │
│  h1: Alpha Project [✎]                                                                   │
├──────────────────────────────────────────────────────────┬───────────────────────────────┤
│  [overflow-x: auto kanban scroller]                      │  Activity                     │
│  ┌─────────────┬────────────────┬──────────────────────┐ │  ──────────────────────────── │
│  │ TO DO       │ IN PROGRESS   │ DONE                  │ │  Card A                       │
│  │             │               │                       │ │  To Do → In Progress          │
│  │ ┌─────────┐ │ ┌───────────┐ │ ┌───────────────────┐ │ │  2 mins ago                   │
│  │ │ Card A  │ │ │ Card B    │ │ │ Card C            │ │ │  ────────────────────────────  │
│  │ └─────────┘ │ └───────────┘ │ └───────────────────┘ │ │  Card D                       │
│  │ [+ Add]     │ [+ Add]       │ [+ Add]               │ │  In Progress → Done           │
│  └─────────────┴────────────────┴──────────────────────┘ │  5 mins ago                   │
│                                                           │  ────────────────────────────  │
│                                                           │  [Spinner | empty state]      │
└──────────────────────────────────────────────────────────┴───────────────────────────────┘
```

**Wireframe/Layout (tablet < 900 px — stacks below)**:
```
┌──────────────────────────────────────────────┐
│  ← Back to boards                            │
│  h1: Alpha Project [✎]                       │
├──────────────────────────────────────────────┤
│  [full-width kanban, overflow-x: auto]        │
│  TO DO  │  IN PROGRESS  │  DONE             │ ← horizontal scroll on tablet (existing)
│  ...                                         │
├──────────────────────────────────────────────┤
│  Activity                                    │
│  ────────────────────────────────────────── │
│  Card A · To Do → In Progress · 2 mins ago   │
│  Card D · In Progress → Done · 5 mins ago    │
└──────────────────────────────────────────────┘
```

**Approach**: Same as Option 1 but the CSS Grid for `.boardLayout` uses a breakpoint at `@media (max-width: 900px)`:
- `> 900px`: `grid-template-columns: minmax(0, 1fr) 260px` — sidebar to the right
- `<= 900px`: `grid-template-columns: 1fr` (single column) — feed stacks below kanban

**Pros**:
- Simultaneously visible on desktop (the primary device for Alex during standups)
- Kanban retains full-width on tablet (below 900 px the kanban recovers its full width)
- The existing `overflow-x: auto` scroller in KanbanBoard is preserved in both layouts
- Responsive behavior is a simple CSS Media Query — no JS, no interaction
- Satisfies "always visible" requirement on both desktop (sidebar) and tablet (below)
- Clean degradation: tablet users scroll to see the feed, but they have the kanban fully visible

**Cons**:
- On desktop, the kanban columns are narrower than at max-width (same trade-off as Option 1). At
  1280 px wide, with a 260 px sidebar and 16 px gap: kanban area = ~1004 px → three columns at
  `minmax(260px, 1fr)` render as `≈334 px` each — still wider than the 260 px minimum, so horizontal
  scroll does NOT activate at 1280 px. At narrower desktops (e.g., 1100 px): kanban area = ~824 px →
  three × 260 px + 2 × 16 px gap = 812 px — still fits with ~4 px to spare. Acceptable.
- On tablet, the feed is below the fold (same as Option 2 limitation). However, tablet is explicitly
  not the primary device for this product.

**Usability**: High (desktop primary use case fully served)
**Accessibility**: High
**Implementation Complexity**: Medium (one responsive breakpoint in CSS; no JS complexity)

---

## Evaluation Matrix

| Criteria | Option 1: Sidebar | Option 2: Below-strip | Option 3: Drawer | Option 4: Sidebar + responsive |
|----------|-------------------|-----------------------|------------------|-------------------------------|
| Simultaneously visible on desktop | High | Low (below fold) | Low (hidden) | High |
| Satisfies "always visible" v1 requirement | High | High (technically) | Low (violates spec) | High |
| Kanban horizontal space preserved | Medium | High | High | Medium (desktop) / High (tablet) |
| Usability for Alex (standup glance) | High | Medium | Low | High |
| Responsiveness at tablet | Medium (cramped) | High | Medium | High |
| Accessibility | High | High | Medium | High |
| Consistency with existing patterns | High | High | Low (new drawer primitive) | High |
| Implementation complexity | Medium | Low | High | Medium |
| Fits Guiding Principle 4 (simplest that earns its keep) | Medium | High | Low | High |

---

## Decision

**Chosen**: Option 4 — Right Sidebar Panel with Responsive Stack-Below

### Rationale

Option 4 is the only approach that satisfies all three hard constraints simultaneously:

1. **"Always visible" v1 requirement** (TASK-008 Spec, Invocation Method): Option 3 (drawer) is
   explicitly ruled out because it hides the feed behind a toggle. Option 2 satisfies the letter of
   the requirement but not the spirit — a below-fold section is "always rendered" but not "always
   visible." Option 4 delivers the feed within the viewport without any user interaction on desktop.

2. **Alex's primary use case** (standup glance with zero context-switch overhead): The feed must be
   simultaneously visible with the kanban columns. Only a sidebar achieves this. The below-strip
   approach (Option 2) forces Alex to scroll away from the board — exactly the context switch the
   persona explicitly wants to avoid.

3. **Kanban layout integrity**: The responsive breakpoint at 900 px restores the kanban to full-width
   at tablet, preventing the "cramped sidebar + cramped kanban" problem of Option 1 at narrow widths.
   On desktop (> 900 px, which is the primary use case), the kanban column minimum widths (260 px ×
   3 + gaps) still fit comfortably within the remaining ~1004 px at max-page-width.

Option 4 is strictly better than Option 1 (same desktop layout, but adds the responsive stack-below
for tablet). It is the minimum-complexity solution that serves the primary persona. Guiding Principle 4
("clean architecture, complexity only when it earns its keep") is respected: the additional CSS
breakpoint earns its keep by recovering full-width kanban at tablet.

### Trade-offs Accepted

- **Narrower kanban columns on desktop**: At `max-width: 1280px`, each kanban column narrows from
  ~427 px (current full-width) to ~334 px. This is still well above the 260 px minimum and does not
  trigger horizontal scroll. Column content (card titles, descriptions) is still fully readable.
  This is acceptable given that the feed adds significant value in exchange.
- **Feed is below fold on tablet**: Tablet users (768–900 px) will need to scroll to see the feed.
  Tablet is explicitly not the primary device for MVP (productBrief); Alex uses a desktop. The
  tablet degradation is acknowledged and documented.

---

## Design Specifications

### Layout

**Desktop (> 900 px)**:
The `BoardViewPage` gains a `.boardLayout` grid wrapping the `<KanbanBoard>` and `<ActivityFeed>`
side by side:

```css
/* BoardViewPage.module.css — new rules */
.boardLayout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 260px;
  gap: var(--space-4);
  align-items: start;
}

@media (max-width: 900px) {
  .boardLayout {
    grid-template-columns: 1fr;
  }
}
```

The `.boardLayout` div replaces the current direct `<KanbanBoard>` render in the `renderBody`
success branch. Both the kanban and the feed panel live inside this grid row.

**Tablet (≤ 900 px)**:
`grid-template-columns: 1fr` — feed panel stacks below the full-width kanban. The kanban recovers
its full width within the `.page` max-width.

**Mobile (< 640 px)**:
Best-effort (MVP explicitly does not require mobile optimization). The feed panel is below the kanban
(same as tablet layout). The feed list is still readable.

**Activity Feed panel dimensions**:
- Width: `260px` (fixed, set by the grid column) on desktop
- `max-height: 480px` with `overflow-y: auto` so the panel scrolls independently of the page
- On tablet/mobile (stacked): `max-height: 320px`, `overflow-y: auto`, full width

### Key Components

| Component | Purpose | Behavior |
|-----------|---------|----------|
| `ActivityFeed` | Feed panel container | `<aside>` with `aria-label="Activity"`. Renders loading, empty, or list state. Self-contained. |
| `ActivityEntry` | Single feed entry (sub-render within `ActivityFeed`) | `<li>` inside `<ul>`. Card title, from → to labels, timestamp. Read-only. |
| Feed heading | Section label | `<h2>Activity</h2>` — fits the existing heading hierarchy (page h1 → feed h2). |
| `.boardLayout` | Two-column grid wrapper | New CSS class in `BoardViewPage.module.css`. Wraps kanban + feed. |

### Interactions

| Trigger | Action | Feedback |
|---------|--------|----------|
| Page mounts | `getActivity(boardId)` fires in parallel with board + card fetches | Feed panel shows `<Spinner>` (AC-LOADING-1) |
| `getActivity` resolves (events present) | Render `<ul>` of entries newest-first | List appears, replaces spinner |
| `getActivity` resolves (no events) | Render empty state | "No activity yet" text (AC-EMPTY-1) |
| SSE `activity:card_moved` arrives | Prepend new entry at top of list | New entry appears with a 600 ms highlight fade (see § Live-entry behavior) |
| User scrolls feed list | Feed scrolls independently within its `max-height` container | Kanban is unaffected |
| User scrolls page | Feed panel stays in layout flow (not fixed/sticky in v1) | Standard block scroll behavior |

### Responsive Behavior

| Breakpoint | Layout | Changes |
|------------|--------|---------|
| > 900 px | Two-column grid | Kanban in `minmax(0, 1fr)` + Feed in `260px` sidebar |
| 640–900 px (tablet) | Single column | Feed stacks below kanban; kanban full-width with existing `overflow-x: auto` |
| < 640 px | Single column | Same as tablet (mobile best-effort) |

---

## Decision Area 2: Entry Presentation

Each activity entry must show: card title, from-column → to-column, timestamp. The rendering must
handle long card titles gracefully and maintain visual hierarchy.

### Column Label Mapping

The `from_status` and `to_status` fields are stored as DB values (`'todo'`, `'in_progress'`,
`'done'`). These must be rendered as human-readable labels:

| DB value | Display label |
|----------|---------------|
| `todo` | To Do |
| `in_progress` | In Progress |
| `done` | Done |

A utility function `statusLabel(status: string): string` maps these in the frontend
(`ActivityFeed.tsx` or a shared `labels.ts` — consistent with the existing `CARD_STATUSES`
constant in `client/src/api/types.ts`).

### Entry Layout (per `<li>`)

```
┌──────────────────────────────────────────────────────────┐
│  Fix login redirect bug                                  │  ← card title (bold, truncated at 2 lines)
│  To Do → In Progress                                     │  ← from/to labels (muted, smaller)
│  2 minutes ago                                           │  ← timestamp (muted, smallest)
└──────────────────────────────────────────────────────────┘
```

**Visual hierarchy**:
- **Card title**: `font-size: var(--font-size-sm)` (14 px), `font-weight: var(--font-weight-medium)`,
  `color: var(--color-text-primary)`. Two-line max with `-webkit-line-clamp: 2` + `overflow: hidden`
  to prevent layout disruption from very long titles. No title truncation in the 260 px sidebar will
  ever leave the entry unreadable because the two-line clamp always shows enough context.
- **Column move**: `font-size: var(--font-size-xs)` (12 px), `color: var(--color-text-muted)`. Format:
  `{fromLabel} → {toLabel}` with a literal `→` arrow character (HTML `→` or `→`).
  WCAG: the arrow is decorative (direction is encoded in the label text too — "From [X] to [Y]" as
  `aria-label` on the `<li>` for screen readers).
- **Timestamp**: `font-size: var(--font-size-xs)` (12 px), `color: var(--color-text-muted)`.
  **Relative by default** (e.g., "2 minutes ago", "1 hour ago", "3 days ago") using a simple
  client-side `formatRelative(date)` utility (no external library — a few dozen lines of plain TS
  covering seconds/minutes/hours/days/weeks is sufficient for MVP). On hover, a `title` attribute
  renders the absolute ISO timestamp as a native tooltip (standard browser behavior, no extra work).

**WCAG contrast verification** (on `--color-surface` #FFFFFF background):
- `--color-text-primary` (#212529) on white: **16:1** — WCAG AAA ✓
- `--color-text-muted` (#6C757D) on white: **4.54:1** — WCAG AA ✓ (the feed panel background
  is `var(--color-surface)` / `#FFFFFF` so the 4.54:1 ratio for muted text is valid; see TASK-006
  creative § Decision Area 5 note: muted text must be on `--color-surface`, not `--color-bg`)

**Entry separator**: A 1 px `border-top: 1px solid var(--color-border)` on each `<li>` except the
first, consistent with the existing `--color-border` usage across the design system.

**Dense layout decision**: No avatar/icon for the actor (actor is always "anonymous" in v1 — showing
an icon for an anonymous user adds visual noise with no information value). The three-line layout
(title / move / timestamp) is compact enough for the 260 px sidebar while remaining readable.

---

## Decision Area 3: Empty and Loading States

### Loading State (AC-LOADING-1)

Reuse the existing `<Spinner>` component (`client/src/components/Spinner/Spinner.tsx`) exactly as-is.
The Spinner already has `role="status"`, `aria-live="polite"`, `aria-label="Loading content"`, and
the 200 ms CSS appearance delay (prevents flash on fast local calls — same NFR as the board load).

The Spinner is rendered inside the feed panel's content area while `getActivity` is in flight:

```tsx
// Inside ActivityFeed component
if (loadState === 'loading') {
  return <Spinner />;  // same import as used in BoardViewPage
}
```

The feed panel heading "Activity" remains visible above the spinner so the user knows what is loading.

### Empty State (AC-EMPTY-1)

Copy: **"No activity yet"** — a single line of muted text centered in the feed panel content area.
No sub-copy needed (the user on an empty board understands why: no cards have been moved).

This reuses the existing `EmptyState` component pattern (`EmptyState.tsx` with `heading` prop):

```tsx
if (entries.length === 0) {
  return <EmptyState heading="No activity yet" />;
}
```

The "No activity yet" copy is the canonical string for tests (AC-EMPTY-1 test assertion target).

**WCAG**: `--color-text-muted` (#6C757D) on `--color-surface` (#FFFFFF) = 4.54:1 ✓.

### Error State

If `getActivity` fails, the feed panel shows a short inline error message (not a full-page error —
the board still loads). Reuse `ErrorMessage` with a compact heading:

- Heading: **"Could not load activity"**
- Message: *"Try reloading the page."*

This is non-fatal: the board and kanban render normally. The feed error is scoped to the feed panel.

---

## Decision Area 4: Live-entry Behavior

### Prepend Strategy

New entries from SSE arrive via `useRealtimeBoard`'s `onActivityEvent` callback. The handler in
`BoardViewPage` prepends the new entry to the feed entries array:

```typescript
// In BoardViewPage — onActivityEvent handler
setActivityEntries(prev => [newEntry, ...prev]);
```

The feed `<ul>` renders entries array in order (index 0 = newest = top of list). A new entry at
index 0 renders at the top without any scroll manipulation. The user does not need to scroll to see
the new entry — it appears at the top of the list, which is what they are already looking at.

**Scroll preservation**: Because the new entry is prepended at the top and the user is likely
at the top of the feed, prepending does not disrupt their scroll position. If the user has scrolled
down into history, the prepend scrolls the feed container to the top only if `scrollTop === 0`
(default behavior for a new `<li>` at list start). No explicit `scrollIntoView` is needed.

### New-Entry Highlight

When a new entry arrives via SSE, it briefly highlights to draw the user's attention. This reuses
the same highlight-fade pattern established for card updates in TASK-007 (Spec 7):

```css
/* ActivityFeed.module.css */
.newEntry {
  animation: feedEntryHighlight 600ms ease-out forwards;
}

@keyframes feedEntryHighlight {
  0%   { background-color: var(--color-col-todo-bg); }   /* #EFF3FF — subtle blue tint */
  100% { background-color: var(--color-surface); }        /* #FFFFFF */
}

@media (prefers-reduced-motion: reduce) {
  .newEntry {
    animation: none;
    background-color: var(--color-col-todo-bg);
    transition: background-color 0s;
  }
}
```

The `newEntry` CSS class is applied to the `<li>` for the first newly-prepended entry on each SSE
event. A React state flag (`newestEntryId: number | null`) drives the class application; it is
cleared after 700 ms (slightly longer than the animation). This mirrors the `highlightedCardIds`
Set pattern from `BoardViewPage.tsx` for card highlight.

**Token choice**: `--color-col-todo-bg` (#EFF3FF — light indigo tint) is chosen for the entry
highlight because it is subtly distinguishable from the white surface without being alarming. It
re-uses an existing token (no new color values — consistent with Guiding Principle 4 and the
TASK-007 real-time highlight decision which also reused existing tokens).

**WCAG (reduced motion)**: The `prefers-reduced-motion` rule applies a static tint with no animation,
consistent with the card highlight pattern in TASK-007 Spec 7.

---

## Decision Area 5: Accessibility

### List Semantics

The feed entries are rendered as a proper `<ul>` / `<li>` structure:

```html
<aside aria-label="Activity" aria-labelledby="activity-heading">
  <h2 id="activity-heading">Activity</h2>
  <ul aria-label="Activity entries" role="list">
    <li aria-label="Card title moved from To Do to In Progress 2 minutes ago">
      <!-- entry content -->
    </li>
    ...
  </ul>
</aside>
```

Each `<li>` has a computed `aria-label` that reads the move in natural language for screen readers:
`"{cardTitle} moved from {fromLabel} to {toLabel} {timestamp}"`. This ensures screen readers convey
the full meaning even though the visual layout uses abbreviated presentation (arrow character, etc.).

**Note on `role="list"`**: Added to the `<ul>` because some browsers (notably Safari) strip list
semantics when `list-style: none` is applied in CSS (the feed list will have no bullets). Adding
`role="list"` explicitly re-asserts the semantic role.

### Live Region for New Entries (aria-live)

When a new entry arrives via SSE, the live region should announce it politely to screen readers
without interrupting in-progress reading. Use `aria-live="polite"` on the `<ul>` (or a separate
visually-hidden announcer element):

```html
<ul aria-live="polite" aria-label="Activity entries" role="list">
  <!-- new entries prepend here -->
</ul>
```

**Rationale for `polite` over `assertive`**: The activity feed is informational — new card-move events
are not urgent alerts. `aria-live="assertive"` would interrupt any in-progress screen reader
announcement (e.g., the user is reading a card title). `polite` queues the announcement for the next
pause, which is the appropriate behavior for a background feed. This mirrors the Spinner's
`aria-live="polite"` choice in the existing codebase.

**Important caveat**: `aria-live` on a container that receives DOM insertions (prepend) is well-
supported but has edge cases in some browsers. If the live region announces the full list contents
rather than just the new item, a separate `aria-atomic="false"` + `aria-relevant="additions"` can
be added to scope announcements to additions only:

```html
<ul aria-live="polite" aria-atomic="false" aria-relevant="additions" role="list">
```

### Keyboard Reachability

The `<ActivityFeed>` panel is an `<aside>`, which is a landmark region. Screen reader users can
navigate directly to it via landmark navigation (e.g., VoiceOver `VO + U`, JAWS `R`). The feed
entries are `<li>` elements — not interactive (no buttons, links, or inputs in v1) so Tab does not
land on individual entries. The feed is keyboard-reachable via landmark navigation only, which is
correct for a read-only list.

**If the feed gains scrollable overflow**: When `max-height` triggers `overflow-y: auto`, keyboard
users should be able to scroll the feed. Add `tabIndex={0}` to the scrollable `<ul>` or its wrapper
`<div>` to make it programmatically focusable and keyboard-scrollable (arrow keys, Page Up/Down):

```html
<div class="feedScroller" tabIndex={0} aria-label="Activity history, scroll to see more">
  <ul ...>
```

### Focus Indicators

The feed panel itself has no interactive elements in v1 (read-only list). No focus indicators are
needed for entries. The scrollable container with `tabIndex={0}` will receive the standard
`box-shadow: var(--focus-ring)` `:focus-visible` treatment:

```css
/* ActivityFeed.module.css */
.feedScroller:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
  border-radius: var(--radius-sm);
}
```

### Color Contrast

All tokens in use have been verified in TASK-006 creative § Decision Area 5. No new color values
are introduced. The feed panel uses:
- `--color-surface` (#FFFFFF) as background
- `--color-text-primary` (#212529) for card titles: **16:1** ✓
- `--color-text-muted` (#6C757D) for labels + timestamp (on white): **4.54:1** ✓
- `--color-border` (#DEE2E6) for entry separators (decorative, no contrast requirement)
- `--color-col-todo-bg` (#EFF3FF) for new-entry highlight (decorative animation, not
  contrast-critical; underlying text remains `--color-text-primary`)

---

## User Journey for UAT

The following journey description is suitable for `/banyan-uat` to walk:

**Persona**: Alex the Dev (software engineer on a 4-person team; desktop browser).

**Journey: Open board → observe feed → move a card → see new entry at top**

1. Navigate to `http://localhost:3000`. The board list page loads.
2. Click a board that has at least one existing card move in its history.
3. The board view page (`/boards/:id`) loads. Verify:
   - The Activity feed panel is visible to the right of the kanban columns (desktop).
   - The feed panel shows either a `<Spinner>` (loading state) or a list of entries / "No activity yet".
4. Once loading completes: if entries exist, the newest entry appears at the top of the list.
   Verify each entry shows: card title, from-column → to-column (e.g., "To Do → In Progress"),
   and a relative timestamp.
5. Drag a card from one column to another (or use the "Move to column" keyboard dialog).
6. After the card moves, verify:
   - The kanban board shows the card in its new column.
   - Within 1 second (SSE latency), a new entry appears at the top of the Activity feed.
   - The new entry shows the correct card title, correct source → target column labels, and a recent
     timestamp (e.g., "just now" or "< 1 minute ago").
   - The new entry briefly highlights (light blue flash) before fading to white.
7. Open the same board in a second browser tab. Move a card in Tab A. Verify the new entry appears
   in Tab B's feed as well (AC-HAPPY-2: cross-tab delivery via SSE).
8. Open a board with no card movement history. Verify the feed shows "No activity yet" (AC-EMPTY-1).

**Success criteria for UAT PASS**:
- Feed panel visible on board view without user interaction (AC-ENTRY-1)
- Entries load on mount showing history (AC-LOAD-1)
- "No activity yet" shown on empty board (AC-EMPTY-1)
- Spinner shown during initial load (AC-LOADING-1)
- New entry appears within 1 second of card move (AC-HAPPY-2)
- Entry content correct: title + from → to labels + timestamp
- Second tab receives the live entry

---

## Implementation Guidelines

### For Developers

1. **`BoardViewPage.tsx` layout change**: Wrap the `renderBody` success branch output in a new
   `.boardLayout` `<div>`. Place `<KanbanBoard .../>` as the first child and `<ActivityFeed .../>` as
   the second. The existing `<KanbanBoard>` props are unchanged — only the containing element changes.

2. **Parallel fetch**: Add `getActivity(id, controller.signal)` to the existing `Promise.all` in the
   `useEffect` that fires `getBoard` and `getCards`. Extend `LoadState` to carry `activityEntries` in
   the `success` variant. The activity fetch failure is non-fatal: catch it separately and set a
   `feedError: boolean` flag; the board still renders.

3. **`ActivityFeed` component props**:
   ```typescript
   interface ActivityFeedProps {
     readonly entries: ActivityEvent[];
     readonly loadState: 'loading' | 'success' | 'error';
     readonly newestEntryId: number | null; // for highlight — cleared after 700ms
   }
   ```

4. **`onActivityEvent` in `useRealtimeBoard`**: When an `activity:card_moved` SSE event arrives,
   call `setActivityEntries(prev => [event.activity, ...prev])` and set `newestEntryId` to
   `event.activity.id` with a `setTimeout` to clear it after 700 ms (mirrors `highlightCard` in
   `BoardViewPage`).

5. **Activity events carry no `originId`**: The SSE `activity:card_moved` event has no `originId`
   field (by Architecture design — AC-HAPPY-2.2). The existing echo-drop logic in `useRealtimeBoard`
   (which filters events where `event.originId === clientId`) will NOT drop activity events. The
   originating tab sees its own move in the feed — this is intentional and correct.

6. **Status label utility**:
   ```typescript
   // e.g., in client/src/api/types.ts or a new labels.ts
   export function statusLabel(status: string): string {
     const labels: Record<string, string> = {
       todo: 'To Do',
       in_progress: 'In Progress',
       done: 'Done',
     };
     return labels[status] ?? status;
   }
   ```

7. **Relative timestamp utility**: A minimal `formatRelative(date: Date | string): string` function.
   No external library needed. Example buckets: `< 60s → "just now"`, `< 60min → "N minutes ago"`,
   `< 24h → "N hours ago"`, `< 7d → "N days ago"`, else absolute `"MMM D"`. Apply `title={new Date(occurred_at).toISOString()}` on the timestamp `<span>` for the hover tooltip.

8. **CSS Module class naming** (camelCase per TASK-006 convention):
   - `.panel` — the `<aside>` container
   - `.heading` — the `<h2>Activity</h2>`
   - `.feedScroller` — the scrollable `<div>` wrapping the `<ul>`
   - `.list` — the `<ul>`
   - `.entry` — each `<li>`
   - `.entryTitle` — card title line
   - `.entryMove` — from → to line
   - `.entryTimestamp` — timestamp line
   - `.newEntry` — CSS animation class for new live entries (applied and removed via React state)

9. **`prefers-reduced-motion`**: The `@keyframes feedEntryHighlight` animation is wrapped with a
   `@media (prefers-reduced-motion: reduce)` override that disables the animation and applies a static
   tint. Mirror the pattern from TASK-007 Spec 7 (`CardItem.module.css .recentlyUpdated`).

### Component Structure

```
client/src/components/ActivityFeed/
├── ActivityFeed.tsx       ← panel container; renders loading/empty/list states
├── ActivityFeed.module.css
└── ActivityFeed.test.tsx
```

No sub-component file for `ActivityEntry` — it is a private render within `ActivityFeed.tsx` (a
`function renderEntry(entry: ActivityEvent, isNew: boolean)` — consistent with the existing
`renderBody` private function pattern in `BoardViewPage.tsx`).

### Recommended Patterns

- Reuse `<Spinner>` exactly (no prop changes needed — existing `aria-label="Loading content"` is
  appropriate for the feed loading state).
- Reuse `EmptyState` with `heading="No activity yet"` (no sub-copy).
- Reuse `ErrorMessage` with compact copy for feed-specific error.
- No new design tokens — all styling uses existing `tokens.css` variables.
- No new external libraries — relative timestamp is a small utility function.

---

## Validation Checklist

- [x] Meets all user goals: simultaneous visibility with kanban on desktop (Alex standup use case);
      live prepend without scroll interruption; clear entry format (title + from/to + timestamp)
- [x] Accessible per WCAG 2.1 AA: `<ul>`/`<li>` list semantics + `role="list"`; `<aside>` landmark;
      `aria-live="polite"` for live entries; `aria-label` on each entry for screen reader natural
      language; `--color-text-primary` 16:1 and `--color-text-muted` 4.54:1 on white (verified);
      `tabIndex={0}` on scrollable container + `:focus-visible` ring; `prefers-reduced-motion` honored
- [x] Consistent with existing patterns: CSS Modules + tokens.css; reuses `<Spinner>`, `EmptyState`,
      `ErrorMessage`; highlight animation mirrors TASK-007 Spec 7 pattern; state machine matches
      existing `loading | success | error` pattern; `camelCase` CSS class names
- [x] Respects Guiding Principles: GP4 — no new libraries, simplest layout change (one CSS grid +
      one breakpoint); GP5 — feed error copy is generic, no server detail; GP3 — no `console.*` in
      new frontend code; GP1 — no hardcoded config
- [x] Responsive across devices: desktop (> 900px) sidebar; tablet/mobile (≤ 900px) stacked below
      with full-width kanban restored
- [x] Performance acceptable: `getActivity` fires in parallel with existing fetches (no waterfall);
      `<Spinner>` 200ms delay prevents flash; no external libraries; CSS-only highlight animation
- [x] Implementation feasible: one new component (`ActivityFeed`), one CSS layout change
      (`BoardViewPage.module.css`), extension of `useRealtimeBoard` handler, parallel fetch extension
- [x] All AC behavioral states covered: AC-ENTRY-1, AC-LOAD-1, AC-EMPTY-1, AC-LOADING-1,
      AC-HAPPY-1/2/3 (frontend AC portions)
- [x] UAT journey documented for `/banyan-uat`

---

## Next Steps

1. **Phase 3 (`/banyan-build`) — Frontend ActivityFeed & integration**: Implement `ActivityFeed.tsx`
   (+ `.module.css` + `.test.tsx`), add `.boardLayout` grid to `BoardViewPage.module.css`, wire the
   parallel `getActivity` fetch, extend `useRealtimeBoard` with `onActivityEvent`, extend
   `BoardViewPage.tsx` to hold feed state and render the layout. Tests per Phase 3 test guidance
   (12–16 tests covering loading/empty/list/live-prepend states and the layout).
2. **`/banyan-uat`**: Walk the UAT journey documented above. On PASS, generate the E2E spec.
3. **Phase 4 (`/banyan-build`) — E2E implementation**: Implement the generated E2E spec (entry-to-
   success: open board → move card → new feed entry appears at top with title + from → to +
   timestamp).
