self.addEventListener("push", (event) => {
  let payload = {
    title: "New signal",
    body: "Your mentor posted a trade signal.",
    icon: "/favicon.ico",
    url: "/student",
    tag: "daily-signal",
  };

  try {
    if (event.data) {
      payload = { ...payload, ...event.data.json() };
    }
  } catch {
    // keep defaults
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: payload.icon,
      tag: payload.tag,
      data: { url: payload.url },
      renotify: true,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url ?? "/student";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes(targetUrl) && "focus" in client) {
            return client.focus();
          }
        }

        if (self.clients.openWindow) {
          const absoluteUrl = targetUrl.startsWith("http")
            ? targetUrl
            : new URL(targetUrl, self.location.origin).href;
          return self.clients.openWindow(absoluteUrl);
        }

        return undefined;
      }),
  );
});
