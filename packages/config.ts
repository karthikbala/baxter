import dotenv from "dotenv";
import { resolve } from "node:path";
dotenv.config({ path: resolve(process.cwd(), ".env.local"), quiet: true });
const env = process.env;
export const config = {
  production: env.NODE_ENV === "production",
  port: Number(env.PORT || 3001),
  host: env.HOST || "127.0.0.1",
  appUrl: env.APP_URL || "http://localhost:5180",
  authSecret: env.AUTH_SECRET || "",
  databaseUrl: env.DATABASE_URL || env.DATABASE_ADMIN_URL || "",
  authDatabaseUrl: env.AUTH_DATABASE_URL || env.DATABASE_ADMIN_URL || "",
  queueDatabaseUrl: env.QUEUE_DATABASE_URL || env.DATABASE_ADMIN_URL || "",
  adminDatabaseUrl: env.DATABASE_ADMIN_URL || "",
  agentModel: env.OPENAI_AGENT_MODEL || "gpt-5.4",
  openaiKey: env.OPENAI_API_KEY || "",
  voiceModel: "gpt-live-transcribe",
  transcriptionModel: env.OPENAI_TRANSCRIPTION_MODEL || "gpt-transcribe",
  demoAccess: env.DEMO_ACCESS === "true" && env.NODE_ENV !== "production",
  demoPassword: env.DEMO_PASSWORD || "",
  vapidPublic: env.VAPID_PUBLIC_KEY || "",
  vapidPrivate: env.VAPID_PRIVATE_KEY || "",
  vapidSubject: env.VAPID_SUBJECT || "mailto:demo@example.com",
  fcmCredentials: env.FCM_CREDENTIALS_PATH || "",
  fileRoot: resolve(env.FILE_ROOT || ".local/files"),
};
export const DEMO_TENANT = "10000000-0000-4000-8000-000000000001";
export const SECOND_TENANT = "10000000-0000-4000-8000-000000000002";
