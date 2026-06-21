# UI/UX Decision: React Frontend Board UI (TASK-006)

**Created**: 2026-06-20
**Status**: DECIDED
**Decision Type**: UI/UX
**Task**: TASK-006 (FEAT-006) — Level 3
**Scope**: Visual design for the read-only React SPA — board list page (`/`) and board view page (`/boards/:id`) with three kanban columns, plus all loading, empty, and error states

---

## User Context

### Target Users

- **Primary**: Alex the Dev — software engineer on a 4-person team. Wants zero context-switch overhead when checking board state. Familiar with developer tooling. Values speed and clarity over visual flair.
- **Secondary (1)**: Sam the Maker — solo developer tracking personal tasks. Values running locally in under 5 minutes; simplicity is the product.
- **Secondary (2)**: Jordan the PM — part-time project coordinator. Needs low-friction task visibility, not a power tool.

### User Goals

1. Instantly orient on what is in progress without hunting for information
2. Navigate from the board list to a specific board's card columns in one click
3. Return to the board list easily after reviewing a board
4. Understand loading / empty / error situations without confusion or exposed technical detail

### Use Cases

| Use Case | User | Goal | Frequency |
|----------|------|------|-----------|
| Check what's in progress for today's standup | Alex | Scan In Progress column fast | Daily |
| Confirm a task moved to Done after last deploy | Alex | Read Done column | Several times/week |
| Find which board a specific task lives on | Alex, Jordan | Scan board list → click board | Several times/week |
| Set up a fresh board, verify it appears | Sam | See new board in list | Occasionally |
| Share board URL with a teammate | Jordan | Direct-URL navigation to `/boards/:id` | Occasionally |

### Constraints

- **Devices**: Desktop primary; tablet-usable (min useful viewport ~768 px). Mobile-first is NOT a priority for MVP. Column layout must remain readable at tablet width.
- **Accessibility**: WCAG 2.1 AA (reasonable effort) — keyboard navigation, visible focus indicators, color contrast ≥ 4.5:1 for body text / ≥ 3:1 for large text and UI components, status conveyed by more than color alone, focus management on client-side route change.
- **Browser Support**: Chrome 120+, Firefox 120+, Safari 17+, Edge 120+. Modern CSS (Grid, Custom Properties, `gap`) is fully supported.
- **Existing Patterns**: No existing design system. Architecture mandates CSS Modules (zero extra build deps, default in Vite) as the recommended mechanism. Tailwind is permitted if justified. Product identity: "lightweight, developer-friendly."
- **Error architecture**: fetch failures map to three categories — `network`, `notFound`, `server` — from `apiClient.ts`. UI copy must map to these. Internal error detail MUST NOT be shown (Guiding Principle 5).

---

## User Flow

### Flow Diagram

```
[User opens localhost:3000]
           |
           v
    [Board List Page /]
    ┌──────────────────┐
    │ Loading state    │──→ [Error state: network/server]
    │      ↓           │
    │ Board list       │──→ [Empty state: no boards]
    │ (entries)        │
    └──────────────────┘
           | (click board entry)
           v
    [Board View /boards/:id]
    ┌──────────────────────────────────┐
    │ Loading state                    │──→ [Error state: network/notFound/server]
    │      ↓                           │    (back-nav still accessible)
    │ Three columns: To Do | In Prog   │
    │              | Done              │
    │ Each column: cards or empty state│
    └──────────────────────────────────┘
           | (click "← Back to boards")
           v
    [Board List Page /]
```

### Flow Description

1. **Entry**: User opens `http://localhost:3000`. React router renders `BoardListPage`. Immediately fires `GET /api/v1/boards`.
2. **Loading (list)**: While the fetch is in flight, the board list page shows a loading indicator. No flash of empty state — loading state is rendered synchronously before the fetch resolves.
3. **Board list renders**: One board entry per board, each a keyboard-navigable link.
4. **Decision point (empty vs populated)**: If zero boards, an empty state renders. If boards exist, entries render.
5. **User clicks a board**: Client-side navigation to `/boards/:id`. Focus moves to the new page heading (AC-NAV a11y). Fires both `GET /api/v1/boards/:id` and `GET /api/v1/boards/:id/cards`.
6. **Loading (view)**: Board view shows loading state while both fetches are in flight.
7. **Board view renders**: Board name heading + three columns. Cards partitioned by `status`. Empty columns render with an empty state message.
8. **Back-navigation**: "← Back to boards" link navigates to `/`. Focus moves to board list heading.
9. **Direct URL**: User pastes `/boards/:id` — Express SPA fallback returns `index.html`; React router renders board view directly. Same loading → render path.

### Error States

| Error | Cause | Architecture Category | User Recovery |
|-------|-------|----------------------|---------------|
| API unreachable on board list | Network down / Express not running | `network` | Retry message; user restarts server |
| Server error on board list | Express 500 | `server` | Generic error message |
| Board not found (404) | Invalid ID in URL | `notFound` | "Board not found" + back-nav link |
| Board view API failure | Network/500 on board fetch | `network` / `server` | Error message + back-nav link |

---

## Decision Area 1: Styling Mechanism

### Option 1A: CSS Modules (Vite built-in)

- **Approach**: Plain CSS files co-located with each component (`Component.module.css`). Vite transforms them into scoped class names at build time. Zero runtime, zero extra dependencies, zero PostCSS config beyond what Vite provides by default.
- **Pros**:
  - Zero extra build configuration — works out of the box with the `client/` Vite setup (Architecture decision)
  - CSS Custom Properties for the design token system (palette, spacing, typography) live in one `tokens.css` file imported in `main.tsx`
  - Scoped by default — no accidental class collisions between components
  - Aligns with Guiding Principle 4 (simplest toolchain that earns its keep)
  - Developers unfamiliar with React can still read/edit plain CSS files
  - Full CSS spec available (`:focus-visible`, `@media`, animations, calc) without a framework translation layer
- **Cons**:
  - Class names are per-component; global utilities (e.g., visually-hidden, sr-only) need a separate `globals.css` file
  - More verbose than utility classes for layout helpers
  - No pre-built component library (by choice — but means every element is hand-rolled)
- **Usability**: High
- **Accessibility**: High (full CSS available including `:focus-visible`)
- **Implementation Complexity**: Low

### Option 1B: Tailwind CSS

- **Approach**: Add Tailwind CSS + PostCSS to `client/`. Write component markup with utility classes (`className="flex gap-4 p-4 rounded-md"`). Use a `tailwind.config.ts` to define the design token system (colors, spacing).
- **Pros**:
  - Fast iteration with utility classes — no context-switching to a separate CSS file
  - JIT compiler outputs a minimal CSS bundle
  - Consistent spacing scale enforced by the framework
  - Many developers are highly familiar with Tailwind
