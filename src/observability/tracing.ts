/**
 * src/observability/tracing.ts — W3C Trace Context helper + OTel bootstrap seam.
 *
 * Per memory-bank/creative/TASK-001-express-api-architecture.md (Decision 3, Option 3C):
 * this task performs only LOCAL trace-context propagation. There is NO OTLP exporter
 * and NO `@opentelemetry/sdk-node` runtime — `initTracing()` is the single, documented
 * seam where the full SDK gets wired in a future task.
 *
 * `extractTraceContext` manually parses the W3C `traceparent` header
 * (`00-<32hex>-<16hex>-<2hex>`). On absence or malformation it mints a fresh, valid-format
 * root trace id so every request still gets a `traceId`/`spanId` for log correlation.
 * Random ids use Node's CSPRNG (`crypto.randomBytes`) — never `Math.random`.
 */

import { randomBytes } from 'node:crypto';

/** A minimal trace context: the W3C-format trace and span identifiers. */
export interface TraceContext {
  /** 32 lowercase-hex characters (16 bytes). */
  readonly traceId: string;
  /** 16 lowercase-hex characters (8 bytes). */
  readonly spanId: string;
}

/** W3C `traceparent` is exactly four dash-separated fields. */
const TRACEPARENT_PARTS = 4;
/** Supported W3C trace-context version. */
const SUPPORTED_VERSION = '00';

const TRACE_ID_PATTERN = /^[0-9a-f]{32}$/;
const SPAN_ID_PATTERN = /^[0-9a-f]{16}$/;
const FLAGS_PATTERN = /^[0-9a-f]{2}$/;

/** All-zero ids are invalid per the W3C spec. */
const INVALID_TRACE_ID = '0'.repeat(32);
const INVALID_SPAN_ID = '0'.repeat(16);

/** Mint a fresh, cryptographically-random 32-hex trace id. */
function mintTraceId(): string {
  return randomBytes(16).toString('hex');
}

/** Mint a fresh, cryptographically-random 16-hex span id. */
function mintSpanId(): string {
  return randomBytes(8).toString('hex');
}

/**
 * Normalize the raw `traceparent` header value. Express types headers as
 * `string | string[] | undefined`; when an array is supplied, use the first element.
 */
function readTraceparent(
  headers: Record<string, string | string[] | undefined>,
): string | undefined {
  const raw = headers['traceparent'];
  if (raw === undefined) {
    return undefined;
  }
  if (Array.isArray(raw)) {
    return raw[0];
  }
  return raw;
}

/**
 * Parse a candidate `traceparent` string into a {@link TraceContext}.
 * Returns `undefined` when the header is malformed (so the caller mints fresh ids).
 */
function parseTraceparent(value: string): TraceContext | undefined {
  const parts = value.split('-');
  if (parts.length !== TRACEPARENT_PARTS) {
    return undefined;
  }

  const [version, traceId, spanId, flags] = parts as [
    string,
    string,
    string,
    string,
  ];

  if (version !== SUPPORTED_VERSION) {
    return undefined;
  }
  if (!TRACE_ID_PATTERN.test(traceId) || traceId === INVALID_TRACE_ID) {
    return undefined;
  }
  if (!SPAN_ID_PATTERN.test(spanId) || spanId === INVALID_SPAN_ID) {
    return undefined;
  }
  if (!FLAGS_PATTERN.test(flags)) {
    return undefined;
  }

  return { traceId, spanId };
}

/**
 * Derive a {@link TraceContext} from incoming request headers.
 *
 * - VALID `traceparent` → returns the embedded `traceId`/`spanId` verbatim.
 * - ABSENT or MALFORMED `traceparent` → mints fresh, valid-format random ids.
 *
 * Never throws.
 */
export function extractTraceContext(
  headers: Record<string, string | string[] | undefined>,
): TraceContext {
  const raw = readTraceparent(headers);
  if (raw !== undefined) {
    const parsed = parseTraceparent(raw);
    if (parsed !== undefined) {
      return parsed;
    }
  }

  return { traceId: mintTraceId(), spanId: mintSpanId() };
}

/**
 * Initialize distributed tracing.
 *
 * No-op stub today. This is the SINGLE, intentional future seam where
 * `@opentelemetry/sdk-node` + an OTLP exporter (and auto-instrumentation) will be
 * bootstrapped when full distributed tracing is enabled. Keeping it here means that
 * upgrade is a localized change to this file rather than a cross-cutting refactor.
 *
 * Must remain safe to call (never throws) so `index.ts` can invoke it unconditionally.
 */
export function initTracing(): void {
  // Intentionally empty — see doc comment above (future SDK-wiring point).
}
