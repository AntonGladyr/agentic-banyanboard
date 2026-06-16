/**
 * src/types/express.d.ts — Express `Request` augmentation.
 *
 * The request logger attaches a request-scoped child logger (`req.log`) and the resolved
 * trace id (`req.traceId`) onto each request so downstream handlers and the Phase 4 error
 * handler can log with the same trace correlation. Declaring these here keeps the augmentation
 * in one place and lets the whole codebase type-check under `strict` mode.
 */

import type { Logger } from 'pino';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Request-scoped child logger bound to this request's traceId/spanId. */
      log: Logger;
      /** W3C trace id for this request (extracted from `traceparent` or freshly minted). */
      traceId: string;
    }
  }
}

export {};
