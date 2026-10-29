import fs from "node:fs";
import { initializeApp, cert, deleteApp } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";

const path = process.argv[2] || process.env.FCM_CREDENTIALS_PATH;
if (!path)
  throw new Error("Provide the private Firebase credential file path.");
const credential = JSON.parse(fs.readFileSync(path, "utf8"));
const app = initializeApp({ credential: cert(credential) });
try {
  // Validation only: no device or topic subscriber receives this message.
  const id = await getMessaging(app).send(
    {
      topic: "baxter-configuration-validation",
      notification: {
        title: "Configuration validation",
        body: "Validation-only payload",
      },
      android: {
        priority: "high",
        notification: {
          channelId: "baxter_critical_v1",
          sound: "critical_alert",
        },
      },
    },
    true,
  );
  console.log(
    JSON.stringify({
      project: credential.project_id,
      fcmValidationPassed: !!id,
      deliveredToDevice: false,
    }),
  );
} catch (error) {
  // Firebase SDK errors can retain request Authorization headers in nested causes.
  console.error(
    JSON.stringify({
      project: credential.project_id,
      fcmValidationPassed: false,
      errorCode: error.code || "FCM_VALIDATION_FAILED",
    }),
  );
  process.exitCode = 1;
} finally {
  await deleteApp(app);
}
