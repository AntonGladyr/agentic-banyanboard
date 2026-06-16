---
name: "Learned: TypeScript Config"
globs: ["tsconfig.json", "src/config/**/*.ts"]
topics: ["typescript", "config", "12-factor"]
priority: low
evidence_count: 1
last_updated: 2026-06-16
auto_generated: true
---

# TypeScript Config

- Enable `noUncheckedIndexedAccess` from project start on greenfield Node services; it types `process.env[key]` as `string | undefined`, forcing explicit defaulting/validation in the config module and structurally enforcing the single-config-source invariant.

## Evidence

| Learning | Source | Date |
|----------|--------|------|
| noUncheckedIndexedAccess enforces single-config-source at type level | [reflection-TASK-001.md](../../reflection/reflection-TASK-001.md) | 2026-06-16 |
