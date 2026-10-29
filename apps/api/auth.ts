import { betterAuth } from "better-auth";
import { bearer } from "better-auth/plugins";
import pg from "pg";
import { config } from "../../packages/config";
if (!config.authSecret || config.authSecret.length < 32)
  throw new Error("AUTH_SECRET must be configured. Run pnpm setup locally.");
export const authPool = new pg.Pool({
  connectionString: config.authDatabaseUrl,
  options: "-c search_path=app_auth",
  max: 5,
});
export const auth = betterAuth({
  appName: "Baxter Response",
  secret: config.authSecret,
  baseURL: config.appUrl,
  basePath: "/api/auth",
  database: authPool,
  emailAndPassword: {
    enabled: true,
    disableSignUp: process.env.SEED_AUTH !== "true",
    minPasswordLength: 12,
  },
  trustedOrigins: [
    config.appUrl,
    ...(!config.production
      ? ["http://localhost:5180", "http://127.0.0.1:5180"]
      : []),
    "capacitor://localhost",
    "https://localhost",
  ],
  session: { expiresIn: 60 * 60 * 12, updateAge: 60 * 30 },
  advanced: {
    cookiePrefix: "baxter",
    useSecureCookies: config.appUrl.startsWith("https://"),
  },
  plugins: [bearer()],
  logger: { level: "error" },
});
