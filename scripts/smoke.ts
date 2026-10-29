import { writeFileSync } from "node:fs";
const base = "http://127.0.0.1:3001";
let cookies = "";
async function call(path: string, body?: any) {
  const r = await fetch(base + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Origin: "http://localhost:5180",
      ...(cookies ? { cookie: cookies } : {}),
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const set = r.headers.getSetCookie();
  if (set.length) cookies = set.map((c) => c.split(";")[0]).join("; ");
  const j = await r.json();
  if (!r.ok) throw new Error(path + ": " + r.status + " " + j.error);
  return j;
}
await call("/api/demo-login", {});
const initial = await call("/api/v1/bootstrap");
const runId = initial.run.id;
const command = async (scenario: string) =>
  call("/api/v1/demo/trigger", {
    runId,
    scenario,
    commandId: crypto.randomUUID(),
  });
const s01 = await command("S01");
const detail = await call("/api/v1/cases/" + s01.caseId);
if (
  detail.impact.shortageUnits !== 3000 ||
  detail.impact.orderExposure !== 60000
)
  throw new Error("Stock fixture mismatch");
const text = await call("/api/v1/assistant", {
  runId,
  caseId: s01.caseId,
  message:
    "Explain the stock gap, exposed order value, and the feasible next action. Keep it brief.",
});
const voice = await call("/api/v1/voice/session", { runId });
const report = {
  at: new Date().toISOString(),
  api: "ok",
  s01: {
    gapDays: detail.impact.gapDays,
    units: detail.impact.shortageUnits,
    exposure: detail.impact.orderExposure,
  },
  openai: { mode: text.mode, model: text.model, text: text.text },
  voice: { ephemeralSessionCreated: !!voice.value, model: voice.model },
};
writeFileSync("outputs/api-smoke.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
