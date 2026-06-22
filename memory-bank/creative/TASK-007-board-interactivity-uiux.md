# UI/UX Decision: Board Interactivity and Real-Time Collaboration (TASK-007)

**Created**: 2026-06-21
**Status**: DECIDED
**Decision Type**: UI/UX
**Task**: TASK-007 (FEAT-007) — Level 3
**Scope**: Create/edit form patterns per surface, drag-and-drop affordances (including keyboard alternative), and real-time update visual feedback for the interactive extension of the FEAT-006 React SPA.

---

## User Context

### Target Users

- **Primary**: Alex the Dev — software engineer on a 4-person team. Zero context-switch overhead is the goal. Values speed and directness. Will drag cards during standups; creates/edits cards without leaving the board.
- **Secondary (1)**: Jordan the PM — part-time coordinator needing low-friction card and board edits. Not a power user; needs clear, guessable affordances.
- **Secondary (2)**: Sam the Maker — solo developer. Runs locally, simple usage, values simplicity.

### User Goals

1. Move a card between columns in one drag gesture (or keyboard equivalent) — status change visible immediately
2. Create a new card in a specific column without navigating away from the board — form appears in context
3. Edit a card's title/description quickly without losing context of the full board
4. Create a new board from the board list with minimal friction
5. Edit a board's name from the board view without a page reload
6. See teammates' changes on the same board live, without manually refreshing
7. Cancel any form action instantly (Escape or Cancel button) with no side effects

### Use Cases

| Use Case | User | Goal | Frequency |
|----------|------|------|-----------|
| Drag card from To Do to In Progress during standup | Alex | Status update, zero friction | Daily |
| Add a card to a specific column mid-session | Alex, Jordan | Capture new task without context switch | Several times/day |
| Edit card title when requirements change | Alex, Jordan | Fix inaccurate title | Several times/week |
| Create a new board for a new project | Alex, Sam | Set up workspace | Occasionally |
| Rename a board when a project scope changes | Jordan | Board hygiene | Occasionally |
| See a teammate's card move live | Alex, Jordan | Situational awareness during async work | Whenever others are active |

### Constraints

- **Devices**: Desktop primary; tablet-usable (min ~768 px). Mobile-first is explicitly out of scope.
- **Accessibility**: WCAG 2.1 AA (reasonable effort). Mandatory: keyboard alternative for drag-and-drop (WCAG 2.1 SC 2.1.1); focus trap in modal dialogs; `role="alert"` for inline validation errors (consistent with existing `ErrorMessage` pattern); visible focus indicators via `:focus-visible`.
- **Existing Patterns**: CSS Modules + CSS Custom Property tokens (`tokens.css`). No new styling framework. Same `ErrorMessage` / `errorCopy` patterns as FEAT-006. DnD library confirmed as `@dnd-kit` (Architecture creative phase). State machine model (`idle | loading | success | error`) as established in FEAT-006 pages.
- **Error architecture**: forms must reuse the `ApiErrorCategory` → user-facing copy pattern; never expose internal detail (GP5).
- **Browser support**: Chrome 120+, Firefox 120+, Safari 17+, Edge 120+.

---

## User Flow

### Flow Diagram

```
[Board List Page /]
  |
  |-- [Click "New Board"]
  |       |
  |       v
  |   [Modal: Create Board Form]
  |   Name* | Description | [Create] [Cancel/Esc]
  |       |
  |       v (submit success)
  |   [Board appears in list — modal closes]
  |
  |-- [Click board entry]
  |       |
  |       v
  [Board View /boards/:id]
    |
    |-- [Click edit icon next to h1] → [Inline form replaces h1: name + description + Save + Cancel]
    |       |
    |       v (save success)
    |   [h1 text updates in place — form collapses]
    |
    |-- [Click "Add Card" in column footer]
    |       |
    |       v
    |   [Inline form expands at column bottom: title* + description + Add + Cancel/Esc]
    |       |
    |       v (submit success)
    |   [Card appears at bottom of column — form collapses/resets]
    |
    |-- [Click card title / hover → edit icon]
    |       |
    |       v
    |   [Modal: Edit Card Form] title* + description + [Save] [Cancel/Esc]
    |       |
    |       v (save success)
    |   [Card title/description update in column — modal closes]
    |
    |-- [Drag card across columns (pointer)]
    |       |
    |       v (on drop)
    |   [Card moves optimistically; PATCH in flight → success → stays; failure → reverts + error toast]
    |
    |-- [Keyboard: focus card → activate "Move to…" button → pick column]
    |       |
    |       v (select column)
    |   [Card moves — same optimistic + rollback path]
    |
    |-- [Real-time: remote change arrives]
            |
            v
        [Changed card flashes a brief highlight — no toast; silent after 600ms]
```

### Error States

| Error | Cause | User Recovery |
|-------|-------|---------------|
| Board name empty on create | Client-side validation | Inline `role="alert"` error message; user corrects and resubmits |
| Card title empty on create | Client-side validation | Inline `role="alert"` error; user corrects |
| API 500 / network on form submit | Server or network fault | Inline server error copy (keyed on `ApiErrorCategory`); form input preserved |
| Drag PATCH fails (500 / network) | Server or network fault | Card reverts to origin column; brief `role="alert"` error strip at top of board |
| Edit board name fails | 500 / network | Inline error in edit form; previous name unchanged |

---

## Decision Area 1: Form Pattern for Each Surface

There are three plausible patterns for a create/edit form on a kanban board:

- **Modal / dialog**: Centered `<dialog>` or overlay with form. Focus-trapped. Backdrop dims the board.
- **Inline expand**: A form expands in place (within the column, or replacing the heading). No overlay. Context of the board stays visible.
- **Drawer / panel**: A side panel slides in with the full detail form.

The right pattern depends on the surface's cognitive requirements and the user's spatial context.

### Option 1A: Modal for Everything

Every create/edit action opens a centered `<dialog>` overlay regardless of surface.

- **Approach**: One reusable `<Dialog>` primitive (`role="dialog"`, `aria-modal="true"`, focus trap, Escape closes). `BoardForm` and `CardForm` render inside it for all four surfaces.
- **Wireframe (create board)**:
  ```
  ┌─────────────────────────────────────────────────────────────┐
  │  BanyanBoard                                                 │
  ├─────────────────────────────────────────────────────────────┤
  │  [dark overlay 40% opacity]                                  │
  │                                                              │
  │         ┌───────────────────────────────────┐               │
  │         │  Create Board                  [×] │               │
  │         │  ─────────────────────────────     │               │
  │         │  Name *                            │               │
  │         │  ┌─────────────────────────────┐   │               │
  │         │  │                             │   │               │
  │         │  └─────────────────────────────┘   │               │
  │         │  [error: "Board name is required"]  │               │
  │         │  Description                       │               │
  │         │  ┌─────────────────────────────┐   │               │
  │         │  │                             │   │               │
  │         │  └─────────────────────────────┘   │               │
  │         │                                    │               │
  │         │       [Cancel]  [Create Board]     │               │
  │         └───────────────────────────────────┘               │
  └─────────────────────────────────────────────────────────────┘
  ```
- **User Flow**: User clicks "New Board" button → dialog opens, focus goes to first input → user fills form → Submit or Escape → dialog closes, focus returns to trigger element.
- **Pros**:
  - Consistent single pattern across all surfaces — one `<Dialog>` primitive to test
  - Focus trap prevents accidental tab escape mid-edit
  - Well-understood WCAG pattern (`role="dialog"`, `aria-modal`, focus return on close)
  - Full-form fields are clearly separated from board content — no risk of visual ambiguity
  - Edit card benefits strongly: an edit dialog keeps the board context visible behind the dimmed overlay
