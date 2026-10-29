import pg from "pg";
import { config } from "../config";
const { Pool } = pg;
export const pool = new Pool({
  connectionString: config.databaseUrl,
  max: 10,
  connectionTimeoutMillis: 5000,
  statement_timeout: 15000,
  application_name: "baxter-api",
});
export type Db = pg.PoolClient;
export type Scope = {
  tenantId: string;
  userId: string;
  runId?: string;
  role: string;
};
export async function transaction<T>(
  scope: Scope,
  fn: (db: Db) => Promise<T>,
): Promise<T> {
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    // Serialize a tenant transaction with reset and concurrent decisions. Different tenants remain independent.
    if (scope.tenantId)
      await db.query("select pg_advisory_xact_lock(hashtext($1))", [
        scope.tenantId,
      ]);
    await db.query(
      "select set_config('app.tenant_id',$1,true), set_config('app.user_id',$2,true)",
      [scope.tenantId, scope.userId],
    );
    const result = await fn(db);
    await db.query("COMMIT");
    return result;
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  } finally {
    db.release();
  }
}
export async function one<T = any>(
  db: Db,
  sql: string,
  values: unknown[] = [],
): Promise<T | undefined> {
  return (await db.query(sql, values)).rows[0];
}
export async function rows<T = any>(
  db: Db,
  sql: string,
  values: unknown[] = [],
): Promise<T[]> {
  return (await db.query(sql, values)).rows;
}
export async function insert(
  db: Db,
  table: string,
  data: Record<string, unknown>,
) {
  if (!/^[a-z_]+$/.test(table)) throw new Error("Invalid table");
  const keys = Object.keys(data);
  if (keys.some((k) => !/^[a-z_]+$/.test(k))) throw new Error("Invalid column");
  const vals = keys.map((k) => data[k]);
  const sql =
    "insert into app." +
    table +
    " (" +
    keys.join(",") +
    ") values (" +
    keys.map((_, i) => "$" + (i + 1)).join(",") +
    ") returning *";
  return (await db.query(sql, vals)).rows[0];
}
export async function activeRun(db: Db, tenantId: string) {
  const run = await one(
    db,
    "select * from app.demo_runs where tenant_id=$1 and status='active' order by created_at desc limit 1",
    [tenantId],
  );
  if (!run)
    throw Object.assign(
      new Error("No active demo run. Start a fresh demo in Demo studio."),
      { statusCode: 409 },
    );
  return run;
}
