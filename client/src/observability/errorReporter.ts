/**
 * client/src/observability/errorReporter.ts — the single client-side error sink (TASK-006 Phase 2).
 *
 * Architecture creative Q4: frontend observability is lightweight, self-contained, and console-only
 * (no third-party telemetry — NFR5; no network egress). This module is the ONLY place the client
 * calls `console.error`; it emits a STRUCTURED object mirroring the backend's structured-logging
 * ethos on the browser's only available sink. The systemPatterns "no `console.*`" rule targets the
 * backend (which has a pino sink); the browser has no pino, so a single, documented `console.error`
 * choke point here is the idiomatic client equivalent — build agents should not flag it.
 *
 * Two entry points feed this sink:
 *   - {@link reportError} — called by the root `ErrorBoundary` and the global handlers below.
 *   - {@link installGlobalErrorHandlers} — wires `unhandledrejection` + `error` window events.
 */

/** Structured shape emitted to the console — mirrors the backend's `{ level, ... }` log records. */
export interface ErrorReport {
  readonly level: 'error';
  /** Where the error originated (e.g. 'ErrorBoundary', 'unhandledrejection', 'window.error'). */
  readonly source: string;
  /** A human-readable message extracted from the error (never shown to the user directly). */
  readonly message: string;
  /** Optional structured context (e.g. React component stack). */
  readonly context?: Readonly<Record<string, unknown>>;
}

/** Extract a string message from an unknown thrown value without assuming it is an `Error`. */
function messageOf(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

/**
 * Report an error to the client's single console sink as a structured record. This is the ONLY
 * sanctioned `console.error` call site in the client.
 */
export function reportError(
  source: string,
  error: unknown,
  context?: Record<string, unknown>,
): void {
  const report: ErrorReport = {
    level: 'error',
    source,
    message: messageOf(error),
    ...(context ? { context } : {}),
  };
  // eslint-disable-next-line no-console -- documented single client sink (Architecture creative Q4)
  console.error(report, error);
}

/**
 * Install global handlers for uncaught promise rejections and uncaught errors, routing both to the
 * single {@link reportError} sink. Call once at app startup (from `main.tsx`).
 */
export function installGlobalErrorHandlers(): void {
  window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent): void => {
    reportError('unhandledrejection', event.reason);
  });
  window.addEventListener('error', (event: ErrorEvent): void => {
    reportError('window.error', event.error ?? event.message);
  });
}