- **Cons**:
  - Modal for "add card" feels heavy relative to the inline Trello-style expand — creates a context switch for a very frequent operation
  - Modal for "edit board name" (which has just one field) is disproportionate — the inline pattern is much lighter for a single-field rename
  - Users must wait for animation/focus trap even for trivial edits
- **Usability**: High for card edit; Medium for create card / edit board (overhead vs. weight of action)
- **Accessibility**: High — focus trap, Escape, focus return are all the gold standard
- **Implementation Complexity**: Low (one Dialog primitive serves all four surfaces)

### Option 1B: Inline for Everything

Every create/edit action expands an inline form in place — the column footer expands, the `<h1>` is replaced with an input, etc.

- **Approach**: No overlay, no focus trap. Forms render inline in context; the surrounding board remains interactive.
- **Wireframe (add card in column)**:
  ```
  ┌───────────────────────────────────┐
  │  IN PROGRESS           2          │
  │  ─────────────────────────────    │
  │  ┌────────────────────────────┐   │
  │  │ Card A                     │   │
  │  └────────────────────────────┘   │
  │  ┌────────────────────────────┐   │
  │  │ Card B                     │   │
  │  └────────────────────────────┘   │
  │  ┌────────────────────────────┐   │
  │  │ Title *                    │   │
  │  │ ┌──────────────────────┐   │   │
  │  │ │                      │   │   │
  │  │ └──────────────────────┘   │   │
  │  │ [error msg if any]         │   │
  │  │ [Add Card]  [Cancel]       │   │
  │  └────────────────────────────┘   │
  └───────────────────────────────────┘
  ```
- **Pros**:
  - Lowest friction for add-card — the canonical Trello pattern for frequent operations
  - Board context remains visible while editing — no cognitive context switch
  - No overlay or animation overhead
- **Cons**:
  - Edit card with a description field inside a narrow card column is cramped (card column is ~260–300 px)
  - No focus trap — Tab key can escape the edit form into adjacent columns during edit
  - Edit board (replacing the `<h1>` inline) requires careful focus management to return focus correctly
  - Create board on the board LIST page with an inline expand has no clear spatial anchor — where does the form appear in the list?
- **Usability**: High for create card; Medium for edit card / create board / edit board
- **Accessibility**: Medium — no focus trap means Tab can escape the form mid-edit
- **Implementation Complexity**: Medium — each surface gets a bespoke inline form component

### Option 1C: Mixed Patterns Per Surface (Recommended)

Use the lightest-weight appropriate pattern for each surface, rather than forcing uniformity:
- **Create board**: Modal — no spatial anchor on list; the user is creating something new
- **Edit board**: Inline — single field (name), inline replacement of the `<h1>`; ephemeral and lightweight
- **Create card**: Inline within column — Trello pattern; frequent op, contextual
- **Edit card**: Modal — full fields, needs focus trap to prevent Tab escape in a narrow card

- **Approach**: Build ONE shared `<Dialog>` primitive for create-board and edit-card. Build ONE shared `InlineForm` helper for edit-board and create-card. `BoardForm` and `CardForm` are content components that work in either context.
- **Wireframe (edit board — inline)**:
  ```
  ┌─────────────────────────────────────────────────────────────┐
  │  ← Back to boards                                           │
  │                                                              │
  │  ┌───────────────────────────────────────────────────────┐   │
  │  │ Alpha Project     [text input, pre-filled]  [✓] [✗]  │   │
  │  └───────────────────────────────────────────────────────┘   │
  │  [optional: description input below, shown if description exists] │
  │                                                              │
  │  ┌──────────────┬──────────────┬──────────────┐             │
  │  │ TO DO        │ IN PROGRESS  │ DONE         │             │
  │  ...                                                         │
  ```
- **Wireframe (edit card — modal)**:
  ```
  ┌─────────────────────────────────────────────────────────────┐
  │  [board content dimmed behind overlay]                       │
  │                                                              │
  │         ┌───────────────────────────────────┐               │
  │         │  Edit Card                     [×] │               │
  │         │  ─────────────────────────────     │               │
  │         │  Title *                           │               │
  │         │  ┌─────────────────────────────┐   │               │
  │         │  │ Fix login redirect bug      │   │               │
  │         │  └─────────────────────────────┘   │               │
  │         │  Description                       │               │
  │         │  ┌─────────────────────────────┐   │               │
  │         │  │ POST /login should redirect │   │               │
  │         │  │ to dashboard after success  │   │               │
  │         │  └─────────────────────────────┘   │               │
  │         │                                    │               │
  │         │       [Cancel]  [Save Changes]     │               │
  │         └───────────────────────────────────┘               │
  └─────────────────────────────────────────────────────────────┘
  ```
- **Pros**:
  - Optimal cognitive weight per surface — add-card stays lightweight (inline), edit-card is safe (modal)
  - A single `<Dialog>` primitive handles both modal cases (create board + edit card) — no duplication
  - Inline edit-board is the least disruptive rename pattern; matches Linear/GitHub
  - Both `BoardForm` and `CardForm` as reusable content-only components work in either Dialog or inline context
  - Aligned with what the persona (Alex) is doing: frequent add-card warrants low friction; occasional edit-card warrants correctness
- **Cons**:
  - Two interaction patterns to implement and test rather than one; slightly more component surface area
  - The inline edit-board requires careful DOM manipulation (replacing text with an input, restoring on cancel)
  - Mixed patterns could briefly confuse users who expect uniformity — acceptable trade-off for a developer audience
- **Usability**: High (each surface uses its optimal pattern)
- **Accessibility**: High (Dialog has focus trap; inline uses `aria-label`/`role="form"` + documented keyboard flows)
- **Implementation Complexity**: Medium — two primitives (`<Dialog>` + `<InlineForm>`) rather than one

### Option 1D: Drawer for Everything

A right-side panel slides in for all create/edit operations.

- **Approach**: A `<aside>` panel with a slide-in animation; form content renders inside it.
- **Pros**: Drawer is good for richly-detailed cards (labels, due dates, assignees — future features).
- **Cons**: Over-engineered for MVP scope (add-card drawer for a title field is absurd); column layout is disrupted on tablet width; significantly more CSS and animation work; the card model currently only has title + description — a drawer earns its keep only at Notion/Jira complexity. Drawer is better as a future upgrade path, not the MVP pattern.
- **Usability**: Medium (overkill for current fields)
- **Accessibility**: High (panel focus trap, Escape)
- **Implementation Complexity**: High

### Evaluation Matrix — Form Patterns

| Criteria | Option 1A (Modal all) | Option 1B (Inline all) | Option 1C (Mixed — recommended) | Option 1D (Drawer all) |
|----------|-----------------------|------------------------|----------------------------------|------------------------|
| Usability | Medium | Medium | High | Medium |
| Accessibility | High | Medium | High | High |
| Consistency | High | High | Medium | High |
| Add-card friction | Medium (modal overhead) | High (low friction) | High (inline) | Low (drawer overhead) |
| Edit-card safety | High (focus trap) | Medium (no trap) | High (modal) | High (panel trap) |
| Implementation | Low | Medium | Medium | High |
| Board context visible | No (overlay) | Yes | Partial (inline)/No (modal) | Yes (side) |

