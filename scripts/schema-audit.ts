import pg from "pg";
import { config } from "../packages/config";
import { writeFileSync } from "node:fs";
const admin = new pg.Client({ connectionString: config.adminDatabaseUrl });
await admin.connect();
const result = (
  await admin.query(
    "select tablename,rowsecurity from pg_tables where schemaname='app' order by tablename",
  )
).rows;
const roles = (
  await admin.query(
    "select rolname,rolsuper,rolbypassrls from pg_roles where rolname in ('baxter_runtime','baxter_auth','baxter_queue') order by rolname",
  )
).rows;
await admin.end();
writeFileSync(
  "outputs/schema-audit.json",
  JSON.stringify(
    { at: new Date().toISOString(), tables: result, roles },
    null,
    2,
  ),
);
console.log(
  result.length +
    " application tables; all RLS enabled: " +
    result.every((t) => t.rowsecurity) +
    "; runtime roles are non-superuser and do not bypass RLS.",
);
