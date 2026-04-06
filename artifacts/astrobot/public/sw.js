/**
 * Минимальный SW: только сброс старых кэшей и активация.
 * Перехват fetch отключён — на мобильных сетях он ломал загрузку HTML/чанков
 * (ошибка до появления записи в кэше → белый экран).
 */
const CACHE_NAME = "astrobot-v14";

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});