**Decision (Form Pattern): Option 1C — Mixed patterns per surface.**

---

## Decision Area 2: Drag-and-Drop Visual Affordances

The DnD library is `@dnd-kit/core` + `@dnd-kit/sortable` (Architecture creative decision). `@dnd-kit` provides pointer sensor, keyboard sensor, and accessibility attributes out of the box.

### Option 2A: Drag Handle Only

A dedicated grip-icon handle (`⠿` or `⋮⋮`) appears on card hover/focus. Only the handle is the drag initiation point.

- **Approach**: Add a `<button>` with `aria-label="Drag card"` and a CSS icon inside `CardItem`. The `@dnd-kit` `useDraggable` hook attaches to this handle element. The card body itself is not draggable. The handle appears on `:hover` and `:focus-within` of the card.
- **Wireframe**:
  ```
  ┌─────────────────────────────────────┐
  │ [⠿] Fix login redirect bug          │ ← handle left; visible on hover/focus
  │      POST /login should redirect…   │
  └─────────────────────────────────────┘
  ```
- **Pros**:
  - Unambiguous: users understand the grip icon means "drag this"
  - Card click area is separate from drag area — no accidental drags when clicking to edit
  - Grip handle is the natural keyboard DnD activation point for `@dnd-kit`'s keyboard sensor
  - Consistent with Linear, Jira — developer-audience expectation
- **Cons**:
  - Handle is hidden until hover/focus — users may not discover it immediately (first-time UX)
  - Slightly more DOM (extra `<button>` inside the card)
  - On tablet (touch/pointer), hover is not available — handle must be always-visible or triggered by focus
- **Usability**: High (once discovered)
- **Accessibility**: High — the handle `<button>` is naturally keyboard-focusable and activates the `@dnd-kit` keyboard sensor
- **Implementation Complexity**: Low

### Option 2B: Full-Card Draggable

The entire card is the drag source. Clicking the card opens the edit form; dragging from anywhere on the card initiates the DnD gesture.

- **Approach**: `useDraggable` is attached to the `<article>` card element. A `pointerdown` threshold (`activationConstraint: { distance: 8 }`) distinguishes a drag from a click. Clicking without exceeding the distance threshold opens the edit affordance.
- **Pros**:
  - Larger hit area — easier on a trackpad or touch
  - No extra handle element; visually cleaner
- **Cons**:
  - Click vs. drag disambiguation is tricky — a short accidental drag can cancel an intended click; the 8px activation constraint helps but is imperfect, especially with a trackpad
  - Accessibility gap: the `<article>` is not naturally a keyboard-activatable drag source — `@dnd-kit` keyboard sensor requires a focusable element with keyboard activation
  - To keep the keyboard sensor working, a visually-hidden focusable element is still needed — at that point a handle button is effectively required anyway
  - Users do not have a clear affordance for "this is draggable" — no grip icon
- **Usability**: Medium (click-vs-drag disambiguation friction)
- **Accessibility**: Medium — requires extra workaround for keyboard sensor
- **Implementation Complexity**: Medium (activation constraint + disambiguation logic)

### Option 2C: Drag Handle + Always Visible (no hover-reveal)

Like 2A but the grip handle is always visible (not hidden behind hover).

- **Approach**: Grip handle `<button>` is always rendered at a low opacity (e.g., `opacity: 0.3`) and increases to full opacity on card hover/focus.
- **Pros**: Handle is discoverable on first visit without hover; still visually unobtrusive.
- **Cons**: Slightly more visual noise on the card. For a developer audience with many cards, always-showing handles adds clutter.
- **Usability**: High (more discoverable)
- **Accessibility**: High
- **Implementation Complexity**: Low

### Evaluation Matrix — DnD Affordances

| Criteria | Handle reveal-on-hover (2A) | Full-card (2B) | Handle always-visible (2C) |
|----------|-----------------------------|----------------|----------------------------|
| Discoverability | Medium | Medium | High |
| Click vs. drag separation | High | Medium | High |
| Accessibility (keyboard) | High | Medium | High |
| Visual cleanliness | High | High | Medium |
| Implementation | Low | Medium | Low |

**Decision (DnD Affordance): Option 2A with tablet-aware always-visible fallback.**

Grip handle (`<button>`, `aria-label="Reorder card"`) that reveals on card `:hover` / `:focus-within`. On tablets (pointer: coarse media query) the handle renders always-visible at reduced opacity. This is the `@dnd-kit` idiomatic pattern.

---

## Decision Area 3: Real-Time Update Visual Feedback

When a remote change arrives (another user created, moved, or edited a card), three patterns are possible:

### Option 3A: Silent Update

The card simply appears in its new column / with its new data. No visual cue beyond the DOM change.

- **Pros**: Zero implementation overhead; no visual noise.
- **Cons**: In a collaborative context, silent changes can be disorienting — the user does not know if the board just spontaneously changed or if they misremembered the card position. Two users on a shared board with no feedback cue is confusing.
- **Usability**: Low (no feedback for remote changes)
- **Accessibility**: Medium (`aria-live` on card lists would announce DOM mutations to screen readers anyway)
- **Implementation Complexity**: Low

### Option 3B: Brief Highlight / Flash on Changed Cards

The updated card briefly flashes a highlighted background (using a CSS keyframe animation). The highlight fades after ~600 ms.

- **Approach**: When the subscription hook applies a `card:updated` or `card:created` event to local state, a `highlightedCardId` flag is set. The `CardItem` component receives a `highlighted` prop that applies a CSS animation class (`styles.recentlyUpdated`) that runs a single keyframe from `--color-surface-hover` back to `--color-surface`.
- **Wireframe**:
  ```
  ┌─────────────────────────────────────┐
  │  Fix login redirect bug             │ ← briefly: background #F1F3F5 → fades to #FFFFFF
  │  POST /login should redirect…       │    (uses existing --color-surface-hover token)
  └─────────────────────────────────────┘
  ```
- **Pros**:
  - Clear but unobtrusive: user sees exactly which card changed without modal/toast interruption
  - Uses existing design tokens (`--color-surface-hover`, `--color-surface`) — zero new colors needed
  - CSS-only animation (`@keyframes`) — no JS state timer needed for the fade
  - Does not disrupt the user's current interaction (no focus change, no toast to dismiss)
  - Complementary to the optimistic-update model: when the current user's own mutation echoes back from the server, the echo is de-duped in the subscription hook — so the current user does NOT see a flash for their own changes (only remote changes flash)
- **Cons**:
  - Users who look away briefly may miss the flash entirely — best paired with a card ordering strategy that surfaces new cards visibly
  - No attribution ("Jordan moved this card") — silent on the actor
- **Usability**: High (feedback without interruption)
- **Accessibility**: Medium — the animation should respect `prefers-reduced-motion` (set animation duration to 0, still apply a temporary background change)
- **Implementation Complexity**: Low (CSS keyframe + prop on CardItem)

### Option 3C: Toast Notification

When a remote update arrives, a toast popup appears briefly: "Jordan moved 'Fix login bug' to In Progress".

- **Approach**: A toast queue component (e.g., positioned fixed bottom-right) renders timed notifications for each incoming remote event.
- **Pros**: Provides actor attribution; clearly communicates what changed even if the user was not looking at that column.
- **Cons**:
  - Requires a toast queue component — new UI primitive not in the FEAT-006 design system
  - Frequent updates from an active team (multiple cards moved in sequence) would produce a toast storm
  - Toast content requires knowing the actor's identity — MVP has no authentication, so there is no "Jordan" user identity to attribute (productBrief: no per-user auth in MVP); toasts would just say "A card was moved" — significantly less useful
  - Toast requires dismissal affordance for accessibility (keyboard-dismissable); adds complexity
  - The real-time event schema (Architecture creative) would need to carry a user display name — which does not exist in the current MVP model
