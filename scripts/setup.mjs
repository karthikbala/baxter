import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, chmodSync } from "node:fs";
import webpush from "web-push";
import { randomBytes } from "node:crypto";
const exec = (command, args) => {
  const r = spawnSync(command, args, { stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status || 1);
};
exec("node", ["scripts/local-postgres.mjs", "start"]);
let env = readFileSync(".env.local", "utf8");
const vapid = webpush.generateVAPIDKeys();
const defaults = {
  VAPID_PUBLIC_KEY: vapid.publicKey,
  VAPID_PRIVATE_KEY: vapid.privateKey,
  AUTH_SECRET: randomBytes(32).toString("hex"),
  DEMO_PASSWORD: randomBytes(20).toString("hex"),
  RUNTIME_DB_PASSWORD: randomBytes(24).toString("hex"),
  QUEUE_DB_PASSWORD: randomBytes(24).toString("hex"),
  AUTH_DB_PASSWORD: randomBytes(24).toString("hex"),
  APP_URL: "http://localhost:5180",
  PORT: "3001",
  HOST: "127.0.0.1",
  DEMO_ACCESS: "true",
  NODE_ENV: "development",
  OPENAI_AGENT_MODEL: "gpt-5.4",
};
for (const [key, value] of Object.entries(defaults))
  if (!new RegExp("^" + key + "=", "m").test(env))
    env += "\n" + key + "=" + value;
writeFileSync(".env.local", env + "\n", { mode: 0o600 });
chmodSync(".env.local", 0o600);
exec("pnpm", ["db:migrate"]);
exec("pnpm", ["db:seed"]);
console.log(
  "Local setup complete. Run pnpm dev, then open http://localhost:5180.",
);
