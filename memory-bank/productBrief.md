# Product Brief

> This document captures the business and product context for development teams.
> It ensures all agents understand the product's purpose, users, and constraints.

## Product Overview

- **Name**: BanyanBoard
- **Value Proposition**: A lightweight, self-hosted kanban board that lets small teams organize work visually without the complexity or cost of enterprise tools.
- **Product Type**: Web App (self-hosted / local-first)
- **Stage**: MVP

## Key Functionality

Core capabilities this product provides:

- Create and manage kanban boards with customizable columns (e.g., To Do, In Progress, Done)
- Create cards with titles, descriptions, due dates, and labels
- Drag-and-drop cards between columns to update status
- Organize multiple boards per team or project
- Label and filter cards for quick triage

## Markets Serviced

- **Primary Market**: Small software development teams and indie makers (2–15 people)
- **Secondary Markets**: Freelancers, small agencies, student project groups
- **Geographic Focus**: Global (English-first)
- **Market Size**: Long-tail of teams priced out of or overwhelmed by Jira/Linear/Asana

## Competitive Landscape

- **Direct Competitors**: Trello, Planka (open-source), Wekan
- **Indirect Competitors**: Notion databases, GitHub Projects, sticky notes
- **Key Differentiators**: Runs locally via Docker Compose — no SaaS lock-in, no per-seat cost, full data ownership
- **Competitive Advantages**: Zero-dependency self-hosting, simplicity as a feature, developer-friendly stack

## Key Personas

### Primary Users

| Persona | Role | Goals | Pain Points | Success Metrics |
|---------|------|-------|-------------|-----------------|
| Alex the Dev | Software engineer on a 4-person team | Quickly see what's in progress and pick up the next task | Jira is overkill; Linear costs money for the whole team | Zero context-switch overhead when checking board state |
| Sam the Maker | Solo developer / indie hacker | Track personal project tasks without a paid subscription | Trello's free tier is limited; tools require accounts | Able to run locally in under 5 minutes |

### Secondary Users

| Persona | Role | Goals |
|---------|------|-------|
| Jordan the PM | Part-time project coordinator on a small team | Maintain board hygiene, set due dates, assign labels | Needs a low-friction way to update cards without code |

### Administrators/Operators

| Persona | Role | Responsibilities |
|---------|------|------------------|
| Dev/Ops maintainer | Person who spun up Docker Compose | Runs `docker compose up`, manages backups, upgrades image versions |

## User Flows

- **Primary Flow**: Open board → view columns → drag card to new column → done
- **Onboarding**: Clone repo → `docker compose up` → open `localhost:3000` → create first board and add cards
- **Key Workflows**:
  - Create a new board and define columns
  - Add a card with a title, description, due date, and label
  - Move a card across columns to reflect progress
  - Filter cards by label to focus on a category

## Success Metrics & KPIs

### Business Metrics

- Stars / forks on the repository (open-source traction proxy)
- Docker Hub pulls per month
- Community contributions (PRs merged from external contributors)

### Product Metrics

- Time-to-first-board: user can create a board within 2 minutes of starting Docker Compose
- Card operations per session (proxy for engagement)
- Board load time < 1 second on local machine

### Technical Metrics

- API p95 response time < 150 ms for all CRUD endpoints
- Zero unhandled runtime errors in a typical session
- Docker Compose cold-start < 30 seconds

## Non-Functional Requirements

### Performance

- **Response Time**: p95 < 150 ms for API reads; p95 < 300 ms for writes
- **Throughput**: Designed for a single small team (< 20 concurrent users)
- **Concurrent Users**: 1–20 simultaneous users
- **Page Load Time**: Initial load < 2 s on localhost; < 3 s on LAN

### Scalability

- **Users**: 1–20 per deployment; not designed for multi-tenant SaaS
- **Data Volume**: Hundreds of cards per board; tens of boards total
- **Growth Rate**: Flat — single-team deployment
- **Peak Load**: No burst scaling needed; Docker Compose on a single host is sufficient

### Security

- **Authentication**: Session-based auth (email + password); no SSO required for MVP
- **Authorization**: Simple owner model — all authenticated users share access to all boards (MVP); per-board permissions as a future enhancement
- **Compliance**: No regulated data; no HIPAA/PCI/SOC2 requirement for MVP
- **Data Classification**: Internal only (task titles, descriptions — no PII beyond user accounts)
- **Encryption**: HTTPS in production (self-signed or reverse-proxy TLS); passwords hashed with bcrypt

