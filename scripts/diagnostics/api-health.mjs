#!/usr/bin/env node
/**
 * Проверка GET /healthz. Короткое имя файла — удобно вводить в PowerShell в одну строку.
 *
 *   node scripts/diagnostics/api-health.mjs
 *   node scripts/diagnostics/api-health.mjs https://astroai.site
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
  console.log("Скрипт запущен. Если «тишина» — идёт сетевой запрос (до 20 сек).\n");

  const base = normalizeBase(raw);
  const healthUrl = new URL("/healthz", `${base}/`);

  if (/sitenode/i.test(healthUrl.hostname)) {
    console.error(
      "Похоже на опечатку в домене: «…sitenode» вместо «…site». Правильно: https://astroai.site\n" +
        "(Часто к адресу прилипает слово node из команды — вводите URL вручную или копируйте только https://astroai.site)\n",
    );
  }

  console.log(`URL: ${healthUrl.href}`);
  console.log("Запрос…\n");

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
    console.log("\nОк: до API достучались.");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`Ошибка запроса: ${msg}\n`);
    console.error(`Частые причины «Load failed» / Failed to fetch в чате:
  1) Бэкенд не запущен или упал (локально: поднимите api-server, проверьте PORT).
  2) Неверный адрес: фронт на одном домене, API на другом — нужен VITE_API_BASE_URL при сборке фронта (см. artifacts/astrobot/src/main.tsx).
  3) DNS / сеть / VPN / блокировщик.
  4) Смешанный контент: HTTPS-страница и HTTP-API на другом хосте.

Полный смоук чата: задайте E2E_BASE_URL и запустите test:e2e:smoke (см. package.json).
`);
    process.exit(1);
  }
}

main();