- **Usability**: Medium (useful with auth; less useful without)
- **Accessibility**: Medium — toast `role="status"` is manageable but adds work
- **Implementation Complexity**: High (toast queue + actor attribution gap)

### Evaluation Matrix — Real-Time Visual Feedback

| Criteria | Silent (3A) | Highlight flash (3B) | Toast (3C) |
|----------|-------------|----------------------|------------|
| Clarity of remote change | Low | High | High |
| Interruption to user | None | Minimal | Medium-High |
| Actor attribution | None | None | None (no auth in MVP) |
| Token system consistency | N/A | High (reuses existing) | Low (new primitive) |
| Implementation | Low | Low | High |
| Works with optimistic updates | Yes | Yes (de-dup) | Fragile (double-notify risk) |

**Decision (Real-Time Feedback): Option 3B — Brief highlight/flash on changed cards.**

---

## Full Decision Summary

| Surface | Pattern | Rationale |
|---------|---------|-----------|
| Create board (on `/`) | **Modal dialog** | No spatial anchor on the list; infrequent; focus trap appropriate; single primitive reused |
| Edit board (on `/boards/:id`, h1 area) | **Inline replacement** | Single-field rename; frequent enough that a modal feels heavy; matches Linear/GitHub rename UX |
| Create card (within `Column`) | **Inline expand at column footer** | Canonical kanban "add card" pattern; very frequent op; column context must stay visible |
| Edit card (from `CardItem`) | **Modal dialog** | Full title + description form; focus trap prevents Tab escape in narrow column; reuses Dialog primitive |
| Drag-and-drop | **Grip handle (hover-reveal / always-visible on tablet)** | Unambiguous drag vs. click; keyboard-natural; `@dnd-kit` idiomatic |
| Keyboard DnD alternative | **"Move to column" button menu on keyboard focus** | WCAG SC 2.1.1 mandatory; activates via Enter on focused card; a dropdown-style chooser lists the three columns |
| Real-time update feedback | **Brief background highlight on changed card** | Unobtrusive; uses existing tokens; no toast storm; works with optimistic echo de-dup |

---

## Detailed Design Specifications

### Spec 1: Dialog Primitive

A reusable `<Dialog>` component used for Create Board and Edit Card.

**Layout**:
```
┌─────────────────────────────────────────────┐
│  [title]                             [×]    │ ← header: h2 + close button
│  ─────────────────────────────────────────  │
│  [form content — BoardForm or CardForm]     │
│                                             │
│  ─────────────────────────────────────────  │
│  [secondary: Cancel]   [primary: Submit]   │ ← actions row, right-aligned
└─────────────────────────────────────────────┘
```

**Behavior**:
- Opens programmatically via `open` prop (or native `<dialog>` element with `showModal()`)
- Focus moves to first interactive input on open (explicit `useEffect` + `ref.focus()`)
- Focus trap: Tab and Shift+Tab cycle only within the dialog; focus never escapes to the dimmed board behind
- Escape key closes without submitting (AC-NAV-1)
- Close `×` button (`aria-label="Close dialog"`) in the header also closes without submitting
- On close, focus returns to the element that triggered the dialog opening (trigger ref pattern)
- Backdrop: `rgba(0,0,0,0.4)` overlay using the native `<dialog>::backdrop` CSS pseudo-element
- Animation: CSS `opacity` + `transform: scale(0.97 → 1)` on open, reverse on close (`200ms ease`)
- `role="dialog"`, `aria-modal="true"`, `aria-labelledby` pointing to the dialog title `<h2>`

**Token usage**:
```
background:   var(--color-surface)
border:       1px solid var(--color-border)
border-radius: var(--radius-lg)
box-shadow:   var(--shadow-card-hover)
padding:      var(--space-6)
```

**Component structure**:
```
client/src/components/Dialog/
├── Dialog.tsx           ← generic primitive (open prop, title prop, onClose callback, children)
├── Dialog.module.css
└── Dialog.test.tsx
```

**Implementation note**: Use the native HTML `<dialog>` element where possible (Chrome 122+, Firefox 98+, Safari 15.4+ — all within our browser support range). This gives `::backdrop`, `showModal()` / `close()`, and native Escape handling at zero JS cost. Polyfill via `dialog.showModal()` graceful degradation if needed.

---

### Spec 2: Create Board Form (Modal)

**Location**: `BoardListPage.tsx` — a "New Board" button in the page header area, positioned after the `<h1>Boards</h1>`.

**Updated Board List Page wireframe**:
```
┌─────────────────────────────────────────────────────────────┐
│  BanyanBoard                                                 │
├─────────────────────────────────────────────────────────────┤
│  [main]                                                      │
│                                                              │
│  h1: Boards                           [+ New Board]         │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Alpha Project                              (→ link) │   │
│  ...
```

The "New Board" button (`<button type="button">`) is positioned to the right of the `<h1>` using a `display: flex; justify-content: space-between; align-items: center` header row. It opens the Create Board dialog.

**Form fields**:
- `Name` (required): `<input type="text" id="boardName" required aria-required="true">` with `<label for="boardName">Board name *</label>`
- `Description` (optional): `<textarea id="boardDescription">` with `<label for="boardDescription">Description (optional)</label>`

**Validation**:
- Client-side: on submit attempt, if `name.trim() === ''`, do NOT call the API; instead render an inline error beneath the name field (AC-ERROR-1):
  ```html
  <span id="boardName-error" role="alert" aria-live="assertive" class={styles.fieldError}>
    Board name is required
  </span>
  ```
  The input gets `aria-describedby="boardName-error"` and `aria-invalid="true"`.
- Server-side error: if `createBoard()` rejects, render the error below the form actions using the same `ErrorCopy` pattern (keyed on `ApiErrorCategory`). Form input is preserved (AC-ERROR-3).

**Loading state** (AC-LOADING-1): While the `createBoard()` call is in flight, the Submit button shows a spinner-in-button state and is `disabled`. The cancel button remains enabled.

**Cancel** (AC-NAV-1): Both the Cancel button and the close `×` button call `dialog.close()` → no API call → form resets → focus returns to "New Board" trigger button.

**AC mapping**: AC-ENTRY-1, AC-HAPPY-1, AC-ERROR-1, AC-ERROR-3, AC-LOADING-1, AC-NAV-1.

**Component structure**:
```
client/src/components/BoardForm/
├── BoardForm.tsx       ← form content component (works in Dialog context or standalone)
├── BoardForm.module.css
└── BoardForm.test.tsx
```

---

### Spec 3: Edit Board Form (Inline)

**Location**: `BoardViewPage.tsx` — an edit icon button next to the board name `<h1>` that switches the heading into an edit-in-place form.

**Updated Board View wireframe (edit mode)**:
```
← Back to boards

┌────────────────────────────────────────────────────────┐
│  [input: "Alpha Project v2"      ] [✓ Save] [✗ Cancel] │  ← replaces h1 in edit mode
└────────────────────────────────────────────────────────┘
[inline description input, optional, only shown if editing description]
[error message if submit fails]

┌──────────────────┬──────────────────┬──────────────────┐
│ TO DO            │ IN PROGRESS      │ DONE             │
...
```

