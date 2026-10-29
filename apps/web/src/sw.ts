/// <reference lib="webworker" />
import {
  precacheAndRoute,
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
} from "workbox-precaching";
import { registerRoute, NavigationRoute } from "workbox-routing";
import { clientsClaim } from "workbox-core";
declare const self: ServiceWorkerGlobalScope;
precacheAndRoute(self.__WB_MANIFEST);
if (import.meta.env.PROD)
  registerRoute(
    new NavigationRoute(createHandlerBoundToURL("/index.html"), {
      denylist: [/^\/api\//, /^\/downloads(?:\/|$)/],
    }),
  );
cleanupOutdatedCaches();
self.skipWaiting();
clientsClaim();
// API responses are deliberately not cached: exception evidence must be current.
self.addEventListener("push", (event) => {
  if (!event.data) return;
  const p = event.data.json();
  event.waitUntil(
    (async () => {
      await self.registration.showNotification(p.title, {
        body: p.body,
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        tag: p.notificationId,
        requireInteraction: p.severity === "critical",
        data: p,
      });
      const clients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of clients) client.postMessage({ type: "push", ...p });
      // Best effort authenticated report. Provider acceptance alone is not a device receipt.
      for (const kind of ["received", "displayed"])
        await fetch("/api/v1/notifications/" + p.notificationId + "/events", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ runId: p.runId, kind }),
        }).catch(() => {});
    })(),
  );
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const p = event.notification.data;
  event.waitUntil(
    (async () => {
      const url = new URL(p.link || "/", self.location.origin);
      if (url.origin !== self.location.origin) return;
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const client = windows[0] as WindowClient | undefined;
      if (client) {
        await client.navigate(url.href);
        await client.focus();
      } else await self.clients.openWindow(url.href);
    })(),
  );
});
