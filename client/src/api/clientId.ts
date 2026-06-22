/**
 * client/src/api/clientId.ts — stable per-tab client identifier (TASK-007 Phase 2).
 *
 * Returns an opaque id that is constant for the lifetime of a browser tab/session. It is sent as the
 * `X-Client-Id` header on every write (see `apiClient.sendJson`) so Phase 5's SSE layer can
 * echo-deduplicate a tab's own mutations (Architecture creative decision). It is NOT a secret or an
 * auth token — just an origin marker — so a random UUID is sufficient.
 */

let cachedId: string | null = null;

/** Lazily generate (once per tab) and return the client id used for write-origin de-duplication. */
export function getClientId(): string {
  if (cachedId === null) {
    cachedId =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `c-${Math.random().toString(36).slice(2)}`;
  }
  return cachedId;
}
