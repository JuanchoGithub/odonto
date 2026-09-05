import { createClient, type Client } from '@libsql/client';

declare global {
  // eslint-disable-next-line no-var
  var __odontoClient: Client | undefined;
}

function getClient(): Client {
  if (globalThis.__odontoClient) return globalThis.__odontoClient;
  const url = process.env.TURSO_URL || 'file:./local.db';
  const authToken = process.env.TURSO_TOKEN || undefined;
  const client = createClient({ url, authToken });
  globalThis.__odontoClient = client;
  return client;
}

export const db = getClient();

export type Row = Record<string, unknown>;

// PRAGMA foreign_keys is per-connection in SQLite/libsql. The migration file
// sets it, but the runtime client never did — so FKs were silently unenforced.
// Ensure it once per process (best-effort; logs and continues on failure).
let fkEnsured = false;
async function ensureForeignKeys() {
  if (fkEnsured) return;
  try {
    await db.execute('PRAGMA foreign_keys = ON');
    fkEnsured = true;
  } catch {
    // Leave fkEnsured false so a later call retries.
  }
}

export async function query<T extends Row = Row>(
  sql: string,
  args: unknown[] = [],
): Promise<T[]> {
  await ensureForeignKeys();
  const res = await db.execute({ sql, args: args as never });
  return res.rows as unknown as T[];
}

export async function queryOne<T extends Row = Row>(
  sql: string,
  args: unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(sql, args);
  return rows[0] ?? null;
}

export async function execute(
  sql: string,
  args: unknown[] = [],
): Promise<{ lastInsertRowid: bigint | number | null; rowsAffected: number }> {
  await ensureForeignKeys();
  const res = await db.execute({ sql, args: args as never });
  return {
    lastInsertRowid: res.lastInsertRowid ?? null,
    rowsAffected: res.rowsAffected,
  };
}

export async function transaction(
  fn: (tx: {
    query: <T extends Row = Row>(sql: string, args?: unknown[]) => Promise<T[]>;
    queryOne: <T extends Row = Row>(
      sql: string,
      args?: unknown[],
    ) => Promise<T | null>;
    execute: (
      sql: string,
      args?: unknown[],
    ) => Promise<{ lastInsertRowid: bigint | number | null; rowsAffected: number }>;
  }) => Promise<void>,
): Promise<void> {
  await ensureForeignKeys();
  const tx = await db.transaction('write');
  try {
    await fn({
      query: async <T extends Row = Row>(sql: string, args: unknown[] = []) => {
        const res = await tx.execute({ sql, args: args as never });
        return res.rows as unknown as T[];
      },
      queryOne: async <T extends Row = Row>(sql: string, args: unknown[] = []) => {
        const res = await tx.execute({ sql, args: args as never });
        const rows = (res.rows as unknown as T[]);
        return (rows[0] ?? null) as T | null;
      },
      execute: async (sql: string, args: unknown[] = []) => {
        const res = await tx.execute({ sql, args: args as never });
        return {
          lastInsertRowid: res.lastInsertRowid ?? null,
          rowsAffected: res.rowsAffected,
        };
      },
    });
    await tx.commit();
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}
