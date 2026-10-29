import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from "node:fs";
import { join } from "node:path";
export function createErrorLog(directory: string, logger: { error: (...args: any[]) => void }) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const file = join(directory, "errors.jsonl");
  return (event: Record<string, unknown>) => {
    const record = { ...event, timestamp: new Date().toISOString() };
    logger.error(record, "Application diagnostic");
    try {
      if (existsSync(file) && statSync(file).size >= 10 * 1024 * 1024) {
        for (let i = 2; i >= 1; i--) if (existsSync(file + "." + i)) renameSync(file + "." + i, file + "." + (i + 1));
        renameSync(file, file + ".1");
      }
      appendFileSync(file, JSON.stringify(record) + "\n", { mode: 0o600 });
    } catch {
      logger.error({ event: "diagnostic_storage_failed" }, "Diagnostic file unavailable; event remains in container logs");
    }
  };
}
