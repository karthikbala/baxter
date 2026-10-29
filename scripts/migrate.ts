import { readdirSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { createHash } from "node:crypto";
import pg from "pg";
import { PgBoss } from "pg-boss";
import { config } from "../packages/config";
if (!config.adminDatabaseUrl)
  throw new Error("DATABASE_ADMIN_URL is required for reviewed migrations.");
const admin = new pg.Client({ connectionString: config.adminDatabaseUrl });
await admin.connect();
try {
  await admin.query("select pg_advisory_lock(738219)");
  await admin.query(
    "create table if not exists public.baxter_migrations(name text primary key, checksum text not null, applied_at timestamptz default now())",
  );
  for (const file of readdirSync("supabase/migrations")
    .filter((f) => /^\d{14}_[a-zA-Z0-9_-]+\.sql$/.test(f))
    .sort()) {
    const content = readFileSync("supabase/migrations/" + file, "utf8");
    const checksum = createHash("sha256").update(content).digest("hex");
    const existing = (
      await admin.query(
        "select checksum from public.baxter_migrations where name=$1",
        [file],
      )
    ).rows[0];
    if (existing) {
      if (existing.checksum !== checksum)
        throw new Error("Applied migration changed: " + file);
      continue;
    }
    await admin.query("BEGIN");
    try {
      await admin.query(content);
      await admin.query(
        "insert into public.baxter_migrations(name,checksum) values($1,$2)",
        [file, checksum],
      );
      await admin.query("COMMIT");
    } catch (e) {
      await admin.query("ROLLBACK");
      throw e;
    }
    console.log("Applied " + file);
  }
  const urls: Record<string, string> = {};
  for (const [role, password, variable] of [
    ["baxter_runtime", process.env.RUNTIME_DB_PASSWORD, "DATABASE_URL"],
    ["baxter_auth", process.env.AUTH_DB_PASSWORD, "AUTH_DATABASE_URL"],
    ["baxter_queue", process.env.QUEUE_DB_PASSWORD, "QUEUE_DATABASE_URL"],
  ]) {
    if (!password || !/^[a-zA-Z0-9_-]{24,}$/.test(password))
      throw new Error("Set a strong generated password for " + role);
    const exists = (
      await admin.query("select 1 from pg_roles where rolname=$1", [role])
    ).rowCount;
    if (!exists) await admin.query("create role " + role + " login");
    await admin.query(
      "alter role " +
        role +
        " with nosuperuser nocreatedb nocreaterole nobypassrls password '" +
        password +
        "'",
    );
    const url = new URL(config.adminDatabaseUrl);
    const suffix =
      url.hostname.includes("pooler.supabase.com") && url.username.includes(".")
        ? "." + url.username.split(".").slice(1).join(".")
        : "";
    url.username = role! + suffix;
    url.password = password;
    urls[variable!] = url.toString();
  }
  await admin.query(
    "grant usage on schema app to baxter_runtime; grant select,insert,update,delete on all tables in schema app to baxter_runtime; grant usage,select on all sequences in schema app to baxter_runtime",
  );
  await admin.query(
    "revoke insert,update,delete on app.memberships,app.tenants from baxter_runtime",
  );
  await admin.query(
    "grant usage on schema app_auth to baxter_auth; grant select,insert,update,delete on all tables in schema app_auth to baxter_auth",
  );
  await admin.query(
    "create schema if not exists pgboss authorization baxter_queue",
  );
  await admin.query("grant all on schema pgboss to baxter_queue");
  const databaseName = (
    await admin.query("select current_database() as name")
  ).rows[0].name.replaceAll('"', '""');
  await admin.query(
    'grant create on database "' + databaseName + '" to baxter_queue',
  );
  if (process.env.NODE_ENV !== "production") {
    let env = readFileSync(".env.local", "utf8");
    for (const [name, url] of Object.entries(urls)) {
      env = env.replace(new RegExp("^" + name + "=.*$", "m"), "");
      env += "\n" + name + "=" + url;
    }
    writeFileSync(".env.local", env + "\n", { mode: 0o600 });
    chmodSync(".env.local", 0o600);
  }
  const boss = new PgBoss({
    connectionString: urls.QUEUE_DATABASE_URL,
    schema: "pgboss",
  });
  boss.on("error", () => {});
  try {
    await boss.start();
    for (const name of ["outbox", "notification", "export"])
      await boss.createQueue(name, {
        retryLimit: 3,
        retryDelay: 5,
        retryBackoff: true,
      });
  } finally {
    await boss.stop();
    await admin.query(
      'revoke create on database "' + databaseName + '" from baxter_queue',
    );
  }
  console.log("Database roles and persistent job queues ready.");
} finally {
  await admin.query("select pg_advisory_unlock(738219)");
  await admin.end();
}
