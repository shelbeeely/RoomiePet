// RoomiePet's service worker: the app opens without a connection (the last
// house it saw), push notifications arrive while it is closed, and tapping
// one opens the app where it points. The API is never cached -- it is
// always the server's word.
const VERSION = "rp-35";
const SHELL = ["/", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/badge-96.png", "/sprites/sheet.png", "/sprites/sheet.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/")) return;

  // Pages: the network first (so updates arrive), the cached app when offline.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put("/", copy));
          return res;
        })
        .catch(() => caches.match("/")),
    );
    return;
  }
  // Built assets have hashed names and never change: the cache first.
  if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/icons/") || url.pathname.startsWith("/sprites/") || url.pathname.startsWith("/tapes/")) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(VERSION).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
  }
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "RoomiePet", body: event.data ? event.data.text() : "" };
  }
  const shown = self.registration.showNotification(data.title || "RoomiePet", {
    body: data.body || "",
    tag: data.tag,
    renotify: Boolean(data.tag),
    icon: "/icons/icon-192.png",
    badge: "/icons/badge-96.png",
    data: { url: data.url || "/" },
  });
  // The number on the app icon: how many chores are yours today (iOS 16.4+, Android, desktop).
  const badge =
    typeof data.badge === "number" && "setAppBadge" in self.navigator
      ? data.badge > 0 ? self.navigator.setAppBadge(data.badge) : self.navigator.clearAppBadge()
      : Promise.resolve();
  event.waitUntil(Promise.all([shown, badge.catch(() => {})]));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/", location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      const open = wins.find((w) => new URL(w.url).origin === location.origin);
      if (open) return open.focus().then((w) => (w && "navigate" in w && w.url !== target ? w.navigate(target) : w));
      return self.clients.openWindow(target);
    }),
  );
});
