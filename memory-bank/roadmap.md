# Product Roadmap

## Summary

- **Total Features**: 8
- **Active Version**: None
- **Released Versions**: 0
- **Planning Versions**: 2 (v0.1.0, next)

## Versions

### v0.1.0 (Planning) — Foundation

- **Status**: planning
- **Target Date**: TBD
- **Description**: Project foundation milestone. Establishes the core Express API service written in TypeScript, including project structure, build tooling, and baseline observability per project standards.
- **Features**:
  - FEAT-001: Express API with TypeScript (complete) [Level 3]
  - FEAT-002: Docker Compose for PostgreSQL (complete) [Level 2]
  - FEAT-003: Health check endpoint with tests (complete) [Level 2]

### next (Planning)

- **Status**: planning
- **Target Date**: TBD
- **Description**: Backlog for future features not yet assigned to a release.
- **Features**:
  - FEAT-008: Realtime Activity Feed (in_progress) [Level 3]
  - FEAT-007: Board interactivity and real-time collaboration (complete) [Level 3]
  - FEAT-006: React frontend board UI (complete) [Level 3]
  - FEAT-005: Board model with CRUD endpoints (complete) [Level 2]
  - FEAT-004: Card model with CRUD endpoints (complete) [Level 2]

## Features

### FEAT-001: Express API with TypeScript

- **Version**: v0.1.0
- **Status**: complete
- **Priority**: high
- **Complexity**: Level 3
- **Description**: Foundation milestone establishing a TypeScript-based Express API. Covers project scaffolding (tsconfig, build/run scripts), the Express server and middleware structure, configuration via environment variables (12-Factor), and baseline OpenTelemetry observability (structured logging, trace context). Serves as the architectural base for all subsequent features.
- **Linked Tasks**: TASK-001 (complete — archived 2026-06-16)
- **Branch**: feature/FEAT-001-express-api-typescript
- **Created**: 2026-06-16

### FEAT-002: Docker Compose for PostgreSQL

- **Version**: v0.1.0
- **Status**: complete
- **Priority**: high
- **Complexity**: Level 2
- **Description**: Add a Docker Compose service for PostgreSQL to support local development and dev/prod parity. Includes the compose definition, environment-variable-driven connection config (12-Factor), and a database connection module wired into the Express API.
- **Linked Tasks**: TASK-002 (complete — archived 2026-06-16)
- **Branch**: feature/FEAT-002-docker-compose-postgresql
- **Created**: 2026-06-16

### FEAT-003: Health check endpoint with tests

- **Version**: v0.1.0
- **Status**: complete
- **Priority**: high
- **Complexity**: Level 2
- **Description**: Add a `/health` endpoint to the Express API that reports service liveness and verifies PostgreSQL connectivity (DB readiness). Returns structured JSON status with appropriate HTTP codes (200 healthy / 503 unhealthy) and includes unit and integration tests. Depends on FEAT-002 (PostgreSQL connection module).
- **Dependencies**: FEAT-002 (Docker Compose for PostgreSQL)
- **Linked Tasks**: TASK-003 (complete — archived 2026-06-17)
- **Branch**: feature/FEAT-003-health-check-endpoint
- **Created**: 2026-06-16

### FEAT-004: Card model with CRUD endpoints

- **Version**: next
- **Status**: complete
- **Priority**: high
- **Complexity**: Level 2
- **Description**: Add a Card domain model with full CRUD REST endpoints (create, read one, list, update, delete) on the Express API. Cards have a foreign key to Board (`board_id`) enforcing referential integrity. Includes request input validation (body and params), structured error responses, environment-driven persistence via the existing PostgreSQL connection module, and unit + integration tests. Follows the layered Express + Postgres patterns established in FEAT-001/002/003.
- **Dependencies**: FEAT-005 (Board model — required for the `board_id` foreign key)
- **Linked Tasks**: TASK-005 (complete — archived 2026-06-18)
- **Branch**: feature/FEAT-004-card-model-crud
- **Created**: 2026-06-17

### FEAT-005: Board model with CRUD endpoints

