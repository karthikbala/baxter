import { mkdirSync, writeFileSync } from "node:fs";
const base = "http://127.0.0.1:3001";
let cookie = "";
const results: any[] = [];
async function req(
  path: string,
  body?: any,
  expected = 200,
  extra: Record<string, string> = {},
) {
  const r = await fetch(base + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Origin: "http://localhost:5180",
      ...(cookie ? { cookie } : {}),
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...extra,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (r.headers.getSetCookie().length)
    cookie = r.headers
      .getSetCookie()
      .map((x) => x.split(";")[0])
      .join("; ");
  const j = await r.json();
  if (r.status !== expected)
    throw new Error(
      path + " expected " + expected + " received " + r.status + ": " + j.error,
    );
  results.push({ path, status: r.status });
  return j;
}
await req("/api/v1/bootstrap", undefined, 401);
await req("/api/demo-login", {});
const b = await req("/api/v1/bootstrap");
const runId = b.run.id;
for (const route of [
  "/customs",
  "/inventory",
  "/network",
  "/partners",
  "/data-quality",
  "/demo/status",
  "/devices",
])
  await req("/api/v1" + route);
await req("/api/v1/bootstrap", undefined, 403, {
  "x-tenant-id": "10000000-0000-4000-8000-000000000002",
});
await req(
  "/api/v1/devices",
  {
    runId,
    label: "Invalid provider test",
    platform: "desktop",
    channel: "web",
    credential: {
      endpoint: "https://127.0.0.1:3001",
      keys: { p256dh: "test", auth: "test" },
    },
  },
  400,
);
await req("/api/v1/voice/session", { runId: crypto.randomUUID() }, 409);
await req("/api/v1/demo/advance", { runId, hours: 2 }, 403, {
  Origin: "https://untrusted.example",
});
for (const scenario of ["S02", "S03", "S05", "S06", "S07", "S08"])
  await req("/api/v1/demo/trigger", {
    runId,
    scenario,
    commandId: crypto.randomUUID(),
  });
for (const format of ["csv", "xlsx"]) {
  const result = await req("/api/v1/exports", {
    runId,
    kind: "shipments",
    format,
    country: "FR",
  });
  const r = await fetch(base + result.url, { headers: { cookie } });
  if (!r.ok || result.rows !== 63) throw new Error("Export mismatch");
  const bytes = await r.arrayBuffer();
  results.push({ export: format, rows: result.rows, bytes: bytes.byteLength });
}
const status = await req("/api/v1/demo/status");
results.push({
  notificationStatuses: status.notifications.map((n: any) => n.status),
});
mkdirSync("outputs", { recursive: true });
writeFileSync(
  "outputs/http-verification.json",
  JSON.stringify({ at: new Date().toISOString(), results }, null, 2),
);
console.log(
  "Verified " +
    results.length +
    " authenticated route, rejection, scenario, and export checks.",
);
