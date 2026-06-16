/**
 * src/observability/logger.ts — structured-JSON logger (pino wrapper).
 *
 * Per memory-bank/creative/TASK-001-express-api-architecture.md (Decision 2):
 * pino is the chosen logger. It is configured from the validated `config` object and
 * emits newline-delimited JSON.
 *
 * ── Output-capture contract (authoritative) ──────────────────────────────────────────
 * The default JSON path MUST write through `process.stdout` so the unit tests' spy on
 * `process.stdout.write` captures the serialized lines. We therefore pass
 * `process.stdout` as the explicit destination stream. We deliberately do NOT use:
 *   - pino's default fd-based destination,
 *   - `pino.destination()` with a numeric fd,
 *   - `pino.transport` / `pino-pretty` worker-thread transports,
 * because those bypass `process.stdout.write` and the spy would capture nothing.
 *
 * Base fields (`service`, `environment`, `version`) are bound at logger creation.
 * Per-request `traceId`/`spanId` are bound via pino's native `.child()` (see requestLogger).
 *
 * Configuration comes exclusively from `config` (which is the single env reader).
 * `LOG_FORMAT=text` (pino-pretty) and `LOG_OUTPUT=file`/`both` are out of scope for this
 * phase's default path; the DEFAULT is JSON-to-stdout. No `console.*` anywhere.
 */

import pino from 'pino';
import { config } from '../config/env';

/**
 * The base application logger.
 *
 * - `level` is driven by `config.logLevel` (LOG_LEVEL) — messages below it are suppressed.
 * - `base` fields appear on every line: `service`, `environment` (and `version`).
 * - `process.stdout` is the explicit destination so JSON is written via `stdout.write`
 *   (honors the test capture contract and the 12-Factor "logs to stdout" convention).
 *
 * pino includes `time` and `level` by default and uses `msg` as the message key — all of
 * which the tests assert on, so none are overridden here.
 *
 * Request-scoped logging uses `logger.child({ traceId, spanId })`, which binds those
 * fields into every line the child emits.
 */
export const logger: pino.Logger = pino(
  {
    level: config.logLevel,
    base: {
      service: config.otelServiceName,
      environment: config.nodeEnv,
      version: config.serviceVersion,
    },
  },
  process.stdout,
);
