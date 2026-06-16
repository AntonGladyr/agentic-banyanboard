# Project Brief

## Project Overview

- **Name**: agentic-banyanboard
- **Description**: [To be defined]
- **Goals**: [To be defined]

## Goals

[To be defined]

## Repository Structure

- **Type**: Poly-repo
- **Workspace Tool**: None
- **Workspace Root**: N/A

## Git Configuration

- **Repository**: Yes
- **Provider**: None (local only)
- **CLI Available**: gh
- **Remote URL**: none
- **Default Branch**: master
- **Archive Strategy**: local-merge

## Security Debt (Deferred Dependency Upgrades)

| ID | Advisory | Scope | Priority | Notes |
|----|----------|-------|----------|-------|
| SEC-DEBT-1 | GHSA-h67p-54hq-rp68 (js-yaml ≤4.1.1, quadratic-complexity DoS, CVSS 5.3) | Dev/CI only — transitive via jest/ts-jest toolchain (`@istanbuljs/load-nyc-config`). Not in production tree (express/pino/@otel-api are clean). | LOW | Recorded from TASK-001 Phase 1 dependency audit. npm's only remediation is a semver-major realignment of `ts-jest`/`jest` — needs a deliberate toolchain-bump task + full suite regression, not an in-sprint patch. Suggested task: "Refresh jest/ts-jest toolchain to clear transitive js-yaml DoS advisory." |

## Last Refreshed

2026-06-16
