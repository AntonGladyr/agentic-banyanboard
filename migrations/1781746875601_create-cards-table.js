/**
 * Migration: create the `cards` table (FEAT-004 / TASK-005 Phase 1).
 *
 * Adds the kanban `cards` domain table. Each card belongs to exactly one board
 * via the `board_id` foreign key (NOT NULL, ON DELETE CASCADE) — a card has no
 * meaning without its parent board, so deleting a board removes its cards
 * atomically. Schema mirrors the § cards Table Schema in
 * memory-bank/tasks/TASK-005.md exactly:
 *
 *   id          SERIAL       PRIMARY KEY
 *   board_id    INTEGER      NOT NULL REFERENCES boards(id) ON DELETE CASCADE
 *   title       VARCHAR(255) NOT NULL
 *   description TEXT
 *   position    INTEGER      NOT NULL DEFAULT 0
 *   created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
 *   updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
 *
 * An explicit index on `cards(board_id)` backs the board-scoped list query
 * (`GET /api/v1/boards/:boardId/cards`), which always filters by board_id.
 * (The FK alone does not create an index on the referencing column in Postgres.)
 *
 * Depends on the `boards` table (1781743422435_create-boards-table.js); the
 * numeric prefix ordering guarantees boards is created first.
 *
 * Driven by DATABASE_URL (12-Factor — no hardcoded DSN). Reversible: `down`
 * drops the table (which also drops its dependent index).
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
    'cards',
    {
      // `id: 'id'` is node-pg-migrate shorthand for SERIAL PRIMARY KEY.
      id: 'id',
      board_id: {
        type: 'integer',
        notNull: true,
        // FK to boards(id); CASCADE so a board delete removes its cards atomically.
        references: 'boards',
        onDelete: 'CASCADE',
      },
      title: { type: 'varchar(255)', notNull: true },
      // Optional free text; NULL serializes as `null` in API responses.
      description: { type: 'text', notNull: false },
      // Integer ordering within a board (default 0). Drag-and-drop algorithm
      // is out of scope; the column is added now to avoid a future migration.
      position: { type: 'integer', notNull: true, default: 0 },
      created_at: {
        type: 'timestamptz',
        notNull: true,
        default: pgm.func('NOW()'),
      },
      updated_at: {
        type: 'timestamptz',
        notNull: true,
        default: pgm.func('NOW()'),
      },
    },
    // Idempotent create so re-running against a partially-migrated DB is safe.
    { ifNotExists: true },
  );

  // Explicit index on the FK column — list queries filter by board_id.
  pgm.createIndex('cards', 'board_id', { ifNotExists: true });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {void}
 */
exports.down = (pgm) => {
  // Dropping the table also drops its dependent index.
  pgm.dropTable('cards', { ifExists: true });
};
