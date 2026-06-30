/**
 * Migration: create the `activity_events` table (FEAT-008 / TASK-008 Phase 1).
 *
 * Records a realtime activity feed of card-move events. Each row captures one column move of a card
 * (before/after status) — a materialization of the project's Domain Event Pattern. Schema follows
 * TASK-008 § Data persisted and the Architecture creative (memory-bank/creative/
 * TASK-008-activity-feed-architecture.md § Implementation Guidelines):
 *
 *   id          SERIAL        PRIMARY KEY
 *   board_id    INTEGER       NOT NULL REFERENCES boards(id) ON DELETE CASCADE
 *   card_id     INTEGER       NOT NULL            -- NO FK (intentional): survives card deletion
 *   card_title  VARCHAR(255)  NOT NULL            -- snapshot at move time; survives card rename
 *   from_status VARCHAR(20)   NOT NULL
 *   to_status   VARCHAR(20)   NOT NULL
 *   actor       VARCHAR(255)  NOT NULL DEFAULT 'anonymous'
 *   occurred_at TIMESTAMPTZ   NOT NULL DEFAULT NOW()  -- server-assigned
 *
 * Design notes:
 *   - `board_id` FK with ON DELETE CASCADE: activity is meaningless without its board, so deleting
 *     a board removes its activity atomically (mirrors cards → boards).
 *   - `card_id` deliberately has NO foreign key and `card_title` is a snapshot: the feed must remain
 *     readable after a card is renamed or deleted (AC-PERSIST-CARD-DELETE-1). A FK would force-delete
 *     or null history on card removal — exactly what we must avoid.
 *   - No DB CHECK/ENUM on the status columns — allowed values are enforced in the app's
 *     validate-before-DB layer (src/validation/card.ts), consistent with the cards `status` column
 *     (1781985941842_add-status-to-cards.js). The API is the sole writer.
 *   - `actor` ships as NOT NULL DEFAULT 'anonymous' so the schema is forward-compatible when auth
 *     lands (TASK-008 § Actor Identity, DECIDED: anonymous stub for v1) — no second migration needed.
 *
 * A composite index on `(board_id, occurred_at DESC, id DESC)` backs the board-scoped, newest-first
 * read (`GET /api/v1/boards/:boardId/activity`, `src/db/activity.ts listByBoard`) so the read NFR
 * (p95 < 150 ms) holds even as the table grows (retention decision 4A — bound the read with LIMIT,
 * leave the store unbounded; the index makes an ordered LIMIT scan sub-millisecond).
 *
 * Depends on the `boards` table (1781743422435_create-boards-table.js); the numeric prefix ordering
 * guarantees boards is created first.
 *
 * Driven by DATABASE_URL (12-Factor — no hardcoded DSN). Reversible: `down` drops the table (which
 * also drops its dependent index).
 *
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {void}
 */
exports.up = (pgm) => {
  pgm.createTable(
    'activity_events',
    {
      // `id: 'id'` is node-pg-migrate shorthand for SERIAL PRIMARY KEY.
      id: 'id',
      board_id: {
        type: 'integer',
        notNull: true,
        // FK to boards(id); CASCADE so a board delete removes its activity atomically.
        references: 'boards',
        onDelete: 'CASCADE',
      },
      // NO FK on card_id (intentional) so activity history survives card deletion.
      card_id: { type: 'integer', notNull: true },
      // Snapshot of the card title at move time — survives card rename/deletion.
      card_title: { type: 'varchar(255)', notNull: true },
      // Status values validated app-side (no DB CHECK), mirroring the cards.status column.
      from_status: { type: 'varchar(20)', notNull: true },
      to_status: { type: 'varchar(20)', notNull: true },
      // Forward-compatible with auth: defaults to 'anonymous' for the v1 stub.
      actor: { type: 'varchar(255)', notNull: true, default: 'anonymous' },
      occurred_at: {
        type: 'timestamptz',
        notNull: true,
        default: pgm.func('NOW()'),
      },
    },
    // Idempotent create so re-running against a partially-migrated DB is safe.
    { ifNotExists: true },
  );

  // Composite index backing the board-scoped, newest-first LIMIT read in listByBoard.
  pgm.createIndex(
    'activity_events',
    ['board_id', { name: 'occurred_at', sort: 'DESC' }, { name: 'id', sort: 'DESC' }],
    { ifNotExists: true },
  );
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {void}
 */
exports.down = (pgm) => {
  // Dropping the table also drops its dependent index.
  pgm.dropTable('activity_events', { ifExists: true });
};
