import webpush from "web-push";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { readFileSync } from "node:fs";
import { config } from "../config";
import { transaction, one, rows, insert } from "../db";
import { scoped } from "../domain/service";
import { unseal } from "./credentials";
if (config.vapidPublic && config.vapidPrivate)
  webpush.setVapidDetails(
    config.vapidSubject,
    config.vapidPublic,
    config.vapidPrivate,
  );
export async function deliverNotification(job: {
  tenantId: string;
  runId: string;
  notificationId: string;
}) {
  const scope = { tenantId: job.tenantId, userId: "worker", role: "system" };
  const context = await transaction(scope, async (db) => {
    const run = await one(
      db,
      "select * from app.demo_runs where id=$1 and status='active'",
      [job.runId],
    );
    if (!run) return null;
    const n = await one(
      db,
      "select * from app.notifications where id=$1 and run_id=$2 for update",
      [job.notificationId, run.id],
    );
    if (
      !n ||
      ["provider_accepted", "no_device", "expired", "cancelled"].includes(
        n.status,
      )
    )
      return null;
    if (new Date(n.expires_at).getTime() < Date.now()) {
      await db.query(
        "update app.notifications set status='expired' where id=$1",
        [n.id],
      );
      return null;
    }
    const devices = await rows(
      db,
      "select * from app.devices where run_id=$1 and active and user_id=$2",
      [run.id, n.user_id],
    );
    await db.query("update app.notifications set status=$2 where id=$1", [
      n.id,
      devices.length ? "sending" : "no_device",
    ]);
    return { run, n, devices };
  });
  if (!context) return;
  const { run, n, devices } = context;
  let success = 0,
    transient = false;
  for (const device of devices) {
    let status = "failed",
      errorCode: string | null = null,
      providerId: string | null = null;
    try {
      const credential = unseal(device.credential);
      const data = {
        notificationId: n.id,
        runId: run.id,
        caseId: n.case_id || "",
        title: n.title,
        body: n.body,
        severity: n.severity,
        link: n.link + "&notification=" + n.id,
      };
      if (device.channel === "web") {
        if (!config.vapidPrivate)
          throw Object.assign(new Error("Web push unavailable"), {
            code: "VAPID_NOT_CONFIGURED",
          });
        const response = await webpush.sendNotification(
          credential,
          JSON.stringify(data),
          {
            TTL: 300,
            urgency: n.severity === "critical" ? "high" : "normal",
            timeout: 12000,
          },
        );
        providerId = String(response.statusCode);
      } else {
        if (!config.fcmCredentials)
          throw Object.assign(new Error("FCM unavailable"), {
            code: "FCM_NOT_CONFIGURED",
          });
        if (!getApps().length)
          initializeApp({
            credential: cert(
              JSON.parse(readFileSync(config.fcmCredentials, "utf8")),
            ),
          });
        providerId = await getMessaging().send({
          token: credential.token,
          notification: { title: n.title, body: n.body },
          data: Object.fromEntries(
            Object.entries(data).map(([k, v]) => [k, String(v)]),
          ),
          android: {
            priority: "high",
            ttl: 300000,
            notification: {
              channelId:
                n.severity === "critical"
                  ? "baxter_critical_v1"
                  : "baxter_updates_v1",
              sound: "critical_alert",
              tag: n.id,
            },
          },
        });
      }
      status = "provider_accepted";
      success++;
    } catch (e: any) {
      errorCode = String(e.statusCode || e.code || "DELIVERY_FAILED").slice(
        0,
        120,
      );
      transient =
        transient ||
        !["404", "410", "VAPID_NOT_CONFIGURED", "FCM_NOT_CONFIGURED"].includes(
          errorCode,
        );
      if (
        ["404", "410", "messaging/registration-token-not-registered"].includes(
          errorCode,
        )
      )
        await transaction(scope, (db) =>
          db.query("update app.devices set active=false where id=$1", [
            device.id,
          ]),
        );
    }
    await transaction(scope, (db) =>
      insert(
        db,
        "notification_attempts",
        scoped(run, {
          notification_id: n.id,
          device_id: device.id,
          status,
          provider: device.channel === "web" ? "Web Push" : "FCM",
          error_code: errorCode,
          provider_id: providerId,
        }),
      ),
    );
  }
  await transaction(scope, (db) =>
    db.query("update app.notifications set status=$2 where id=$1", [
      n.id,
      success ? "provider_accepted" : devices.length ? "failed" : "no_device",
    ]),
  );
  if (!success && transient) throw new Error("Push delivery retry required");
}
