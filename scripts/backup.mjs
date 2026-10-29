import "dotenv/config";
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
const url = process.env.DATABASE_ADMIN_URL;
if (!url)
  throw new Error("Provide DATABASE_ADMIN_URL via the process environment.");
const dir = process.env.BACKUP_DIR || ".local/backups";
mkdirSync(dir, { recursive: true, mode: 0o700 });
const file = join(
  dir,
  "baxter-" + new Date().toISOString().replaceAll(":", "-") + ".dump",
);
const r = spawnSync(
  "pg_dump",
  ["--format=custom", "--no-owner", "--file", file],
  { env: { ...process.env, PGDATABASE: url }, stdio: "inherit" },
);
if (r.status !== 0) process.exit(r.status || 1);
console.log("Backup written to " + file);