**Normal (view) mode**:
```
h1: Alpha Project   [✎ edit icon button, aria-label="Edit board name"]
```

The edit icon button (`✎`, `aria-label="Edit board name"`) is positioned immediately after the `<h1>` text, using `display: inline-flex` alignment. On activation:
1. The `<h1>` is replaced with a focused `<input type="text">` pre-filled with the current board name.
2. The edit icon button disappears; two action buttons appear: a Save button (or Enter key) and a Cancel button (or Escape key).

**Inline form structure**:
```html
<div role="form" aria-label="Edit board name" class={styles.editBoardForm}>
  <input
    type="text"
    aria-label="Board name"
    aria-required="true"
    value={editName}
    onKeyDown={handleKeyDown}  ← Enter = save; Escape = cancel
    ref={editInputRef}          ← focused on activation
  />
  <button type="button" aria-label="Save board name">✓</button>
  <button type="button" aria-label="Cancel edit">✗</button>
</div>
```

**Validation**: Same inline `role="alert"` error as the create form for empty name. Server-side errors render below the input row.

**Loading state**: Save button disabled + spinner during PATCH.

**Cancel**: Escape key or Cancel button resets to the current saved name; no API call; focus returns to the edit icon button.

**AC mapping**: AC-HAPPY-2, AC-ERROR-3 (board), AC-LOADING-1 (board), AC-NAV-1 (board).

---

### Spec 4: Create Card Form (Inline within Column)

**Location**: `Column.tsx` — a persistent "Add card" button at the bottom of each column's card list area. Activating it expands an inline form within the column.

**Updated Column wireframe**:
```
┌───────────────────────────────────┐
│  IN PROGRESS           2          │
│  ─────────────────────────────    │
│  ┌────────────────────────────┐   │
│  │ Card A                     │   │
│  └────────────────────────────┘   │
│  ┌────────────────────────────┐   │
│  │ Card B                     │   │
│  └────────────────────────────┘   │
│                                   │
│  [+ Add card]                     │  ← always visible; compact button
└───────────────────────────────────┘
```

When activated:
```
┌───────────────────────────────────┐
│  IN PROGRESS           2          │
│  ─────────────────────────────    │
│  ┌────────────────────────────┐   │
│  │ Card A                     │   │
│  └────────────────────────────┘   │
│  ┌────────────────────────────┐   │
│  │ Card B                     │   │
│  └────────────────────────────┘   │
│  ┌────────────────────────────┐   │
│  │ ┌──────────────────────┐   │   │ ← inline form card
│  │ │ Card title...        │   │   │
│  │ └──────────────────────┘   │   │
│  │ [error if blank]           │   │
│  │ [Add Card]   [Cancel]      │   │
│  └────────────────────────────┘   │
└───────────────────────────────────┘
```

**"Add card" button**: `<button type="button" aria-label="Add card to {label} column">+ Add card</button>`, always visible at column bottom. On activation, the button is replaced by the inline form; the form receives focus on `titleInput`.

**Form structure**:
```html
<div role="form" aria-label="Add card to {columnLabel}" class={styles.addCardForm}>
  <input
    type="text"
    aria-label="Card title"
    aria-required="true"
    placeholder="Card title..."
    ref={titleInputRef}     ← focused on form open
    onKeyDown={handleKeyDown}  ← Enter = submit; Escape = cancel
  />
  <span id="cardTitle-error" role="alert" aria-live="assertive" class={styles.fieldError} />
  <div class={styles.formActions}>
    <button type="button" disabled={isSubmitting}>Add Card</button>
    <button type="button" onClick={handleCancel}>Cancel</button>
  </div>
</div>
```

Note: **no description field** in the create-card inline form — descriptions are added/edited via the edit-card modal. This keeps the inline form lightweight (a single line of text entry). This is consistent with Trello's and Linear's create-card patterns.

**Status**: The form's column determines the card status automatically — it is NOT shown as a user-editable field on the inline form (pre-scoped to column status, per AC-HAPPY-3).

**Validation**: Empty title → inline `role="alert"` error (`"Card title is required"`); no API call (AC-ERROR-2).

**Loading state**: "Add Card" button disabled during POST; spinner-in-button.

**Cancel**: Cancel button or Escape collapses the form; "Add card" button reappears; focus returns to "Add card" button (AC-NAV-1).

**Multiple columns**: Each `Column` manages its own `isAdding` boolean state independently — opening add-card in one column does not affect others.

**AC mapping**: AC-ENTRY-2, AC-HAPPY-3, AC-ERROR-2, AC-ERROR-3 (card), AC-LOADING-1 (card), AC-NAV-1 (card).

---

### Spec 5: Edit Card Form (Modal)

**Location**: `CardItem.tsx` — clicking the card's title/body (or activating an edit button that appears on hover/focus) opens the Edit Card dialog.

**Card hover state** (using `--color-surface-hover`):
```
┌─────────────────────────────────────┐
│  Fix login redirect bug    [✎ edit] │ ← edit button appears on :hover/:focus-within
│  POST /login should redirect…       │   background shifts to --color-surface-hover
└─────────────────────────────────────┘
```

The edit button (`<button type="button" aria-label="Edit card: Fix login redirect bug">✎</button>`) is a visually hidden button that becomes visible on `CardItem:hover` and `CardItem:focus-within` via CSS. Clicking the card body (outside the drag handle and edit button) also opens the modal.

**Edit Card Dialog**:
```
┌─────────────────────────────────────────────┐
│  Edit Card                           [×]    │
│  ─────────────────────────────────────────  │
│  Title *                                    │
│  ┌───────────────────────────────────────┐  │
│  │ Fix login redirect bug               │  │
│  └───────────────────────────────────────┘  │
│  [error: "Card title is required"]           │
│                                             │
│  Description                                │
│  ┌───────────────────────────────────────┐  │
│  │ POST /login should redirect to       │  │
│  │ dashboard after success              │  │
│  └───────────────────────────────────────┘  │
│  [server error if submit fails]             │
│                                             │
│  ─────────────────────────────────────────  │
│         [Cancel]      [Save Changes]        │
└─────────────────────────────────────────────┘
```

**Form pre-population**: `BoardForm`/`CardForm` receives `initialValues` prop with the card's existing `title` and `description`.

**Submit**: calls `updateCard({ title, description })`; on success, the dialog closes and the `CardItem` in the column updates in place (optimistic or server-confirmed per Architecture creative). Focus returns to the edit button on the card.

**Cancel**: Escape or Cancel button → dialog closes; no API call; form fields reset to `initialValues`; focus returns to edit button.

**AC mapping**: AC-HAPPY-4, AC-ERROR-2, AC-ERROR-3 (card), AC-LOADING-1 (card), AC-NAV-1 (card).

**Component structure**:
```
client/src/components/CardForm/
├── CardForm.tsx        ← form content (title + description fields, validation, error)
├── CardForm.module.css
└── CardForm.test.tsx
```

---

### Spec 6: Drag-and-Drop Affordances

**Drag handle**: A `<button type="button" aria-label="Reorder card" className={styles.dragHandle}>` element rendered as the first child of `CardItem`. Uses a CSS grid icon (`⠿`) or equivalent 2×3 dot grid SVG.

- CSS: `display: none` by default; `CardItem:hover .dragHandle, CardItem:focus-within .dragHandle { display: flex }`. On tablets (`@media (pointer: coarse) { .dragHandle { display: flex; opacity: 0.4 } }`).
- The `<button>` is the `@dnd-kit` drag initiation point via the `useDraggable` `setActivatorNodeRef`.

