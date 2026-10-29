import { diagnosticError, diagnosticPath } from "../../../packages/diagnostics";
const seen = new Map<string, number>();
let sent = 0;
export function reportError(error: unknown, source: "render" | "window" | "promise" | "api", requestId?: string, status?: number) {
  if (sent >= 30) return;
  const detail = diagnosticError(error);
  const event = { ...detail, source, path: diagnosticPath(location.pathname), requestId, status,
    release: "1.0.7", clientTime: new Date().toISOString() };
  const key = JSON.stringify([source, event.path, detail, status]);
  const now = Date.now();
  if (now - (seen.get(key) || 0) < 30000) return;
  seen.set(key, now);
  sent++;
  const base = import.meta.env.VITE_API_URL || localStorage.getItem("baxter-server-url") || "";
  // Separate transport: telemetry failures must never recursively report themselves.
  void fetch(base + "/api/client-errors", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(event), keepalive: true, credentials: "omit" }).catch(() => {});
}
export function installErrorReporting() {
  window.addEventListener("error", e => reportError(e.error || new Error("Script error"), "window"));
  window.addEventListener("unhandledrejection", e => reportError(e.reason, "promise"));
}