- **Version**: next
- **Status**: complete
- **Priority**: high
- **Complexity**: Level 2
- **Description**: Add a Board domain model with full CRUD REST endpoints (create, read one, list, update, delete) on the Express API. Establishes the `boards` table that Cards reference via foreign key. Includes request input validation, structured error responses, environment-driven persistence via the existing PostgreSQL connection module, and unit + integration tests. Prerequisite for FEAT-004 (Card model). Follows the layered Express + Postgres patterns established in FEAT-001/002/003.
- **Linked Tasks**: TASK-004 (complete — archived 2026-06-17)
- **Branch**: feature/FEAT-005-board-model-crud
- **Created**: 2026-06-17

### FEAT-006: React frontend board UI

- **Version**: next
- **Status**: complete
- **Priority**: high
- **Complexity**: Level 3
- **Description**: Add a React frontend that consumes the existing Express CRUD APIs. Includes a board list page (lists all boards), a board view page rendering three columns (To Do / In Progress / Done), and card display showing each card's title, description, and labels. Introduces the project's first frontend tier: build tooling, client-side routing, an API client against the Board and Card endpoints, and component structure for boards, columns, and cards. Display-only scope (no drag-and-drop, auth, or real-time collaboration). Requires architecture (frontend tooling/structure, API integration, dev/prod parity, observability) and UI/UX (board list, column layout, card rendering) creative phases. Depends on FEAT-004 (Card model) and FEAT-005 (Board model) for the backing APIs.
- **Dependencies**: FEAT-005 (Board model), FEAT-004 (Card model)
- **Linked Tasks**: TASK-006 (complete — archived 2026-06-21)
- **Branch**: feature/FEAT-006-react-frontend-board-ui
- **Created**: 2026-06-20

### FEAT-007: Board interactivity and real-time collaboration

- **Version**: next
- **Status**: complete
- **Priority**: high
- **Complexity**: Level 3 (manual override; auto-evaluated as Level 4)
- **Complexity Override Reason**: Auto-evaluation flagged Level 4 due to the new real-time transport tier spanning backend + frontend. User set Level 3 to scope it as a frontend-centric feature (architecture + UI/UX creative phases), consistent with FEAT-006.
- **Description**: Extend the existing React frontend (FEAT-006, currently display-only) with full board interactivity: create/edit board UI, create/edit card UI, drag-and-drop of cards between columns (To Do / In Progress / Done), and real-time collaboration so multiple users see updates live. Builds on the Board and Card CRUD APIs (FEAT-004/005) and the React tier established in FEAT-006. Requires architecture (real-time sync transport, optimistic updates, dev/prod parity, observability) and UI/UX (create/edit forms, drag-and-drop interaction model) creative phases.
- **Dependencies**: FEAT-006 (React frontend board UI), FEAT-005 (Board model), FEAT-004 (Card model)
- **Linked Tasks**: TASK-007 (complete — archived 2026-06-21)
- **Branch**: feature/FEAT-007-board-interactivity-realtime-collab
- **Created**: 2026-06-21

### FEAT-008: Realtime Activity Feed

- **Version**: next
- **Status**: planned
- **Priority**: high
- **Complexity**: Level 3
- **Description**: Track and display a realtime activity feed of card movements between columns (To Do / In Progress / Done). When a card is moved, an activity event is recorded (actor, card, source/target column, timestamp) and surfaced live to all connected clients via the realtime transport established in FEAT-007. Builds on the documented Domain Event Pattern (card actions emit domain events; consumers subscribe to event streams). Requires architecture (activity-event model, persistence/retention strategy, feed delivery over the existing realtime channel) and UI/UX (feed presentation, ordering, empty/loading states) creative phases. Scoped to card-movement events for v1.
- **Dependencies**: FEAT-007 (Board interactivity and real-time collaboration), FEAT-006 (React frontend board UI), FEAT-004 (Card model)
- **Linked Tasks**: TASK-008
- **Branch**: feature/FEAT-008-realtime-activity-feed
- **Created**: 2026-06-30