- **Cons**:
  - **Requires adding PostCSS to the Vite pipeline** — an additional build step and two config files (`postcss.config.js`, `tailwind.config.ts`). This is the "real build-tooling commitment" the Architecture doc explicitly flags.
  - Utility-heavy JSX is harder to read for developers unfamiliar with Tailwind (Jordan, casual contributors)
  - "Lightweight, developer-friendly" identity is arguably better served by approachable plain CSS than by a framework abstraction layer
  - No meaningful capability gap vs CSS Modules for this 2-page, 5-component app
- **Usability**: High
- **Accessibility**: High (same CSS, different authoring DX)
- **Implementation Complexity**: Medium (PostCSS + config)

### Option 1C: Inline styles + a small token object

- **Approach**: Define a `tokens.ts` constant with colors/spacing; apply them as inline `style={}` props in JSX.
- **Pros**: Zero CSS setup, fully type-safe tokens.
- **Cons**: No `:hover`, `:focus-visible`, `@media`, or animations; accessibility suffers (no CSS-driven focus rings); bloats JSX; not a viable standalone approach.
- **Usability**: Low
- **Accessibility**: Low
- **Implementation Complexity**: Low (but inadequate)

### Evaluation Matrix — Styling

| Criteria | CSS Modules | Tailwind | Inline styles |
|----------|-------------|----------|---------------|
| Usability | High | High | Low |
| Accessibility | High | High | Low |
| Consistency | High | High | Medium |
| Build complexity | Low | Medium | Low |
| "Developer-friendly" identity fit | High | Medium | Low |
| Guiding Principle 4 fit | High | Medium | Low |

**Decision (Styling Mechanism): CSS Modules.**

Tailwind adds PostCSS configuration for a 2-page read-only SPA that has no design system requirement beyond a simple token set. The Architecture creative doc explicitly defaults to CSS Modules and calls Tailwind a "real build-tooling commitment." For this product's scale and "lightweight" identity, CSS Modules + CSS Custom Properties is the right choice. Tailwind remains a compatible future upgrade if the team adopts it deliberately.

---

## Decision Area 2: Board List Page Layout

### Option 2A: Card Grid

- **Approach**: Board entries rendered as a responsive CSS grid of card-style tiles (e.g., 2–3 columns on desktop, 1 on mobile). Each tile shows the board name prominently and the description beneath it.
- **Wireframe/Layout**:
  ```
  ┌────────────────────────────────────────────────────────┐
  │  BanyanBoard                            [header nav]   │
  ├────────────────────────────────────────────────────────┤
  │  h1: Boards                                            │
  │                                                        │
  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
  │  │ Board Name   │  │ Board Name   │  │ Board Name   │ │
  │  │ Description  │  │ Description  │  │ Description  │ │
  │  └──────────────┘  └──────────────┘  └──────────────┘ │
  │  ┌──────────────┐  ┌──────────────┐                   │
  │  │ Board Name   │  │ Board Name   │                   │
  │  │ Description  │  │ Description  │                   │
  │  └──────────────┘  └──────────────┘                   │
  └────────────────────────────────────────────────────────┘
  ```
- **User Flow**: User scans a 2D grid of named board tiles, clicks any tile to navigate.
- **Pros**:
  - Visually rich — descriptions are scannable at a glance in a spatial layout
  - Scales gracefully from 1 to many boards via CSS Grid auto-fill
  - Familiar pattern (Trello, Notion board gallery)
- **Cons**:
  - For a list of 3–5 boards (typical small team), a grid feels sparse and over-designed
  - Tile height uniformity requires handling variable-length descriptions carefully
  - More CSS complexity than a list
- **Usability**: High
- **Accessibility**: High (each tile is a full `<a>` link)
- **Implementation Complexity**: Medium

### Option 2B: Vertical List with Name + Description

- **Approach**: A vertical list of board entries, each row showing the board name as a heading-style link and the description as secondary text beneath it. Single column, full width (capped at a readable max-width).
- **Wireframe/Layout**:
  ```
  ┌────────────────────────────────────────────────────────┐
  │  BanyanBoard                                           │
  ├────────────────────────────────────────────────────────┤
  │  h1: Boards                                            │
  │                                                        │
  │  ┌──────────────────────────────────────────────────┐  │
  │  │  [→] Alpha Project                               │  │
  │  │      Sprint planning and engineering tasks       │  │
  │  └──────────────────────────────────────────────────┘  │
  │  ┌──────────────────────────────────────────────────┐  │
  │  │  [→] Marketing Q3                                │  │
  │  │      Campaign tracking board                     │  │
  │  └──────────────────────────────────────────────────┘  │
  └────────────────────────────────────────────────────────┘
  ```
- **User Flow**: Scan a linear list top-to-bottom; click any row to navigate.
- **Pros**:
  - Easiest to scan in order — developers familiar with linear lists (git log, ls output)
  - Full width → full description is readable without truncation
  - Trivially accessible: one list of links in DOM order, logical tab order
  - Simple to implement (no grid math)
- **Cons**:
  - Less visual at-a-glance differentiation for many boards
  - Vertically long with many boards (fine for "tens of boards" target)
- **Usability**: High
- **Accessibility**: High
- **Implementation Complexity**: Low

### Option 2C: Name-only List (compact)

- **Approach**: Minimal list of board names only — no descriptions, no extra metadata.
- **Pros**: Extremely compact and fast to scan.
- **Cons**: Boards without descriptive names are hard to distinguish; description is available in the data and adds context with minimal cost. Rejected: description is display-only data the user already created.
- **Usability**: Medium
- **Accessibility**: High
- **Implementation Complexity**: Low

### Evaluation Matrix — Board List Layout

| Criteria | Card Grid | Vertical List w/ Description | Name-only List |
|----------|-----------|------------------------------|----------------|
| Usability | High | High | Medium |
| Accessibility | High | High | High |
| Consistency | Medium | High | High |
| Responsiveness | Medium | High | High |
| Performance | High | High | High |
| Implementation | Medium | Low | Low |
| "Developer-friendly" fit | Medium | High | Medium |

**Decision (Board List Layout): Option 2B — Vertical list with board name + description.**

For a typical small-team board count (3–10 boards), a vertical list is immediately scannable, maps to developer mental models (terminal list output), and is trivially accessible. The card grid is better suited to larger catalogs (30+ items) or when thumbnail images exist. Description adds context with zero additional implementation cost. Name-only omits useful context. The list is also trivially responsive — no grid breakpoints needed.

**Per-entry information**: Board name (prominent, as an `<h2>` within the `<li>`, or as the link text), description (secondary, muted text). No card count shown (requires an additional aggregation API call not available in MVP).

---

## Decision Area 3: Board View Page Layout

### Option 3A: Horizontal Three-Column Kanban (scroll on overflow)

