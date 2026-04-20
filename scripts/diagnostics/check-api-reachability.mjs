#!/usr/bin/env node
/**
 * Проверка, что бэкенд отвечает (GET /healthz). Без вызова LLM.
 *
 *   node scripts/diagnostics/check-api-reachability.mjs
 *   node scripts/diagnostics/check-api-reachability.mjs https://ваш-домен.ru
 *   CHECK_API_BASE=https://ваш-домен.ru node scripts/diagnostics/check-api-reachability.mjs
 *
 * Полный поток чата (SSE + создание диалога): см. pnpm run test:e2e:smoke и E2E_BASE_URL.
 */

/* eslint-disable no-console */

const raw =
  process.env.CHECK_API_BASE?.trim() ||
  process.argv[2]?.trim() ||
  "http://127.0.0.1:3000";

function normalizeBase(s) {
  let u = s.replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(u)) u = `http://${u}`;
  return u;
}

async function main() {
  const base = normalizeBase(raw);
  const healthUrl = new URL("/healthz", `${base}/`);

  console.log(`Проверка API: ${healthUrl.href}\n`);

  try {
    const res = await fetch(healthUrl, {
      method: "GET",
      signal: AbortSignal.timeout(20_000),
    });
    const text = await res.text();
    console.log(`HTTP ${res.status}`);
    console.log(text.length > 300 ? `${text.slice(0, 300)}…` : text);
    if (!res.ok) {
      console.error("\n/healthz вернул не OK — смотрите логи сервера и переменные окружения.");
      process.exit(1);
    }
    console.log("\nОк: до API достучались. Если в браузере всё равно «Load failed» — см. подсказку ниже.");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`Ошибка запроса: ${msg}\n`);
    console.error(`Частые причины «Load failed» / Failed to fetch в чате:
  1) Бэкенд не запущен или упал (локально: поднимите api-server, проверьте PORT).
  2) Неверный адрес: фронт открыт с одного origin, а API на другом — нужен VITE_API_BASE_URL
     при сборке фронта (см. artifacts/astrobot/src/main.tsx) и доступный с браузера URL API.
  3) DNS / сеть / VPN / блокировщик — домен не резолвится или порт закрыт.
  4) Смешанный контент: страница по HTTPS, API по HTTP на другом хосте — браузер может блокировать.

Полный смоук чата (создание диалога + SSE): E2E_BASE_URL="${base}" pnpm run test:e2e:smoke
`);
    process.exit(1);
  }
}

main();