**Updated CardItem wireframe**:
```
┌──────────────────────────────────────────────┐
│  [⠿]  Fix login redirect bug         [✎]   │  ← handle left, edit right
│        POST /login should redirect…         │
└──────────────────────────────────────────────┘
```

**Ghost/overlay during drag** (`@dnd-kit` `DragOverlay`):
- The ghost card (rendered in `DragOverlay`) mirrors the card dimensions and content but applies:
  - `opacity: 0.85`
  - `box-shadow: var(--shadow-card-hover)` (elevated)
  - `transform: rotate(1.5deg)` (slight tilt — common DnD visual cue)
  - `cursor: grabbing`
- The source card in its origin column shows a placeholder: the card `<article>` renders with `opacity: 0.3` and `background: var(--color-surface-hover)` while dragging (`isDragging` flag from `useDraggable`).

**Drop zone highlighting**:
- When a card is dragged over a `Column` (target `useDroppable`), the column container gets a CSS class that adds:
  - `background-color: var(--color-col-todo-bg)` / `--color-col-progress-bg` / `--color-col-done-bg` with slightly increased saturation (or a `box-shadow: inset 0 0 0 2px var(--color-accent)` border effect)
  - This uses existing column tint tokens — no new colors needed

**Keyboard DnD alternative** (WCAG 2.1 SC 2.1.1 — mandatory):

`@dnd-kit` has a built-in keyboard sensor that allows:
- `Space` on the drag handle to "pick up" the card
- Arrow keys to move between droppable containers
- `Space` again to drop in the new column
- `Escape` to cancel

However, the `@dnd-kit` keyboard sensor requires the drag handle `<button>` to be focusable and to have the sensor attached — which is already the case in our design (the drag handle IS the `@dnd-kit` activator node).

Additionally, for discoverability (keyboard users may not know about the `@dnd-kit` Space/Arrow pattern), a secondary explicit keyboard alternative is provided: a "Move to column" popover that appears when the card edit-icon button or the drag handle is activated via keyboard `m` shortcut or via a small "Move" button inside the card hover toolbar.

**"Move to column" button (secondary keyboard path)**:
- On card focus (keyboard navigation), the hover toolbar is visible (`:focus-within`)
- The toolbar shows three controls: `[⠿ drag handle]` `[✎ edit]` `[⤢ Move]`
- Activating `[⤢ Move]` opens a small popover with three radio-button-style options:
  ```
  Move to:
  ○ To Do
  ● In Progress  ← current column (current marker)
  ○ Done
  [Move]   [Cancel]
  ```
- The popover uses `role="dialog"` with a small overlay (or a `popover` API element). On selection + Move, calls `updateCardStatus(cardId, newStatus)` via the same API path as DnD drop. Rollback on failure follows the same pattern (AC-ERROR-4).

**Focus management for drag**:
- After a successful keyboard DnD drop (Space to drop), focus returns to the drag handle in its new column
- After using "Move to column" dialog, focus returns to the "Move" button (which is now in the new column)
- After a failed drop (rollback), focus returns to the drag handle in the original column

**AC mapping**: AC-HAPPY-5, AC-ERROR-4, WCAG 2.1 SC 2.1.1.

---

### Spec 7: Real-Time Highlight

When the subscription hook applies a remote `card:updated`, `card:created`, or `card:moved` event to local state:

1. The event is de-duped against the current user's pending mutations (Architecture creative — echo de-dup). If the event matches a pending mutation from THIS tab, it is suppressed (no highlight).
2. For events from remote users, the new/updated card renders with a CSS animation class.

**CSS implementation** (CSS Modules):
```css
/* CardItem.module.css */
.recentlyUpdated {
  animation: highlightFade 600ms ease-out forwards;
}

@keyframes highlightFade {
  0%   { background-color: var(--color-surface-hover); }  /* #F1F3F5 */
  100% { background-color: var(--color-surface); }        /* #FFFFFF */
}

@media (prefers-reduced-motion: reduce) {
  .recentlyUpdated {
    animation: none;
    /* Still apply a non-animated background change so feedback exists without motion */
    background-color: var(--color-surface-hover);
    transition: background-color 0s;
  }
}
```

**React integration**: `BoardViewPage` (or the `KanbanBoard` component that owns card state) tracks a `Set<string>` of recently-updated card IDs. After 650 ms (slightly longer than the animation), the card ID is removed from the set. `CardItem` receives a `recentlyUpdated?: boolean` prop that applies `styles.recentlyUpdated` when true.

**Board name update**: When a `board:updated` event arrives, the board name heading updates in place — no animation needed (the heading changing is visually obvious).

**AC mapping**: AC-REALTIME-1, AC-REALTIME-2.

---

## Layout and Responsive Behavior

### Responsive Behavior

| Breakpoint | Changes |
|------------|---------|
| > 1024 px | Full layout: board list max-width 720px centered; board view max-width 1280px; all three columns side-by-side |
| 768–1024 px (tablet) | Board view columns maintain min 260px in overflow-x scroll container (existing FEAT-006 behavior unchanged). Dialog max-width: min(480px, calc(100vw - 32px)). Drag handles always-visible (pointer: coarse). |
| < 640 px | Board list: single column (unchanged). Board view: horizontal scroll (unchanged). Mobile is explicitly out of scope — no new optimizations. |

### Key New Components

| Component | Purpose | Key Behavior |
|-----------|---------|--------------|
| `Dialog` | Reusable modal primitive | `<dialog>` element, focus trap, `showModal()`/`close()`, Escape, backdrop |
| `BoardForm` | Create/edit board form content | Name + description fields, validation, error display; used inside `Dialog` (create) and inline (edit board) |
| `CardForm` | Create/edit card form content | Title + description fields; used inside `Dialog` (edit card) and inline (create card in column) |
| `DragHandle` | Card drag affordance | `<button>` with grip icon; `@dnd-kit` activator node; hover-reveal / always-visible on tablet |
| `MoveCardDialog` | Keyboard DnD alternative | Small `role="dialog"` with three column options; calls `updateCardStatus` |

### Interactions Summary

| Trigger | Action | Feedback |
|---------|--------|----------|
| Click "New Board" button | Open create-board Dialog | Dialog animates in; focus → board name input |
| Submit create-board form (empty name) | Client validation fires; no API call | Inline `role="alert"` error below name field |
| Submit create-board form (valid) | `createBoard()` call | Submit disabled + spinner; on success: dialog closes, board appears in list |
| Escape / Cancel in any form | Form closes without API call | Focus returns to trigger element |
| Click edit icon next to `h1` | Inline edit form replaces `h1` | Input focused, pre-filled with current name |
| Click "Add card" in column | Inline form expands at column bottom | Title input focused |
| Submit create-card (empty title) | Client validation; no API call | Inline `role="alert"` error |
| Click card body / edit icon | Open edit-card Dialog, pre-filled | Dialog in; focus → title input |
| Drag handle pointer down + drag | DnD gesture begins | Ghost overlay + source placeholder + column highlight on over |
| Drop into target column | `updateCardStatus()` called | Optimistic move; rollback + inline error on failure |
| Space on drag handle (keyboard) | `@dnd-kit` keyboard sensor activates | Screen reader announces "Dragging [card title]" |
| Activate "Move" button | Open MoveCardDialog | Small popover with column choices |
| Remote card event arrives | Subscription hook updates state | Brief background highlight fade on changed card |

---

