import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  chmodSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";
const root = process.cwd();
const dir = resolve(root, ".local/postgres");
const socket = resolve(root, ".local/socket");
const passwordFile = resolve(root, ".local/postgres-password");
const envFile = resolve(root, ".env.local");
mkdirSync(resolve(root, ".local"), { recursive: true, mode: 0o700 });
mkdirSync(socket, { recursive: true, mode: 0o700 });
if (!existsSync(passwordFile))
  writeFileSync(passwordFile, randomBytes(24).toString("hex"), { mode: 0o600 });
const password = readFileSync(passwordFile, "utf8").trim();
const run = (cmd, args, quiet = false) => {
  const r = spawnSync(cmd, args, {
    encoding: "utf8",
    stdio: quiet ? "pipe" : "inherit",
  });
  if (r.error)
    throw new Error(
      cmd +
        " is required. Install PostgreSQL or use the Docker Compose development profile.",
    );
  return r;
};
if (process.argv[2] === "stop") {
  if (existsSync(dir + "/PG_VERSION"))
    run("pg_ctl", ["-D", dir, "stop", "-m", "fast"]);
  process.exit(0);
}
if (!existsSync(dir + "/PG_VERSION")) {
  const r = run(
    "initdb",
    [
      "-D",
      dir,
      "-U",
      "baxter_admin",
      "--auth-host=scram-sha-256",
      "--auth-local=trust",
      "--pwfile=" + passwordFile,
      "--encoding=UTF8",
      "--no-locale",
    ],
    true,
  );
  if (r.status !== 0)
    throw new Error("Unable to initialize isolated PostgreSQL: " + r.stderr);
}
if (run("pg_ctl", ["-D", dir, "status"], true).status !== 0) {
  const r = run(
    "pg_ctl",
    [
      "-D",
      dir,
      "-l",
      resolve(root, ".local/postgres.log"),
      "-o",
      "-p 57432 -h 127.0.0.1 -k " + JSON.stringify(socket),
      "start",
    ],
    true,
  );
  if (r.status !== 0)
    throw new Error("PostgreSQL start failed; inspect .local/postgres.log.");
}
let content = existsSync(envFile) ? readFileSync(envFile, "utf8") : "";
const url =
  "postgresql://baxter_admin:" + password + "@127.0.0.1:57432/postgres";
if (!/^DATABASE_ADMIN_URL=/m.test(content))
  content += "\nDATABASE_ADMIN_URL=" + url + "\n";
writeFileSync(envFile, content, { mode: 0o600 });
chmodSync(envFile, 0o600);
console.log(
  "Isolated PostgreSQL ready on 127.0.0.1:57432; connection stored in .env.local.",
);
