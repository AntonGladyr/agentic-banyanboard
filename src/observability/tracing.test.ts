/**
 * Unit tests for src/observability/tracing.ts (Phase 2 — Observability foundation).
 *
 * Target contract (NOT yet implemented), per
 * memory-bank/creative/TASK-001-express-api-architecture.md (Decision 3 / OTel bootstrap scope):
 *
 *   extractTraceContext(headers: Record<string, string | string[] | undefined>):
 *       { traceId: string; spanId: string }
 *     - VALID  `traceparent` of form `00-<32hex>-<16hex>-<2hex>` → returns the embedded
 *       32-hex traceId and 16-hex spanId.
 *     - ABSENT header → mints a fresh random 32-hex traceId and 16-hex spanId.
 *     - MALFORMED header (wrong segment count / wrong lengths / non-hex) → falls back to
 *       minting fresh ids; MUST NOT throw.
 *
 *   initTracing(): void
 *     - No-op stub today (future SDK-wiring seam). Calling it MUST NOT throw.
 *
 * tracing.ts depends on `config` (and `@opentelemetry/api` types) but performs no
 * env-dependent branching exercised here, so these tests import the module directly.
 *
 * Mitigates the Risk-Assessment row: "Manual `traceparent` parsing is incorrect
 * (malformed/edge cases)" — covers valid, absent, and malformed headers.
 */

import { extractTraceContext, initTracing } from './tracing';

const HEX_32 = /^[0-9a-f]{32}$/;
const HEX_16 = /^[0-9a-f]{16}$/;

describe('observability/tracing', () => {
  describe('extractTraceContext', () => {
    it('extracts traceId and spanId from a valid W3C traceparent header', () => {
      // Arrange: canonical W3C traceparent — 00-<32hex>-<16hex>-<2hex>.
      const traceId = '0af7651916cd43dd8448eb211c80319c';
      const spanId = 'b7ad6b7169203331';
      const headers = { traceparent: `00-${traceId}-${spanId}-01` };

      // Act
      const ctx = extractTraceContext(headers);

      // Assert: the embedded ids are returned verbatim.
      expect(ctx.traceId).toBe(traceId);
      expect(ctx.spanId).toBe(spanId);
    });

    it('mints fresh valid-format ids when the traceparent header is absent', () => {
      // Arrange: no traceparent present.
      const headers = {};

      // Act
      const ctx = extractTraceContext(headers);

      // Assert: freshly minted ids match the W3C length/charset (32-hex / 16-hex).
      expect(ctx.traceId).toMatch(HEX_32);
      expect(ctx.spanId).toMatch(HEX_16);
    });

    it('falls back to fresh ids on a malformed traceparent without throwing', () => {
      // Arrange: malformed variants — wrong segment count, wrong lengths, non-hex.
      const malformedHeaders = [
        { traceparent: 'garbage' }, // not even segmented
        { traceparent: '00-tooshort-b7ad6b7169203331-01' }, // traceId wrong length / non-hex
        { traceparent: '00-0af7651916cd43dd8448eb211c80319c-deadbeef-01' }, // spanId wrong length
        { traceparent: 'zz-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01' }, // non-hex version
      ];

      for (const headers of malformedHeaders) {
        // Act + Assert: never throws; mints valid-format ids instead.
        let ctx!: { traceId: string; spanId: string };
        expect(() => {
          ctx = extractTraceContext(headers);
        }).not.toThrow();
        expect(ctx.traceId).toMatch(HEX_32);
        expect(ctx.spanId).toMatch(HEX_16);
      }
    });
  });

  describe('initTracing', () => {
    it('is a no-op that does not throw when called', () => {
      // Act + Assert: the documented future-SDK seam is safe to call today.
      expect(() => initTracing()).not.toThrow();
    });
  });
});