## Accessibility Requirements

- [x] **Keyboard navigation**: All new affordances reachable via Tab — "New Board" button in list header, "Add card" column footer button, drag handle and edit/move buttons on card hover toolbar
- [x] **Focus trap in modals**: `<Dialog>` primitive traps Tab/Shift+Tab within the dialog; Escape closes
- [x] **Focus return on close**: Dialog and inline forms return focus to the element that opened them (trigger ref pattern)
- [x] **Focus management on inline edit**: Edit board inline form focuses the name input on activation; Cancel returns focus to edit icon button
- [x] **Screen reader compatibility**: `role="dialog"` + `aria-modal="true"` + `aria-labelledby` on Dialog; `role="form"` + `aria-label` on inline forms; `role="alert"` + `aria-live="assertive"` on validation errors
- [x] **Color contrast compliance**: All new colors reuse existing verified tokens; no new color values introduced
- [x] **Focus indicators visible**: All new buttons use `box-shadow: var(--focus-ring)` on `:focus-visible`; never `outline: none` without replacement
- [x] **Error messages accessible**: Inline validation errors use `role="alert"` + `aria-live="assertive"`; `aria-invalid="true"` + `aria-describedby` on invalid inputs
- [x] **Keyboard alternative for DnD**: `@dnd-kit` keyboard sensor on drag handle button + explicit "Move to column" dialog (WCAG SC 2.1.1)
- [x] **Reduced motion**: `@media (prefers-reduced-motion: reduce)` removes keyframe animation from real-time highlight; non-animated fallback still applies the background change
- [x] **Loading state accessible**: Submit buttons use `aria-disabled="true"` and show an inline spinner while the request is in flight; no ARIA trick that hides the button

---

## Implementation Guidelines

### For Developers

1. **Native `<dialog>` element**: Use HTML5 `<dialog>` with `dialog.showModal()` / `dialog.close()`. This gives `::backdrop`, Escape handling, and accessibility semantics at zero cost. Wrap in a React `Dialog` component that manages the `open` prop via a `useEffect` calling the native methods.

2. **Focus trap via `@dnd-kit`'s built-in a11y or a lean custom hook**: The native `<dialog>` element's `showModal()` already traps focus. Do NOT manually implement focus trapping for modals — rely on the native element. For the "Move to column" popover (if not using `<dialog>`), use the `focus-trap-react` pattern or the Radix `FocusTrap` if available; otherwise implement manually with Tab/Shift+Tab event handlers.

3. **Form state pattern**: Each form (BoardForm, CardForm) uses local React state: `{ status: 'idle' | 'submitting' | 'error', errorCategory: ApiErrorCategory | null }`. On submit: transition to `submitting`, call the API method, on success: call the parent `onSuccess(result)` callback (closes Dialog / collapses inline), on failure: transition to `error` with `errorCategory`. This matches the existing page-level state machine pattern.

4. **`errorCopy.ts` extension**: Extend `errorCopy.ts` with write operation copy functions (consistent with the read-path pattern established in FEAT-006):
   ```typescript
   // Write operation errors (AC-ERROR-3)
   export function writeErrorCopy(category: ApiErrorCategory): ErrorCopy
   // Validation errors (AC-ERROR-1, AC-ERROR-2)  
   export const VALIDATION_COPY = {
     boardNameRequired: 'Board name is required',
     cardTitleRequired: 'Card title is required',
   } as const
   // DnD failure (AC-ERROR-4)
   export function dndErrorCopy(category: ApiErrorCategory): ErrorCopy
   ```

5. **Drag handle `@dnd-kit` integration**: In `CardItem`, call `useDraggable({ id: card.id })` to get `{ attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging }`. Attach `setNodeRef` to the `<article>` and `setActivatorNodeRef` / `{ ...attributes, ...listeners }` to the drag handle `<button>`. The `isDragging` flag drives the source placeholder styling.

6. **`DragOverlay` in `KanbanBoard`**: Render a `<DragOverlay>` as a sibling to the `<DndContext>` provider. It receives the currently-dragged card and renders a `<CardItem>` clone with the ghost styling class (`styles.ghost`). This prevents the ghost from being clipped by column `overflow`.

7. **Column drop zone**: In `Column`, call `useDroppable({ id: columnStatus })`. The `isOver` flag from `useDroppable` drives the column highlight class.

8. **Real-time highlight state**: In `BoardViewPage` (or a `useRealtimeBoard` hook), maintain `highlightedCardIds: Set<string>`. When a `card:updated`/`card:created` event arrives from the subscription (after echo de-dup), add the `card.id` to the set, call `setState`, and schedule `setTimeout(() => removeFromSet(card.id), 650)`.

9. **Optimistic update interaction**: Per the Architecture creative decision, DnD uses an optimistic move. The real-time subscription hook MUST de-duplicate events that originate from the current tab (e.g., compare event `mutationId` with a locally-generated one on PATCH). Without this, moving a card triggers: (a) optimistic UI update → (b) PATCH to server → (c) server broadcasts event → (d) hook applies event → card re-renders with highlight = double update. The de-dup prevents step (d) from double-applying.

### Component Structure (new and extended)

```
client/src/
├── components/
│   ├── Dialog/
│   │   ├── Dialog.tsx
│   │   ├── Dialog.module.css
│   │   └── Dialog.test.tsx
│   ├── BoardForm/
│   │   ├── BoardForm.tsx          ← name + description fields; used in Dialog (create) and inline (edit board)
│   │   ├── BoardForm.module.css
│   │   └── BoardForm.test.tsx
│   ├── CardForm/
│   │   ├── CardForm.tsx           ← title + description fields; used in Dialog (edit card) and inline (create card)
│   │   ├── CardForm.module.css
│   │   └── CardForm.test.tsx
│   ├── MoveCardDialog/
│   │   ├── MoveCardDialog.tsx     ← keyboard DnD alternative; WCAG SC 2.1.1
│   │   ├── MoveCardDialog.module.css
│   │   └── MoveCardDialog.test.tsx
│   ├── Column/
│   │   ├── Column.tsx             ← extended: add-card affordance + @dnd-kit useDroppable
│   │   ├── Column.module.css      ← extended: isOver highlight, add-card form styles
│   │   └── Column.test.tsx        ← extended: AC-ENTRY-2 tests
│   └── CardItem/
│       ├── CardItem.tsx           ← extended: drag handle + edit/move buttons + recentlyUpdated prop
│       ├── CardItem.module.css    ← extended: handle reveal, hover toolbar, ghost, highlight animation
│       └── CardItem.test.tsx      ← extended: drag affordance, edit affordance tests
├── pages/
│   ├── BoardListPage.tsx          ← extended: "New Board" button + create-board Dialog state
│   ├── BoardListPage.module.css   ← extended: page header flex row
│   ├── BoardViewPage.tsx          ← extended: edit-board inline + DndContext + real-time hook integration
│   └── BoardViewPage.module.css   ← extended: edit-board inline form styles
└── api/
    └── errorCopy.ts               ← extended: writeErrorCopy, dndErrorCopy, VALIDATION_COPY
```

### New Tokens Required

The following CSS Custom Properties should be added to `tokens.css` to support the new interactive states. All values are consistent with the existing neutral developer palette:

