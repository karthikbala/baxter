import { spawnSync } from "node:child_process";
import { existsSync, copyFileSync, mkdirSync } from "node:fs";
const run = (cmd, args, options = {}) => {
  const r = spawnSync(cmd, args, { stdio: "inherit", ...options });
  if (r.status !== 0) process.exit(r.status || 1);
};
run("pnpm", ["build"]);
run("pnpm", ["exec", "cap", "sync", "android"]);
const sdk = process.env.ANDROID_HOME || process.cwd() + "/.local/android-sdk";
const jdk =
  process.env.JAVA_HOME ||
  "/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home";
if (!existsSync(sdk) || !existsSync(jdk))
  throw new Error(
    "Set ANDROID_HOME and JAVA_HOME to the installed Android SDK and JDK 21.",
  );
run("./gradlew", ["assembleDebug", "--console=plain"], {
  cwd: "android",
  env: { ...process.env, ANDROID_HOME: sdk, JAVA_HOME: jdk },
});
mkdirSync("outputs/android", { recursive: true });
copyFileSync(
  "android/app/build/outputs/apk/debug/app-debug.apk",
  "outputs/android/baxter-response-debug.apk",
);
console.log(
  "Debug APK ready at outputs/android/baxter-response-debug.apk. Configure Firebase and verify on a physical Android device before a live push demo.",
);
