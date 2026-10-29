import { expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { diagnosticError, diagnosticPath } from "../packages/diagnostics";
import { createErrorLog } from "../apps/api/diagnostics";
it("keeps useful crash locations without raw exception text or URL secrets", () => {
  const result = diagnosticError({ name: "TypeError", message: "secret-password is not a function", stack: "TypeError: secret-password\n at x (https://host/assets/index-abc.js:8:123)\n at secret-token" });
  expect(result).toEqual({ name: "TypeError", category: "not_callable", frames: ["/assets/index-abc.js:8:123"] });
  expect(diagnosticPath("/assistant?token=secret")).toBe("/assistant");
  expect(diagnosticPath("/private-email@example.com")).toBe("other");
});
it("persists structured errors independently of container lifetime", () => {
  const dir = mkdtempSync(join(tmpdir(), "baxter-errors-"));
  try {
    createErrorLog(dir, { error: () => {} })({ event: "client_error", category: "not_callable" });
    const record = JSON.parse(readFileSync(join(dir, "errors.jsonl"), "utf8"));
    expect(record.event).toBe("client_error");
    expect(record.timestamp).toBeTruthy();
  } finally { rmSync(dir, { recursive: true }); }
});