```css
:root {
  /* DnD ghost and drag states */
  --color-dragging-placeholder: var(--color-surface-hover);  /* source card while dragging */
  --color-drop-target:          var(--color-accent);          /* column drop-target ring */

  /* Form field error */
  --color-field-error-text: var(--color-error-text);   /* reuses existing error token */
  --color-field-error-bg:   var(--color-error-bg);     /* reuses existing error token */

  /* Submit button pending state */
  --color-btn-primary-disabled: #7aa3f9;   /* muted blue; contrast on surface: check below */

  /* Overlay backdrop (for Dialog) */
  --color-overlay: rgba(0, 0, 0, 0.4);

  /* Drag ghost rotation and shadow — not a CSS var but noted for implementation */
}
```

**WCAG contrast note on `--color-btn-primary-disabled`**: `#7aa3f9` (disabled blue) on `#FFFFFF` surface = 2.9:1. This is intentionally below 4.5:1 — WCAG explicitly exempts disabled UI components from contrast requirements (SC 1.4.3 exception: "inactive user interface components... have no contrast requirement"). The button is `disabled` / `aria-disabled="true"`, so this is compliant.

---

## AC Traceability Matrix

| Acceptance Criterion | Design Decision | Component(s) |
|----------------------|-----------------|--------------|
| AC-ENTRY-1 (create board visible, keyboard-reachable) | "New Board" button in BoardListPage header row | `BoardListPage`, new button |
| AC-ENTRY-2 (add card in each column, keyboard-reachable) | "Add card" footer button always visible in Column | `Column` — add-card affordance |
| AC-HAPPY-1 (create board end-to-end) | Modal dialog with `BoardForm` | `Dialog`, `BoardForm`, `BoardListPage` |
| AC-HAPPY-2 (edit board name) | Inline form replacing h1 | `BoardViewPage`, `BoardForm` (inline) |
| AC-HAPPY-3 (create card in specific column) | Inline form in `Column` footer; status pre-scoped to column | `Column`, `CardForm` (inline) |
| AC-HAPPY-4 (edit card title/description) | Modal dialog with `CardForm` pre-filled | `CardItem` (edit trigger), `Dialog`, `CardForm` |
| AC-HAPPY-5 (drag card between columns) | `@dnd-kit` drag handle + `DragOverlay` + `useDroppable` in Column | `CardItem`, `Column`, `KanbanBoard` |
| AC-REALTIME-1/2 (remote updates visible) | Real-time highlight flash on changed cards | `CardItem` (`recentlyUpdated` prop), `useRealtimeBoard` hook |
| AC-ERROR-1 (board name required validation) | Inline `role="alert"` error in `BoardForm` | `BoardForm` |
| AC-ERROR-2 (card title required validation) | Inline `role="alert"` error in `CardForm` | `CardForm` |
| AC-ERROR-3 (server error preserves input) | `status: 'error'` state in form; input preserved in React state | `BoardForm`, `CardForm` |
| AC-ERROR-4 (DnD failure rollback) | Optimistic move + rollback to origin; inline error banner | `KanbanBoard` / `BoardViewPage` DnD state |
| AC-LOADING-1 (pending state on writes) | Submit button `disabled` + spinner during in-flight request | `BoardForm`, `CardForm` (shared pattern) |
| AC-NAV-1 (cancel closes without API call) | Cancel button + Escape handler in Dialog and inline forms | `Dialog`, `BoardForm`, `CardForm`, `Column` inline form |
| WCAG 2.1 SC 2.1.1 (keyboard DnD alternative) | `@dnd-kit` keyboard sensor on drag handle + `MoveCardDialog` | `CardItem` (drag handle), `MoveCardDialog` |

---

## Dependency Notes (Architecture Creative Phase)

The following UI/UX decisions are coupled to Architecture creative phase decisions:

1. **Optimistic update echo de-dup**: The real-time highlight (Spec 7) depends on the subscription hook NOT applying the current user's own mutations as remote events. The Architecture phase must define the de-dup mechanism (mutation ID, tab ID, etc.) — this UI/UX doc assumes it exists and is consumed by `useRealtimeBoard`.

2. **`card:updated` / `card:created` / `board:updated` event schema**: Spec 7 assumes specific event type strings. The Architecture creative phase defines the actual event schema — the implementation must use the names from that decision. Placeholder names used here should be replaced with the canonical event names from the Architecture doc.

3. **Optimistic DnD vs. server-confirmed**: Spec 6 assumes an optimistic move with rollback on failure (AC-ERROR-4). If the Architecture phase chose server-confirmed instead, the "card muted/pending during PATCH" state (AC-LOADING-1) applies to the dragged card: the card renders with `opacity: 0.6` until the PATCH resolves. The form-based pending state (submit button disabled) is identical in both strategies.

4. **DnD library: `@dnd-kit/core` + `@dnd-kit/sortable`**: Confirmed by Architecture creative. The specific `useDraggable` / `useDroppable` / `DragOverlay` / `DndContext` APIs used throughout Spec 6 are from `@dnd-kit/core`.

---

## Validation Checklist

- [x] Meets all user goals: create/edit board and card forms designed; DnD affordances specified; real-time feedback pattern defined
- [x] Accessible per requirements: focus trap in modals; keyboard DnD alternative (WCAG SC 2.1.1); `role="alert"` validation errors; `aria-invalid` + `aria-describedby` on error inputs; focus return on close; `prefers-reduced-motion` honored
- [x] Consistent with FEAT-006 patterns: CSS Modules + tokens.css; no new styling framework; `ErrorMessage`/`errorCopy` pattern extended; state machine pattern (`idle|submitting|error`) matches page-level pattern; `role="alert"` error convention maintained
- [x] Respects Guiding Principles: GP4 (no new build deps — Dialog uses native `<dialog>`); GP5 (error copy keyed on `ApiErrorCategory` only, never raw server response); GP1 (no hardcoded config)
- [x] Responsive across devices: dialogs use `max-width: min(480px, calc(100vw - 32px))`; drag handles always-visible on tablet; inline forms constrained to column width
- [x] Performance acceptable: CSS-only animations; no new animation libraries; highlight uses a single `@keyframes` block; Dialog uses native `<dialog>` (no JS focus trap library)
- [x] Implementation feasible: all primitives (`Dialog`, `BoardForm`, `CardForm`) are standard React + CSS Modules; no new UI framework; `@dnd-kit` is the confirmed DnD library; native `<dialog>` is universally supported in target browsers
- [x] All ACs addressed: AC-ENTRY-1/2, AC-HAPPY-1–5, AC-REALTIME-1/2, AC-ERROR-1–4, AC-LOADING-1, AC-NAV-1, WCAG SC 2.1.1

---

## Next Steps

1. **Phase 2 (`/banyan-build`)**: Implement `Dialog`, `BoardForm`, create-board button in `BoardListPage`, edit-board inline form in `BoardViewPage`. Tests per Phase 2 test guidance (8–10 tests).
2. **Phase 3 (`/banyan-build`)**: Implement `CardForm`, add-card inline in `Column`, edit-card trigger + Dialog in `CardItem`. Tests per Phase 3 test guidance.
3. **Phase 4 (`/banyan-build`)**: Implement `@dnd-kit` wiring in `CardItem` (drag handle) and `Column` (drop zone), `DragOverlay` in `KanbanBoard`, `MoveCardDialog` keyboard alternative. Tests per Phase 4 guidance.
4. **Phase 5 (`/banyan-build`)**: Real-time hook (`useRealtimeBoard`) consuming the Architecture-chosen transport; integrate `recentlyUpdated` highlight in `CardItem`; wire echo de-dup from the Architecture decision.
5. Confirm event type string names from the Architecture creative doc before Phase 5 implementation.
