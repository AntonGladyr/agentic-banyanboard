/**
 * Migration: add the `status` column to the `cards` table (FEAT-006 / TASK-006 Phase 1).
 *
 * The board view renders three kanban columns (To Do / In Progress / Done) and partitions
 * cards by their status. The original `cards` schema (1781746875601_create-cards-table.js) had
 * only a `position` integer and no column/status field, so this migration adds one:
 *
 *   status  VARCHAR(20)  NOT NULL DEFAULT 'todo'
 *
 * Design (Architecture creative Q2a/Q2b — memory-bank/creative/TASK-006-react-frontend-architecture.md):
 *   - Plain `varchar(20)` (room for 'in_progress'), NOT a Postgres ENUM and NOT a CHECK
 *     constraint. The allowed set ('todo' | 'in_progress' | 'done') is enforced in the app's
 *     validate-before-DB layer (src/validation/card.ts — CARD_STATUSES), consistent with how the
 *     rest of the card columns are validated. The API is the sole writer, so app-layer validation
 *     is the single source of truth; a DB CHECK is a documented future hardening.
 *   - NOT NULL DEFAULT 'todo' → existing rows created before this migration are backfilled to
 *     'todo' automatically (the default is applied to every existing row at ADD COLUMN time).
 *
 * Driven by DATABASE_URL (12-Factor — no hardcoded DSN). Reversible: `down` drops the column.
 *
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {void}
 */
exports.up = (pgm) => {
  // NOT NULL DEFAULT 'todo' backfills every existing card to 'todo' at ADD COLUMN time.
  // No DB CHECK — allowed values are enforced in src/validation/card.ts (validate-before-DB).
  pgm.addColumn('cards', {
    status: { type: 'varchar(20)', notNull: true, default: 'todo' },
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {void}
 */
exports.down = (pgm) => {
  pgm.dropColumn('cards', 'status', { ifExists: true });
};