### Availability & Reliability

- **Uptime Target**: Best-effort (self-hosted, no SLA)
- **Recovery Time Objective (RTO)**: Manual restart acceptable (< 5 min)
- **Recovery Point Objective (RPO)**: Daily PostgreSQL backups acceptable for MVP
- **Disaster Recovery**: `docker compose down && docker compose up` is the recovery procedure
- **Backup Strategy**: Docker volume backup via `pg_dump` on a schedule

### Data & Privacy

- **Data Residency**: Entirely local — user controls storage
- **Data Retention**: No automatic deletion; user manages their own data
- **Privacy Requirements**: No third-party analytics or telemetry in MVP
- **PII Handling**: Email stored for authentication only; not shared externally
- **Data Portability**: Export via `pg_dump` (future: JSON export from UI)
- **Right to Deletion**: Admin can drop database; no automated GDPR flow needed for MVP

### Accessibility

- **Target Compliance**: WCAG 2.1 AA (reasonable effort)
- **Key Requirements**:
  - [x] Keyboard navigation (move focus between cards, columns)
  - [x] Color contrast compliance for labels and status indicators
  - [x] Focus indicators on interactive elements
  - [ ] Screen reader compatibility (future enhancement)
  - [x] Alt text for any icons used as controls
  - [ ] Captions for video/audio (N/A — no media)

### Internationalization (i18n)

- **Supported Languages**: English only (MVP)
- **Localization Needs**:
  - [ ] Date formatting (ISO 8601 used internally; locale display is a future enhancement)
  - [ ] RTL support: not required for MVP

### Browser/Platform Support

- **Browsers**: Chrome 120+, Firefox 120+, Safari 17+, Edge 120+
- **Mobile**: Responsive layout — usable on tablet; mobile-first is not a priority for MVP
- **Desktop**: macOS, Windows, Linux (via Docker + any modern browser)

## Integration Points

### External Systems

| System | Purpose | Protocol | Direction |
|--------|---------|----------|-----------|
| PostgreSQL | Primary data store | TCP (pg wire protocol) | Outbound from backend |

### APIs Consumed

| API | Provider | Purpose |
|-----|----------|---------|
| — | — | No external APIs consumed in MVP |

### APIs Provided

| API | Purpose | Consumers |
|-----|---------|-----------|
| REST API (`/api/v1`) | CRUD for boards, columns, and cards | React frontend |

### Data Sources

| Source | Type | Frequency |
|--------|------|-----------|
| PostgreSQL | Relational database | Real-time (per request) |

## Constraints & Assumptions

### Business Constraints

- Open-source / free to self-host — no monetization in MVP
- Small team project — no dedicated ops or infra budget

### Technical Constraints

- Must run via `docker compose up` with no external dependencies
- React + TypeScript frontend; Express + TypeScript backend; PostgreSQL database
- Clean architecture preferred; complexity added only when it earns its keep
- No microservices — single backend process for MVP

### Assumptions

- Users are comfortable running Docker on their local machine or a small server
- All team members share a single deployment (no per-user isolation of boards in MVP)
- Internet access is not required at runtime (fully local)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Schema migrations break existing data on upgrade | Medium | High | Use a migration tool (e.g., node-pg-migrate); version migrations in repo |
| Drag-and-drop UX is buggy across browsers | Medium | Medium | Use a well-supported library (e.g., dnd-kit); test on Chrome + Firefox |
| Docker Compose setup is too complex for non-developers | Low | Medium | Provide a one-command quick-start and clear README |
| No auth leaves board data exposed on a shared network | Medium | Low (MVP) | Document the risk; add auth before any networked deployment |

## Open Questions

- [ ] Should boards support multiple members with separate logins in v1, or shared-secret access?
- [ ] Is drag-and-drop a hard MVP requirement or can click-to-move suffice initially?
- [ ] Should due dates trigger any notification (email, browser alert)?

## Document History

| Date | Author | Changes |
|------|--------|---------|
| 2026-06-16 | banyan-init | Initial creation |
| 2026-06-16 | Claude Code | Populated with BanyanBoard context, inferred personas, NFRs, and success metrics |

## Last Refreshed

2026-06-16
