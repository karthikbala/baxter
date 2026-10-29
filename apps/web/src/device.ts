import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { api } from "./api";
export const native = Capacitor.isNativePlatform();
export async function enrolDevice(runId: string) {
  if (native) {
    const status = await api("/api/v1/devices");
    if (!status.nativeConfigured)
      throw new Error("Firebase push is not configured on this server yet.");
    const permission = await PushNotifications.requestPermissions();
    if (permission.receive !== "granted")
      throw new Error("Enable notifications in Android settings to continue.");
    await PushNotifications.createChannel({
      id: "baxter_critical_v1",
      name: "Critical shipment alerts",
      description: "Time-sensitive shipment exceptions",
      importance: 5,
      visibility: 1,
      sound: "critical_alert.wav",
      vibration: true,
    });
    await PushNotifications.createChannel({
      id: "baxter_updates_v1",
      name: "Shipment updates",
      importance: 3,
      visibility: 1,
    });
    return new Promise<any>((resolve, reject) => {
      let settled = false;
      const listeners: Array<{ remove: () => Promise<void> }> = [];
      const finish = async (error?: unknown, value?: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        await Promise.allSettled(
          listeners.map((listener) => listener.remove()),
        );
        if (error) reject(error);
        else resolve(value);
      };
      const timeout = setTimeout(
        () =>
          void finish(
            new Error(
              "FCM registration timed out. Confirm the Firebase Android configuration.",
            ),
          ),
        20000,
      );
      const register = async () => {
        listeners.push(
          await PushNotifications.addListener(
            "registration",
            async ({ value }) => {
              if (settled) return;
              try {
                await finish(
                  undefined,
                  await api("/api/v1/devices", {
                    runId,
                    label: "Android demo phone",
                    platform: "android",
                    channel: "native",
                    credential: { token: value },
                  }),
                );
              } catch (e) {
                await finish(e);
              }
            },
          ),
        );
        listeners.push(
          await PushNotifications.addListener(
            "registrationError",
            async (e) => {
              await finish(new Error(e.error));
            },
          ),
        );
        await PushNotifications.register();
      };
      void register().catch(finish);
    });
  }
  if (!window.isSecureContext)
    throw new Error(
      "Phone push requires trusted HTTPS. Open the secured demo URL first.",
    );
  if (!("serviceWorker" in navigator) || !("PushManager" in window))
    throw new Error(
      "Install this app on your Home Screen, then open it to enable notifications.",
    );
  const permission = await Notification.requestPermission();
  if (permission !== "granted")
    throw new Error(
      "Notification permission was not granted. You can enable it in browser settings.",
    );
  const { publicKey } = await api("/api/v1/devices");
  if (!publicKey)
    throw new Error("The server needs VAPID keys before push can be enabled.");
  const registration = await navigator.serviceWorker.ready;
  const padding = "=".repeat((4 - (publicKey.length % 4)) % 4);
  const raw = atob(
    (publicKey + padding).replaceAll("-", "+").replaceAll("_", "/"),
  );
  const key = Uint8Array.from(raw, (c) => c.charCodeAt(0));
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    try {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: key,
      });
    } catch {
      throw new Error(
        "This browser could not register for push. Use a regular browser window or the installed app, check your network, and retry.",
      );
    }
  }
  return api("/api/v1/devices", {
    runId,
    label: /iPhone|iPad/.test(navigator.userAgent)
      ? "iPhone PWA"
      : "Browser demo device",
    platform: /Android/.test(navigator.userAgent)
      ? "android"
      : /iPhone|iPad/.test(navigator.userAgent)
        ? "ios"
        : "desktop",
    channel: "web",
    credential: subscription.toJSON(),
  });
}
export async function nativeListeners(
  onPush: (data: any) => void,
  onOpen: (link: string) => void,
) {
  if (!native) return () => {};
  const r = await PushNotifications.addListener(
    "pushNotificationReceived",
    (n) => onPush(n.data),
  );
  const o = await PushNotifications.addListener(
    "pushNotificationActionPerformed",
    (n) => onOpen(n.notification.data?.link || "/cases"),
  );
  return () => {
    r.remove();
    o.remove();
  };
}
