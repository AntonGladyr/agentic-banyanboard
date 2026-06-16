/**
 * Jest global setup (runs before each test file is evaluated).
 *
 * Intentionally minimal. This file MUST NOT set any of the configuration keys
 * owned by src/config/env.ts (PORT, NODE_ENV, LOG_LEVEL, LOG_FORMAT, LOG_OUTPUT,
 * OTEL_SERVICE_NAME, OTEL_EXPORTER_OTLP_ENDPOINT, OTEL_TRACES_SAMPLER_ARG,
 * LOG_FILE_PATH, DATABASE_URL). Those tests delete/control those keys themselves
 * and assert the code-level defaults — forcing values here would break them.
 *
 * Non-managed, deterministic test baseline only.
 */

export {};