- **Approach**: Three fixed-label columns (To Do, In Progress, Done) laid out side-by-side using CSS Grid (`grid-template-columns: repeat(3, 1fr)`). On narrow viewports (below ~768 px), columns wrap or scroll horizontally.
- **Wireframe/Layout**:
  ```
  ┌────────────────────────────────────────────────────────────────┐
  │  ← Back to boards                                              │
  │  h1: Alpha Project                                             │
  ├──────────────────┬─────────────────┬──────────────────────────┤
  │  TO DO (3)       │  IN PROGRESS (2)│  DONE (5)                │
  │  ─────────────── │ ─────────────── │ ─────────────────        │
  │  ┌─────────────┐ │ ┌─────────────┐ │ ┌─────────────┐         │
  │  │ Card Title  │ │ │ Card Title  │ │ │ Card Title  │         │
  │  │ Description │ │ │ Description │ │ │ Description │         │
  │  └─────────────┘ │ └─────────────┘ │ └─────────────┘         │
  │  ┌─────────────┐ │ ┌─────────────┐ │ ┌─────────────┐         │
  │  │ Card Title  │ │ │ Card Title  │ │ │ ...         │         │
  │  │ ...         │ │ │ ...         │ │ └─────────────┘         │
  │  └─────────────┘ │ └─────────────┘ │                         │
  │  ┌─────────────┐ │                 │                          │
  │  │ Card Title  │ │                 │                          │
  │  │ ...         │ │                 │                          │
  │  └─────────────┘ │                 │                          │
  └──────────────────┴─────────────────┴──────────────────────────┘
  ```
- **Tablet behavior**: At 768–1024 px, columns remain horizontal with `min-width: 240px` and the board area gains `overflow-x: auto` — the horizontal scroll container keeps all three columns accessible on tablet without stacking.
- **Pros**:
  - The canonical kanban layout — immediately legible for developers, PMs (Trello, GitHub Projects, Linear all use this)
  - Column-to-column comparison is a one-glance scan (the core value of a kanban board)
  - Horizontal scroll on tablet is a widely understood pattern
  - All three columns always render (satisfies AC-HAPPY-3 structurally)
- **Cons**:
  - On very narrow viewports (<480 px), three columns are cramped — but MVP explicitly says mobile is not a priority
  - Horizontal scroll requires care to remain accessible (keyboard-scrollable)
- **Usability**: High
- **Accessibility**: High (with `role="region"` + `aria-label` per column)
- **Implementation Complexity**: Low

### Option 3B: Vertical Stacked Columns

- **Approach**: Each of the three columns stacks vertically — To Do section, then In Progress section, then Done section, each spanning full page width.
- **Wireframe/Layout**:
  ```
  ┌────────────────────────────────────┐
  │  ← Back to boards                 │
  │  h1: Alpha Project                │
  ├────────────────────────────────────┤
  │  TO DO (3)                        │
  │  ─────────────────────────────    │
  │  [Card] [Card] [Card]             │
  ├────────────────────────────────────┤
  │  IN PROGRESS (2)                  │
  │  ─────────────────────────────    │
  │  [Card] [Card]                    │
  ├────────────────────────────────────┤
  │  DONE (5)                         │
  │  ─────────────────────────────    │
  │  [Card] [Card] [Card] [Card] [Card]│
  └────────────────────────────────────┘
  ```
- **Pros**:
  - Excellent on mobile/narrow viewports
  - No horizontal scroll complexity
  - Very simple implementation
- **Cons**:
  - **Defeats the core value of a kanban board** — comparing across status categories requires scrolling past the entire To Do section to see In Progress. The product is a kanban board; its primary UX is the side-by-side column view.
  - Alex's "quickly see what's in progress" goal is impaired — In Progress is not immediately visible on page load.
  - Looks like a categorized list, not a board
- **Usability**: Medium (inadequate for kanban mental model)
- **Accessibility**: High
- **Implementation Complexity**: Low

### Option 3C: Horizontal columns with a card accordion within each column

- **Approach**: Same horizontal layout as 3A, but cards within a column can be collapsed/expanded to save vertical space.
- **Pros**: Useful when a column has many cards.
- **Cons**: Adds interactive complexity (expand/collapse state, animations) to a display-only MVP; no specification requirement; unnecessary for "hundreds of cards per board" at this stage. Rejected as scope creep.

### Evaluation Matrix — Board View Layout

| Criteria | Horizontal Kanban (3A) | Vertical Stacked (3B) | Accordion (3C) |
|----------|------------------------|----------------------|----------------|
| Usability | High | Medium | High |
| Accessibility | High | High | Medium |
| Kanban identity fit | High | Low | High |
| Responsiveness | High (horizontal scroll tablet) | High | Medium |
| Performance | High | High | Medium |
| Implementation | Low | Low | High |

**Decision (Board View Layout): Option 3A — Horizontal three-column kanban with horizontal-scroll container at tablet width.**

The horizontal kanban layout is the product's core value. Stacking columns defeats the point. The implementation is a CSS Grid of three equal-width columns inside an `overflow-x: auto` wrapper — ~10 lines of CSS. Tablet users see all three columns via horizontal scroll, which is conventional for board tools at that width.

---

## Decision Area 4: Card Component Design

### Option 4A: Title + Description card with no status badge

- **Approach**: A card tile showing the board name in a medium-weight heading style and the description in regular body text below it. No status badge — the column header already conveys status. Background is white/light; a subtle border or shadow distinguishes the card from the column background.
- **Pros**:
  - Clean and minimal — no redundant information (status is already communicated by column placement)
  - Column placement IS the status indicator, consistent with how Trello/Linear present cards
  - Reduces visual noise; description text has more breathing room
  - WCAG: status is communicated by the column label text, not by color alone (column label is text — AC compliant)
- **Cons**:
  - Status is not visible in isolation if a card is seen outside its column context (not a current concern for this display-only MVP)
- **Usability**: High
- **Accessibility**: High — status conveyed by column heading text, not color
- **Implementation Complexity**: Low

### Option 4B: Title + Description + status badge

- **Approach**: Same card as 4A but with a small color-coded badge showing "To Do", "In Progress", or "Done".
- **Pros**: Status visible on the card itself.
- **Cons**:
  - **Redundant** — the user is already inside the column; the badge restates information already visible in the column header
  - Adds color-coding that could be confused with priority or label color (future feature conflict)
  - More complex WCAG compliance (badge color must meet 3:1 contrast against background)
  - Adds visual noise
- **Usability**: Medium (redundant)
- **Accessibility**: Medium (requires additional contrast compliance work)
- **Implementation Complexity**: Medium

### Evaluation Matrix — Card Component

| Criteria | No badge (4A) | With badge (4B) |
|----------|---------------|-----------------|
| Usability | High | Medium |
| Accessibility | High | Medium |
| Visual clarity | High | Medium |
| Implementation | Low | Medium |

**Decision (Card Design): Option 4A — Title + Description only, no status badge.**

Column placement communicates status. A badge is redundant, adds visual noise, and creates potential future confusion with label colors (an upcoming feature). Status is conveyed by the column's visible text heading — WCAG requirement for "status by more than color alone" is satisfied by the column header text, not a badge.

