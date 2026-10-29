import fs from "node:fs";
import assert from "node:assert/strict";
import dotenv from "dotenv";

// An explicit private env file keeps credentials out of arguments and output.
const env = dotenv.parse(fs.readFileSync(process.argv[2]));
const base = env.APP_URL;
const hostname = new URL(base).hostname;
const results = [];
let cookie = "";
let browserCookies = [];
async function req(path, body, expected = 200, extra = {}) {
  const r = await fetch(base + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Origin: base,
      ...(cookie ? { cookie } : {}),
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...extra,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(90000),
  });
  const set = r.headers.getSetCookie();
  if (set.length) {
    cookie = set.map((c) => c.split(";")[0]).join("; ");
    browserCookies = set.map((c) => {
      const pair = c.split(";")[0],
        at = pair.indexOf("=");
      return {
        name: pair.slice(0, at),
        value: pair.slice(at + 1),
        domain: hostname,
        path: "/",
        expires: -1,
        httpOnly: /httponly/i.test(c),
        secure: /secure/i.test(c),
        sameSite: "Lax",
      };
    });
  }
  assert.equal(r.status, expected, path);
  results.push({ path, status: r.status });
  return r.headers.get("content-type")?.includes("json") ? r.json() : r.text();
}
await req("/");
await req("/manifest.webmanifest");
await req("/sw.js");
await req("/api/health");
const config = await req("/api/public-config");
assert.equal(config.demoAccess, false);
await req("/api/v1/bootstrap", undefined, 401);
await req("/api/auth/sign-in/email", {
  email: "alex@baxter.example",
  password: env.DEMO_PASSWORD,
});
fs.mkdirSync(".local/deploy", { recursive: true });
fs.writeFileSync(
  ".local/deploy/browser-state.json",
  JSON.stringify({ cookies: browserCookies, origins: [] }),
  { mode: 0o600 },
);
const initial = await req("/api/v1/bootstrap");
assert.equal(initial.stats.shipments, 500);
const runId = initial.run.id;
for (const path of [
  "/customs",
  "/inventory",
  "/network",
  "/partners",
  "/data-quality",
  "/devices",
])
  await req("/api/v1" + path);
await req("/api/v1/bootstrap", undefined, 403, {
  "x-tenant-id": "10000000-0000-4000-8000-000000000002",
});
await req("/api/v1/demo/advance", { runId, hours: 1 }, 403, {
  Origin: "https://untrusted.example",
});
const status = await req("/api/v1/demo/status");
assert.equal(status.capabilities.worker, true, "worker heartbeat");
const s01 = await req("/api/v1/demo/trigger", {
  runId,
  scenario: "S01",
  commandId: crypto.randomUUID(),
});
const detail = await req("/api/v1/cases/" + s01.caseId);
assert.equal(detail.impact.shortageUnits, 3000);
assert.equal(detail.impact.orderExposure, 60000);
const assistant = await req("/api/v1/assistant", {
  runId,
  caseId: s01.caseId,
  message:
    "Explain the stock gap and the feasible transfer option in two sentences.",
});
assert.equal(assistant.mode, "live");
const voice = await req("/api/v1/voice/session", { runId });
assert.ok(voice.value, "ephemeral voice session");
const exportJob = await req("/api/v1/exports", {
  runId,
  kind: "shipments",
  format: "csv",
  country: "FR",
});
assert.equal(exportJob.rows, 63);
await req(exportJob.url);
const report = {
  at: new Date().toISOString(),
  url: base,
  checks: results,
  shipments: 500,
  workerHeartbeat: true,
  s01: { gapUnits: 3000, exposure: 60000 },
  openai: {
    mode: assistant.mode,
    model: assistant.model,
    text: assistant.text,
  },
  voice: { ephemeralSessionCreated: true, model: voice.model },
  nativePushConfigured: status.capabilities.nativePush,
};
fs.writeFileSync(
  "outputs/deployment-verification.json",
  JSON.stringify(report, null, 2),
);
console.log(
  JSON.stringify({
    url: base,
    checks: results.length,
    worker: true,
    liveOpenAI: true,
    voiceSession: true,
  }),
);
