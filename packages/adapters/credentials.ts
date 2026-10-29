import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { config } from "../config";
const key = () => createHash("sha256").update(config.authSecret).digest();
export function seal(value: unknown) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return {
    iv: iv.toString("base64"),
    data: data.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  };
}
export function unseal(value: { iv: string; data: string; tag: string }) {
  const cipher = createDecipheriv(
    "aes-256-gcm",
    key(),
    Buffer.from(value.iv, "base64"),
  );
  cipher.setAuthTag(Buffer.from(value.tag, "base64"));
  return JSON.parse(
    Buffer.concat([
      cipher.update(Buffer.from(value.data, "base64")),
      cipher.final(),
    ]).toString("utf8"),
  );
}