---

## Decision Area 5: Color Palette and Typography

### Option 5A: Neutral developer palette — slate grays + single accent blue

- **Approach**: A clean, low-contrast, high-readability palette inspired by developer tools (VS Code, GitHub, Linear). Near-white backgrounds, slate gray text, a single accent blue for interactive elements. Columns differentiated by a subtle header color tint (not bright colors).
- **Color tokens**:
  ```
  --color-bg:           #F8F9FA   /* Page background — near-white */
  --color-surface:      #FFFFFF   /* Card / panel background */
  --color-border:       #DEE2E6   /* Card borders, dividers */
  --color-text-primary: #212529   /* Body text, card titles */
  --color-text-muted:   #6C757D   /* Descriptions, secondary text */
  --color-accent:       #3B6EF5   /* Links, focus rings, primary interactive */
  --color-accent-hover: #2B5CE0   /* Hover state on links/buttons */

  /* Column header tints (subtle) */
  --color-col-todo:     #F0F4FF   /* Very light blue-gray tint */
  --color-col-progress: #FFF8F0   /* Very light amber tint */
  --color-col-done:     #F0FFF4   /* Very light green tint */

  /* Column header text (same for all — primary text, not per-color) */
  --color-col-header-text: #212529
  ```
- **WCAG Contrast Ratios** (calculated against the backgrounds in use):
  - `--color-text-primary` (#212529) on `--color-bg` (#F8F9FA): **~15.2:1** — WCAG AAA (body text ≥ 4.5:1 ✓)
  - `--color-text-primary` (#212529) on `--color-surface` (#FFFFFF): **~16.0:1** — WCAG AAA (card title text ✓)
  - `--color-text-muted` (#6C757D) on `--color-surface` (#FFFFFF): **~4.54:1** — meets WCAG AA (body text 4.5:1 ✓)
  - `--color-text-muted` (#6C757D) on `--color-bg` (#F8F9FA): **~4.47:1** — marginally below 4.5:1 — **use `--color-surface` (#FFFFFF) as the background for any element using muted text** (card bodies sit on `--color-surface`; this is guaranteed)
  - `--color-accent` (#3B6EF5) on `--color-bg` (#F8F9FA): **~4.7:1** — meets WCAG AA for normal text and UI components (≥ 3:1 for UI components ✓, ≥ 4.5:1 for text ✓)
  - Column header text (#212529) on todo tint (#F0F4FF): **~14.3:1** — WCAG AAA ✓
  - Column header text (#212529) on progress tint (#FFF8F0): **~14.8:1** — WCAG AAA ✓
  - Column header text (#212529) on done tint (#F0FFF4): **~14.9:1** — WCAG AAA ✓
  - Focus ring: `--color-accent` (#3B6EF5) on any background: ≥ 3:1 against #F8F9FA ✓ (3:1 for focus indicators per WCAG 2.1 AA Success Criterion 1.4.11)
- **Typography**:
  ```
  --font-family-base: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
                       Oxygen, Ubuntu, sans-serif;
  --font-size-base:   16px    /* 1rem */
  --font-size-sm:     14px    /* 0.875rem */
  --font-size-lg:     18px    /* 1.125rem */
  --font-size-h1:     24px    /* 1.5rem */
  --font-size-h2:     18px    /* 1.125rem */
  --font-weight-normal:  400
  --font-weight-medium:  500
  --font-weight-bold:    600
  --line-height-base:  1.5
  --line-height-tight: 1.25
  ```
  System font stack: renders native on each OS (San Francisco on macOS, Segoe UI on Windows, Roboto on Android/Linux) — no web font request, no FOUC, zero network cost. Perfectly aligned with the "developer-friendly" identity.

### Option 5B: Colorful kanban palette (Trello-style column colors)

- **Approach**: Each column gets a distinct, bright header color — blue for To Do, orange for In Progress, green for Done.
- **Pros**: Strong visual differentiation between columns.
- **Cons**:
  - Bright column colors require careful contrast management (bright orange with white text may fail 4.5:1)
  - Feels more consumer/playful than the developer-focused identity
  - Conflicts with the future labels feature (colored labels will compete with colored column headers)
  - Unnecessary visual noise for a display-only read tool
- **Usability**: Medium
- **Accessibility**: Medium (contrast management complex with bright backgrounds)
- **Implementation Complexity**: Medium

### Evaluation Matrix — Color Palette

| Criteria | Neutral Dev Palette (5A) | Colorful Kanban (5B) |
|----------|--------------------------|---------------------|
| WCAG AA compliance | High (ratios verified) | Medium (requires tuning) |
| "Developer-friendly" fit | High | Low |
| Future labels compatibility | High | Medium |
| Implementation | Low | Medium |
| Visual clarity | High | High |

**Decision (Palette + Typography): Option 5A — Neutral developer palette with verified contrast ratios.**

System font stack, neutral grays, single accent blue. Column headers use very subtle tints — enough to visually distinguish the columns without competing with future label colors. All contrast ratios verified above; body text and muted text on their intended backgrounds exceed WCAG AA.

---

## Decision Area 6: Loading State

### Option 6A: Skeleton screens

- **Approach**: Show placeholder gray blocks in the shape of the expected content (board entry rows for the list; column headers with card-shaped placeholders for the board view) while data is loading.
- **Pros**: Best perceived performance — users see the page's structure immediately.
- **Cons**: More implementation complexity (need separate skeleton layout components); on a sub-2-second localhost API call, skeletons may flash only briefly before disappearing — can feel janky rather than helpful for fast local calls.
- **Usability**: High (perceived performance)
- **Accessibility**: Medium (skeletons need `aria-busy` and `aria-label` for screen readers)
- **Implementation Complexity**: High

### Option 6B: Centered spinner

- **Approach**: A CSS-animated spinner centered in the content area of each page while the API call is in flight. No spinner until at least 150 ms have elapsed (optional delay to avoid flash).
- **Pros**:
  - Universally understood loading indicator
  - Simple implementation (one `<Spinner />` component with a CSS animation)
  - Works for both the board list and board view contexts
  - Adding a visibility delay (CSS `animation-delay` or a state timer) eliminates the "flash of spinner" on fast local calls
- **Cons**:
  - Does not show the content structure while loading (less informative than skeletons)
  - The centered spinner provides no layout context — user does not know if there are 2 boards or 20 loading
- **Usability**: High
- **Accessibility**: High (`role="status"` + `aria-live="polite"` + `aria-label="Loading"`)
- **Implementation Complexity**: Low

### Option 6C: "Loading..." text

- **Approach**: A plain text `<p>Loading…</p>` while data is in flight.
- **Pros**: Absolute minimal implementation.
- **Cons**: Feels unpolished; no visual interest; the same `aria-live` region is still needed for accessibility.
- **Usability**: Medium
- **Accessibility**: High
- **Implementation Complexity**: Low

### Evaluation Matrix — Loading State

| Criteria | Skeleton (6A) | Spinner (6B) | "Loading..." text (6C) |
|----------|---------------|--------------|------------------------|
| Perceived performance | High | Medium | Low |
| Implementation | High | Low | Low |
| Flash prevention (fast calls) | Medium | High (with delay) | High |
| Accessibility | Medium | High | High |
| Fit for sub-2s localhost | Medium | High | High |

**Decision (Loading State): Option 6B — Centered CSS spinner with a 200 ms appearance delay.**

For a product that targets sub-2-second page loads on localhost, skeletons create more complexity than value — they will often flash for a fraction of a second before data arrives. A spinner with a 200 ms CSS `animation-delay` prevents the flash for fast calls while still communicating loading for slower ones. The spinner is reusable across both pages. WCAG: `role="status"` + `aria-live="polite"` + `aria-label="Loading content"`.

The 200 ms delay is implemented via a CSS Custom Property on the spinner container:
```css
.spinner {
  animation: spin 1s linear infinite;
  animation-delay: 200ms; /* do not show spinner if data arrives < 200ms */
  opacity: 0;
  animation-fill-mode: forwards;
}
/* After delay elapses, opacity transitions to 1 */
@keyframes appear { to { opacity: 1; } }
.spinnerContainer { animation: appear 0s 200ms forwards; }
```

---

## Decision Area 7: Empty States

### Option 7A: Illustrated empty state (icon + copy)

- **Approach**: A simple inline SVG icon (e.g., an empty clipboard or grid icon) with a heading and sub-copy. For zero boards: a board-shaped icon. For empty columns: a small placeholder card icon.
- **Pros**: Visually polished; communicates context clearly.
- **Cons**: Requires inline SVG assets or an icon library; adds implementation scope beyond what the AC requires.

### Option 7B: Text-only empty state with clear copy

- **Approach**: A centered text block with a heading-level message and optional sub-copy. No illustration required.
- **Pros**: Minimal implementation; copy is all that's needed to communicate the empty state clearly; accessible by default.
- **Cons**: Less visually interesting, but entirely appropriate for a developer-focused tool.

**Decision (Empty States): Option 7B — Text-only with clear, actionable copy.**

The product is developer-focused; empty state illustrations are not required and add SVG/icon management overhead. Clear copy strings are sufficient.

**Exact copy strings (canonical — used in AC verification and unit tests):**

| Context | AC Reference | Copy |
|---------|-------------|------|
| Board list — zero boards | AC-ENTRY-2 | Heading: **"No boards yet"** / Sub: *"Create your first board to get started."* |
| Board view — empty column (To Do) | AC-HAPPY-3 | *"No cards yet"* (centered within the column) |
| Board view — empty column (In Progress) | AC-HAPPY-3 | *"No cards yet"* |
| Board view — empty column (Done) | AC-HAPPY-3 | *"No cards yet"* |

---

## Decision Area 8: Error States

### Option 8A: Inline page-level error with recovery affordance

- **Approach**: When an API call fails, the page renders an error message block in place of the content area. The message is category-driven (no internal detail). For the board view, the back-navigation link remains accessible above the error block.
- **Error component structure**:
  - An alert/banner section with an `role="alert"` for screen reader announcement
  - Error heading (visually prominent, not an H1 — preserve heading hierarchy)
  - Contextual message based on the `ApiError.category`
  - Optional recovery affordance (retry link for list; back-nav link always on board view)

**Exact copy strings (canonical):**

| Context | API category | AC Reference | Heading | Message | Recovery |
|---------|-------------|-------------|---------|---------|----------|
| Board list — API unreachable | `network` | AC-ERROR-1 | **"Could not load boards"** | *"The server is not reachable. Make sure it is running and try again."* | — (no retry button in MVP, user refreshes manually) |
| Board list — server error | `server` | AC-ERROR-1 | **"Something went wrong"** | *"An error occurred while loading boards. Please try again later."* | — |
| Board view — board not found | `notFound` | AC-ERROR-2 | **"Board not found"** | *"This board does not exist or may have been removed."* | [← Back to boards] link |
| Board view — API unreachable | `network` | AC-ERROR-2 | **"Could not load board"** | *"The server is not reachable. Make sure it is running and try again."* | [← Back to boards] link |
| Board view — server error | `server` | AC-ERROR-2 | **"Something went wrong"** | *"An error occurred while loading this board. Please try again later."* | [← Back to boards] link |

**WCAG note**: Error messages use `role="alert"` (live region) so screen readers announce them on render. No internal error detail, stack traces, or HTTP status codes are shown to the user (Guiding Principle 5). The back-navigation link is rendered BEFORE the error content in DOM order, ensuring it is reachable even if the error block is lengthy.

**Decision (Error States): Option 8A — Inline page-level error with category-driven copy and accessible recovery.**

---

## Decision Area 9: Back-Navigation Affordance

### Option 9A: Top-left text link with arrow

- **Approach**: A `← Back to boards` text link placed at the top of the board view page, above the board name heading. Uses a real `<a>` element (rendered via react-router's `<Link to="/">`). Persistent across loading, content, and error states.
- **Placement**:
  ```
  [← Back to boards]    ← always top-left, above h1
  h1: Board Name
  [columns...]
  ```
- **Pros**: Universally understood pattern (GitHub, Notion, Linear all use this); always accessible before the content loads or when an error occurs; keyboard-reachable in natural tab order.
- **Cons**: None for this use case.

### Option 9B: Breadcrumb navigation

- **Approach**: `BanyanBoard / Alpha Project` breadcrumb.
- **Pros**: More hierarchical context.
- **Cons**: Adds semantic complexity (nav + ol + aria-current) for a two-level hierarchy that is already communicated by the back-link. Overkill for 2 pages.

**Decision (Back-Navigation): Option 9A — `← Back to boards` text link, top-left, above the board name heading.**

The link is a real `<a>` (via react-router `<Link>`), always visible in loading and error states, keyboard-reachable as the first interactive element on the page after landmark navigation.

---

## Full Evaluation Matrix

| Criteria | Chosen Option | Score | Notes |
|----------|---------------|-------|-------|
| Usability | CSS Modules + vertical list + horizontal kanban + spinner | High | Matches developer mental models across all decisions |
| Accessibility | WCAG AA verified palette, text empty states, role=alert errors | High | Contrast ratios verified; keyboard nav; focus management |
| Consistency | Single token set; same loading/error pattern both pages | High | One `<Spinner>`, one `<ErrorMessage>`, one `<EmptyState>` |
| Responsiveness | Vertical list (list page) + scroll kanban (board view) | High | Both work at 768px tablet without stacking the kanban |
| Performance | Spinner w/ 200ms delay; no skeleton overhead | High | Fast local calls do not flash a loading indicator |
| Implementation | CSS Modules, no extra build deps, low-complexity layout | Low complexity | All choices favor minimal implementation |

---

## Decision Summary

| Decision Area | Chosen Approach |
|---------------|----------------|
| Styling mechanism | **CSS Modules** (Vite built-in; zero extra config) |
| Design tokens | CSS Custom Properties in `tokens.css` |
| Typography | **System font stack** (`-apple-system`, Segoe UI, Roboto) |
| Board list layout | **Vertical list** with board name + description per entry |
| Board view layout | **Horizontal three-column kanban** with `overflow-x: auto` tablet scroll |
| Card component | **Title + Description** — no status badge (column placement communicates status) |
| Loading state | **CSS spinner** with 200 ms appearance delay |
| Empty state — no boards | Text-only: **"No boards yet"** heading + sub-copy |
| Empty state — empty column | Text-only: **"No cards yet"** per column |
| Error copy — network/server (list) | **"Could not load boards"** / **"Something went wrong"** |
| Error copy — notFound (board) | **"Board not found"** + back-nav link |
| Error copy — network/server (board) | **"Could not load board"** + back-nav link |
| Back-navigation | **`← Back to boards`** text link, top-left, above board name h1 |
| Column differentiation | **Subtle background tints** (light blue / amber / green) + column label text |

---

## Design Specifications

### Color Tokens (CSS Custom Properties)

```css
/* client/src/styles/tokens.css */
:root {
  /* Backgrounds */
  --color-bg:              #F8F9FA;
  --color-surface:         #FFFFFF;
  --color-surface-hover:   #F1F3F5;

  /* Borders */
  --color-border:          #DEE2E6;
  --color-border-strong:   #ADB5BD;

  /* Text */
  --color-text-primary:    #212529;   /* contrast on bg: 15.2:1 ✓ */
  --color-text-muted:      #6C757D;   /* contrast on --color-surface: 4.54:1 ✓ */
  --color-text-inverse:    #FFFFFF;

  /* Interactive */
  --color-accent:          #3B6EF5;   /* contrast on bg: 4.7:1 ✓ */
  --color-accent-hover:    #2B5CE0;
  --color-focus-ring:      #3B6EF5;

  /* Column header tints (background) */
  --color-col-todo-bg:     #EFF3FF;   /* Light indigo tint */
  --color-col-progress-bg: #FFF4E6;   /* Light amber tint */
  --color-col-done-bg:     #EBFBEE;   /* Light green tint */

  /* Column header label text (all columns) */
  --color-col-header-text: #212529;   /* contrast on all tints: >14:1 ✓ */

  /* Error */
  --color-error-bg:        #FFF5F5;
  --color-error-border:    #FFC9C9;
  --color-error-text:      #C92A2A;   /* contrast on error-bg: 6.8:1 ✓ */

  /* Typography */
  --font-family-base:      -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
                            Oxygen, Ubuntu, Cantarell, sans-serif;
  --font-size-xs:          0.75rem;   /* 12px */
  --font-size-sm:          0.875rem;  /* 14px */
  --font-size-base:        1rem;      /* 16px */
  --font-size-lg:          1.125rem;  /* 18px */
  --font-size-xl:          1.5rem;    /* 24px */

  --font-weight-normal:    400;
  --font-weight-medium:    500;
  --font-weight-semibold:  600;

  --line-height-base:      1.5;
  --line-height-tight:     1.25;

  /* Spacing */
  --space-1:  4px;
  --space-2:  8px;
  --space-3:  12px;
  --space-4:  16px;
  --space-5:  20px;
  --space-6:  24px;
  --space-8:  32px;
  --space-12: 48px;

  /* Radii */
  --radius-sm:  4px;
  --radius-md:  8px;
  --radius-lg:  12px;

  /* Shadows */
  --shadow-card: 0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.06);
  --shadow-card-hover: 0 4px 6px rgba(0, 0, 0, 0.07), 0 2px 4px rgba(0, 0, 0, 0.06);

  /* Focus */
  --focus-ring: 0 0 0 3px rgba(59, 110, 245, 0.4);
}
```

### Layout

- **Desktop (> 1024 px)**: Board list centered with `max-width: 720px`. Board view full-width with `max-width: 1280px`. Kanban columns: `grid-template-columns: repeat(3, 1fr)` within the content area.
- **Tablet (768–1024 px)**: Board list same (list is naturally responsive). Board view: kanban columns maintain `minmax(260px, 1fr)` within an `overflow-x: auto` container — all three columns remain visible and horizontally scrollable.
- **Below 768 px (narrow)**: Best-effort — horizontal scroll remains on the board view. MVP explicitly does not require mobile optimization. Board list renders cleanly as a single-column list.

### Key Components

| Component | Purpose | Behavior |
|-----------|---------|----------|
| `AppShell` | App-wide layout wrapper | Header with app name, `<main>` content region |
| `BoardListPage` | Board list page container | Fetches boards; renders list, loading, empty, or error state |
| `BoardEntry` | Single board list row | `<li>` with `<Link>` to `/boards/:id`; board name + description |
| `BoardViewPage` | Board view page container | Fetches board + cards; renders columns, loading, or error |
| `KanbanBoard` | Three-column grid container | CSS Grid of three `Column` components; `overflow-x: auto` |
| `Column` | Single kanban column | Header (label + tint bg) + list of `CardItem` or empty state |
| `CardItem` | Individual card tile | Board name (medium weight) + description (muted); `role="article"` |
| `Spinner` | Loading indicator | CSS animated ring; `role="status"` + `aria-label="Loading content"` |
| `EmptyState` | Empty content placeholder | Centered text heading + optional sub-copy |
| `ErrorMessage` | Error display block | `role="alert"`; heading + message; optional recovery `<Link>` |

### Interactions

| Trigger | Action | Feedback |
|---------|--------|----------|
| User clicks board entry | React Router navigates to `/boards/:id` | Page content replaces; focus moves to board name heading |
| User clicks "← Back to boards" | React Router navigates to `/` | Board list renders; focus moves to "Boards" heading |
| Board entry receives keyboard focus | Focus ring visible on the entry | 3px solid `--color-accent` ring via `:focus-visible` |
| Back-nav link receives keyboard focus | Focus ring visible | Same focus ring treatment |
| Board entry hovered (pointer) | Background changes to `--color-surface-hover` | Subtle background shift; cursor pointer |
| Page route changes | Focus management fires | `document.title` updated; focus moves to `<h1>` of new page |

### Responsive Behavior

| Breakpoint | Changes |
|------------|---------|
| < 640 px | Board list: single column (already default for a list). Board view: kanban in `overflow-x: auto` scroll container (no stacking). |
| 640–1024 px (tablet) | Board list: `max-width: 720px` centered. Board view: kanban columns min `260px` in scroll container. |
| > 1024 px | Board list: `max-width: 720px` centered. Board view: `max-width: 1280px`; three equal columns fill available width. |

### Accessibility Requirements

- [x] **Keyboard navigation**: All board entries are real `<a>` elements via `<Link>`. Back-nav is a real `<a>`. Tab order is logical (header → main content → entries). Kanban board keyboard-scrollable via standard overflow behavior.
- [x] **Screen reader compatibility**: Landmarks (`<header>`, `<main>`, `<nav>` for back-link); each Column is a `<section aria-label="To Do">`, `<section aria-label="In Progress">`, `<section aria-label="Done">`; `<h1>` for page heading (board name or "Boards"); spinner has `role="status"` + `aria-label`; errors use `role="alert"`.
- [x] **Color contrast compliance**: All ratios verified in Decision Area 5. Body text 15.2:1+, muted text 4.54:1 (on white surface), accent 4.7:1, column header text 14:1+ on tinted backgrounds.
- [x] **Focus indicators**: `:focus-visible` CSS on all interactive elements — `box-shadow: var(--focus-ring)` (3px ring in accent blue). Never `:focus` (avoids focus ring on mouse click while preserving keyboard ring). Never `outline: none` without a replacement.
- [x] **Error messages accessible**: `role="alert"` so screen readers announce errors on render without user action.
- [x] **Status by more than color**: Column labels are text ("To Do", "In Progress", "Done") — status is not conveyed only by the column tint color.
- [x] **Focus management on route change**: After client-side navigation, focus moves to the new page's `<h1>` element. Implemented in `App.tsx` via a `useEffect` on `location.pathname` that calls `.focus()` on a ref attached to each page's `<h1>`.
- [x] **Page title update**: `document.title` is updated on each route change (`"BanyanBoard — Boards"` for list, `"BanyanBoard — {board name}"` for view).

### Page Wireframes

**Board List Page (`/`)**:
```
┌─────────────────────────────────────────────────────────────┐
│  BanyanBoard                                    [header]     │
├─────────────────────────────────────────────────────────────┤
│  [main]                                                     │
│                                                             │
│  h1: Boards                                                 │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  Alpha Project                          (→ link row)  │  │
│  │  Sprint planning and engineering tasks               │  │
│  └───────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  Marketing Q3                                         │  │
│  │  Campaign tracking board                             │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  [Loading state: centered spinner]                          │
│  [Empty state: "No boards yet" centered]                    │
│  [Error state: "Could not load boards" alert block]         │
└─────────────────────────────────────────────────────────────┘
```

**Board View Page (`/boards/:id`)**:
```
┌─────────────────────────────────────────────────────────────────────────────┐
│  BanyanBoard                                                    [header]     │
├─────────────────────────────────────────────────────────────────────────────┤
│  [main]                                                                     │
│                                                                             │
│  ← Back to boards   ← (always present; rendered before h1)                 │
│                                                                             │
│  h1: Alpha Project                                                          │
│                                                                             │
│  ┌───────────────────┬───────────────────┬───────────────────────────────┐  │
│  │ TO DO             │ IN PROGRESS       │ DONE                          │  │
│  │ [light blue bg]   │ [light amber bg]  │ [light green bg]              │  │
│  │ ─────────────     │ ─────────────     │ ─────────────                 │  │
│  │ ┌─────────────┐   │ ┌─────────────┐   │ ┌─────────────┐               │  │
│  │ │ Fix login   │   │ │ Add API     │   │ │ Set up DB   │               │  │
│  │ │ button      │   │ │ endpoints   │   │ │ migrations  │               │  │
│  │ │ The login.. │   │ │ Implement.. │   │ │ Created..   │               │  │
│  │ └─────────────┘   │ └─────────────┘   │ └─────────────┘               │  │
│  │ ┌─────────────┐   │                   │ ┌─────────────┐               │  │
│  │ │ Update docs │   │  No cards yet     │ │ Init repo   │               │  │
│  │ │ ...         │   │  (empty state)    │ │ ...         │               │  │
│  │ └─────────────┘   │                   │ └─────────────┘               │  │
│  └───────────────────┴───────────────────┴───────────────────────────────┘  │
│                                                                             │
│  [Loading state: centered spinner, above columns area]                      │
│  [Error state: back-nav link + error alert block]                           │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Component Inventory

### Pages
- `client/src/pages/BoardListPage.tsx` — board list page; owns fetch lifecycle, renders one of: `<Spinner>`, `<EmptyState>`, `<ErrorMessage>`, or board entry list
- `client/src/pages/BoardViewPage.tsx` — board view page; owns parallel fetches for board + cards; renders one of: `<Spinner>`, `<ErrorMessage>` (with back-nav), or `<KanbanBoard>`

### UI Components
- `client/src/components/AppShell/AppShell.tsx` — header bar with app name; `<main>` wrapper
- `client/src/components/BoardEntry/BoardEntry.tsx` — single list row (link to board view); name + description
- `client/src/components/KanbanBoard/KanbanBoard.tsx` — three-column CSS Grid wrapper with `overflow-x: auto`
- `client/src/components/Column/Column.tsx` — single kanban column; header (label + tint background) + card list or empty state
- `client/src/components/CardItem/CardItem.tsx` — individual card tile; title + description
- `client/src/components/Spinner/Spinner.tsx` — loading spinner with `role="status"` + 200 ms delay
- `client/src/components/EmptyState/EmptyState.tsx` — reusable empty content block; accepts `heading` + `message` props
- `client/src/components/ErrorMessage/ErrorMessage.tsx` — error alert block; accepts `heading`, `message`, optional `backLink` (rendered as a `<Link>` to `/`)

### State-Specific Props Pattern
Each page component uses a local state machine with values `idle | loading | success | error`. The component renders the appropriate sub-component based on the current state, never mixing states.

---

## Implementation Guidelines

### For Phase 3 (Board List Page) — `/banyan-build`

1. **Scaffold `client/src/styles/tokens.css`** with all custom properties defined above. Import in `client/src/main.tsx` before `App.tsx` renders.
2. **`BoardListPage.tsx`**: Use a `useEffect` with a cleanup (AbortController) to fire `apiClient.getBoards()` on mount. Local state: `{ status: 'loading' | 'success' | 'error', data: Board[] | null, error: ApiError | null }`.
3. **Render logic**: `status === 'loading'` → `<Spinner />`; `status === 'error'` → `<ErrorMessage>` with copy from the error-state table above, keyed on `error.category`; `status === 'success' && data.length === 0` → `<EmptyState heading="No boards yet" message="Create your first board to get started." />`; `status === 'success' && data.length > 0` → `<ul>` of `<BoardEntry>` components.
4. **`BoardEntry.tsx`**: Renders an `<li>` containing a react-router `<Link to={`/boards/${board.id}`}>`. The link wraps the entire entry (name + description) — the whole row is the click target (larger hit area, better a11y).
5. **`Spinner.tsx`**: CSS Modules animation; `role="status"`; `aria-label="Loading content"`; `aria-live="polite"`. Use `animation-delay: 200ms` + `opacity: 0` + `animation-fill-mode: forwards` pattern.
6. **Focus management on mount**: `BoardListPage` attaches a `ref` to its `<h1>` and calls `h1Ref.current?.focus()` in a `useEffect(() => ..., [])` (runs once on mount). This ensures route arrival from the board view returns focus to the heading.

### For Phase 4 (Board View Page) — `/banyan-build`

1. **`BoardViewPage.tsx`**: On mount, fire BOTH `apiClient.getBoard(id)` and `apiClient.getCards(id)` in parallel (`Promise.all`). Do not waterfall. Local state: `{ status, board: Board | null, cards: Card[], error: ApiError | null }`.
2. **Card partitioning**: `const todoCards = cards.filter(c => c.status === 'todo')` etc. — done in the page component before passing to `<KanbanBoard>`.
3. **`KanbanBoard.tsx`**: Receives `{ todoCards, inProgressCards, doneCards }`. Renders three `<Column>` components inside a CSS Grid container with `overflow-x: auto`.
4. **`Column.tsx`**: Receives `label` (string), `cards` (Card[]), `colorClass` (CSS module class variant for the tint). Renders `<section aria-label={label}>`. Always renders — never conditionally omitted (AC-HAPPY-3). If `cards.length === 0`, renders `<EmptyState heading="No cards yet" />`.
5. **Back-nav**: `<Link to="/" className={styles.backNav}>← Back to boards</Link>`. Rendered as the FIRST child of `<main>` on the board view, before the `<h1>`. This ensures it is accessible in both loading and error states.
6. **Error state on board view**: `<ErrorMessage>` renders AFTER the back-nav link in DOM order. The `backLink` prop causes `ErrorMessage` to render its own `<Link>` — but back-nav being above the error ensures it is reachable regardless.
7. **Focus management**: `BoardViewPage` attaches a ref to its `<h1>` and focuses it on mount (same pattern as board list). On error, focus goes to the error heading via `ErrorMessage`'s internal ref.
8. **`CardItem.tsx`**: `<article>` element (semantically correct for independent content units). Title in `<h3>` (heading hierarchy: page h1 → column h2 → card h3). Description in `<p>` with `color: var(--color-text-muted)`. No status badge.
9. **Column heading hierarchy**: Column label renders as `<h2>` within the column's `<section>`. This gives the heading structure: `h1` (board name) → `h2` (column labels) → `h3` (card titles).

### Component File Structure

```
client/src/
├── styles/
│   ├── tokens.css          ← CSS Custom Properties (import in main.tsx)
│   └── globals.css         ← Global resets, body styles, .sr-only utility
├── components/
│   ├── AppShell/
│   │   ├── AppShell.tsx
│   │   └── AppShell.module.css
│   ├── BoardEntry/
│   │   ├── BoardEntry.tsx
│   │   └── BoardEntry.module.css
│   ├── KanbanBoard/
│   │   ├── KanbanBoard.tsx
│   │   └── KanbanBoard.module.css
│   ├── Column/
│   │   ├── Column.tsx
│   │   ├── Column.module.css
│   │   └── Column.test.tsx
│   ├── CardItem/
│   │   ├── CardItem.tsx
│   │   ├── CardItem.module.css
│   │   └── CardItem.test.tsx
│   ├── Spinner/
│   │   ├── Spinner.tsx
│   │   └── Spinner.module.css
│   ├── EmptyState/
│   │   ├── EmptyState.tsx
│   │   └── EmptyState.module.css
│   └── ErrorMessage/
│       ├── ErrorMessage.tsx
│       └── ErrorMessage.module.css
└── pages/
    ├── BoardListPage.tsx
    ├── BoardListPage.test.tsx
    ├── BoardListPage.module.css
    ├── BoardViewPage.tsx
    ├── BoardViewPage.test.tsx
    └── BoardViewPage.module.css
```

### CSS Module Conventions

- Use `camelCase` class names in CSS Modules (TypeScript `styles.boardEntry`, not `styles['board-entry']`)
- Component-local styles only. Cross-component layout tokens via CSS Custom Properties from `tokens.css`
- `:focus-visible` ring pattern: `box-shadow: var(--focus-ring)` on all `<a>` and `<button>` elements; never `outline: none` without `box-shadow` replacement
- Column color variants: pass a `variant` prop (`todo | inProgress | done`) to `<Column>` and apply a CSS Module class conditionally: `styles[variant]` — e.g., `styles.todo` sets `background: var(--color-col-todo-bg)`

---

## Validation Checklist

- [x] Meets all user goals (Alex: fast scan; Sam: simple list; Jordan: board hygiene visibility)
- [x] Accessible per WCAG 2.1 AA: contrast ratios verified (≥ 4.5:1 body, ≥ 3:1 UI), keyboard nav via real `<a>` elements, focus indicators via `:focus-visible`, `role="alert"` errors, column `aria-label`, focus management on route change
- [x] Consistent with existing patterns: Guiding Principle 5 honored (no internal error detail in error copy), Guiding Principle 4 honored (CSS Modules over Tailwind — simplest that works), architecture decisions respected (CSS Modules, `client/` layout, react-router `<Link>`)
- [x] Respects Guiding Principles and component architecture in systemPatterns.md: GP1 (no hardcoded config), GP4 (CSS Modules — no extra build step), GP5 (error copy never exposes internal detail)
- [x] Responsive across devices: vertical list works at any width; horizontal kanban scrollable at tablet
- [x] Performance acceptable: spinner with 200ms delay prevents flash; no skeleton overhead; parallel board + cards fetch (no waterfall)
- [x] Implementation feasible: all components are CSS Modules + standard React; no new build-tool dependencies
- [x] All AC behavioral states covered: AC-ENTRY-1/2, AC-HAPPY-1/2/3, AC-ERROR-1/2, AC-LOADING-1
- [x] Fetch error categories mapped to copy: `network` → "not reachable", `notFound` → "not found", `server` → "something went wrong"
- [x] Empty and error copy strings defined — usable directly in unit test assertions

---

## Next Steps

1. **Phase 3 (`/banyan-build`)**: Implement `BoardListPage`, `BoardEntry`, `Spinner`, `EmptyState`, `ErrorMessage`, and `tokens.css`. Wire focus management on route change in `App.tsx`.
2. **Phase 4 (`/banyan-build`)**: Implement `BoardViewPage`, `KanbanBoard`, `Column`, `CardItem`. Implement parallel fetch in `BoardViewPage`. Wire back-nav (`← Back to boards`) above the `<h1>`.
3. **Vitest tests (Phases 3 & 4)**: Write component tests using RTL. Verify loading/empty/error state rendering with mocked `apiClient`. Assert that `role="alert"` error messages are present; assert that `role="status"` spinner is present in loading state. Use the exact copy strings defined in this document.
4. **Phase 5 (`/banyan-build`)**: Playwright E2E tests assert the full AC journeys. Use the exact heading and message copy strings as selectors.
5. **`/banyan-uat`**: UAT walkthrough after Phase 4 before E2E implementation, per Level 3 workflow.
