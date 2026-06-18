/**
 * Migration: create the `boards` table (FEAT-005 / TASK-004 Phase 1).
 *
 * Establishes the canonical `boards` table — the FK target for `cards.board_id`
 * in the downstream Card model (FEAT-004). Schema mirrors the § boards Table
 * Schema in memory-bank/tasks/TASK-004.md exactly:
 *
 *   id          SERIAL       PRIMARY KEY
 *   name        VARCHAR(255) NOT NULL
 *   description TEXT
 *   created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
 *   updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
 *
 * This is the project's first migration; it also establishes node-pg-migrate as
 * the canonical schema-evolution path (driven by DATABASE_URL, 12-Factor — no
 * hardcoded DSN). Reversible: `down` drops the table.
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
    'boards',
    {
      // `id: 'id'` is node-pg-migrate shorthand for SERIAL PRIMARY KEY.
      id: 'id',
      name: { type: 'varchar(255)', notNull: true },
      // Optional free text; NULL serializes as `null` in API responses.
      description: { type: 'text', notNull: false },
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
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {void}
 */
exports.down = (pgm) => {
  pgm.dropTable('boards', { ifExists: true });
};
