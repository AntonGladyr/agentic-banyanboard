# Product Roadmap

## Summary

- **Total Features**: 3
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
  - FEAT-002: Docker Compose for PostgreSQL (planned) [Level 2]
  - FEAT-003: Health check endpoint with tests (planned) [Level 2]

### next (Planning)

- **Status**: planning
- **Target Date**: TBD
- **Description**: Backlog for future features not yet assigned to a release.
- **Features**: None

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
- **Status**: planned
- **Priority**: high
- **Complexity**: Level 2
- **Description**: Add a Docker Compose service for PostgreSQL to support local development and dev/prod parity. Includes the compose definition, environment-variable-driven connection config (12-Factor), and a database connection module wired into the Express API.
- **Linked Tasks**: TASK-002 (planning)
- **Branch**: feature/FEAT-002-docker-compose-postgresql
- **Created**: 2026-06-16

### FEAT-003: Health check endpoint with tests

- **Version**: v0.1.0
- **Status**: planned
- **Priority**: high
- **Complexity**: Level 2
- **Description**: Add a `/health` endpoint to the Express API that reports service liveness and verifies PostgreSQL connectivity (DB readiness). Returns structured JSON status with appropriate HTTP codes (200 healthy / 503 unhealthy) and includes unit and integration tests. Depends on FEAT-002 (PostgreSQL connection module).
- **Dependencies**: FEAT-002 (Docker Compose for PostgreSQL)
- **Linked Tasks**: None
- **Branch**: feature/FEAT-003-health-check-endpoint
- **Created**: 2026-06-16
