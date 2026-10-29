// Deliberately retain locations and categories, never arbitrary exception text.
export function diagnosticPath(value: string): string {
  const path = value.split(/[?#]/)[0];
  if (/^\/cases\/[0-9a-f-]{36}$/i.test(path)) return path;
  if (/^\/(?:cases|shipments|customs|inventory|network|partners|data-quality|demo|profile|assistant)?$/.test(path)) return path;
  return "other";
}
export function diagnosticError(error: unknown) {
  const e = error as { name?: string; message?: string; stack?: string } | null;
  const name = ["TypeError", "ReferenceError", "RangeError", "SyntaxError", "NetworkError", "AbortError"].includes(e?.name || "") ? e!.name! : "Error";
  const message = typeof e?.message === "string" ? e.message : "";
  const category = /is not a function/.test(message) ? "not_callable"
    : /Cannot read|undefined|null/.test(message) ? "missing_value"
    : /fetch|network|Failed to load/i.test(message) ? "network"
    : "unexpected";
  const frames = (typeof e?.stack === "string" ? e.stack : "").split("\n").slice(1)
    .map(line => line.match(/(?:\/assets\/[\w.-]+\.js|\/apps\/web\/src\/[\w./-]+\.[tj]sx?|\/app\/[\w./-]+\.js):\d+:\d+/)?.[0])
    .filter((frame): frame is string => !!frame).slice(0, 12);
  return { name, category, frames };
}
