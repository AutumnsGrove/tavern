/**
 * Local D1 wrapper. Implements enough of the D1Database interface
 * using better-sqlite3 for the CLI to work. Cast aggressively —
 * this is a dev tool, not production code.
 */

import Database from "better-sqlite3";

export function createLocalD1(dbPath: string): D1Database {
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  function prepare(query: string): D1PreparedStatement {
    let bindings: unknown[] = [];

    const stmt: D1PreparedStatement = {
      bind(...values: unknown[]) {
        bindings = values;
        return stmt;
      },
      first(colName?: string) {
        const s = db.prepare(query);
        const row = s.get(...bindings) as Record<string, unknown> | undefined;
        if (!row) return Promise.resolve(null);
        if (colName) return Promise.resolve(row[colName] ?? null);
        return Promise.resolve(row);
      },
      all() {
        const s = db.prepare(query);
        const rows = s.all(...bindings);
        return Promise.resolve({
          results: rows,
          success: true,
          meta: { duration: 0, last_row_id: 0, changes: 0, served_by: "local", changed_db: false, size_after: 0, rows_read: rows.length, rows_written: 0 },
        });
      },
      run() {
        const s = db.prepare(query);
        const result = s.run(...bindings);
        return Promise.resolve({
          results: [],
          success: true,
          meta: {
            duration: 0,
            last_row_id: Number(result.lastInsertRowid),
            changes: result.changes,
            served_by: "local",
            changed_db: result.changes > 0,
            size_after: 0,
            rows_read: 0,
            rows_written: result.changes,
          },
        });
      },
      raw() {
        const s = db.prepare(query);
        return Promise.resolve(s.raw().all(...bindings));
      },
    } as unknown as D1PreparedStatement;

    return stmt;
  }

  return {
    prepare,
    batch(statements: D1PreparedStatement[]) {
      return Promise.all(statements.map((s) => s.run()));
    },
    exec(query: string) {
      db.exec(query);
      return Promise.resolve({ count: 0, duration: 0 });
    },
    dump() {
      throw new Error("dump not supported in local D1");
    },
  } as unknown as D1Database;
}
