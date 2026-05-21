# AstroBot — текущее состояние (операционное)

Краткий снимок для разработки и деплоя. Обновляется по мере стабилизации. См. также [`DECISIONS.md`](./DECISIONS.md), [`PROJECT_CONTEXT.md`](./PROJECT_CONTEXT.md).

---

## Деплой

| Параметр | Значение |
|----------|----------|
| Прод-хостинг | **Railway** (не Replit) |
| Конфиг | [`railway.toml`](../railway.toml), [`nixpacks.toml`](../nixpacks.toml) |
| Ветка | `main` → auto-deploy с GitHub |
| Сервис | Один процесс: API + static SPA (`FRONTEND_DIST` / `artifacts/astrobot/dist/public`) |
| Health | `GET /api/healthz` |
| Схема БД | При старте API: `runDbMigrations` (`lib/db/src/migrations.ts`). **Не** `drizzle-kit push` в preDeploy — зависает на introspection. |

**Legacy (не использовать для prod):** `.replit`, `artifacts/*/.replit-artifact/` — остатки Replit, на Railway не влияют.

---

## Инфраструктура — уточнить у владельца

| Вопрос | Статус | Влияние |
|--------|--------|---------|
| Число **реплик** API на Railway | **Уточнить** | Если **1** — `inFlight` lock in-memory достаточен. Если **2+** — нужен Redis lock для in-flight (см. DECISIONS D-007). |
| Upstash Redis (`UPSTASH_REDIS_*`) | Уточнить | Interval throttle; при падении Redis — fallback in-memory per instance. |
| Swiss Ephemeris при старте | Логи `[SwissEph]` | `SWE_AVAILABLE=false` → 503 на сообщение (gate до списания, PR1). |

---

## Известные риски (трекер)

| ID | Статус | Описание |
|----|--------|----------|
| R-SWE | **Исправлено (PR1)** | Ранний выход при недоступном SWE без cleanup |
| R-8K | **Исправлено (PR2)** | Клиент отправлял >8000 при активной кнопке |
| R-BODY | **Частично (PR2)** | Пустой `res.body` → явная ошибка на клиенте; server charge — см. billing analysis |
| R-CTX | **Исправлено (PR2)** | Модалка смены контакта под sheet’ами |
| R-BILL | Открыт | Split: `requestsBalance` до стрима, `requestsUsed` после успеха |
| R-STR | Открыт | Навигация сбрасывает local stream; server может дописать в БД — см. [`STREAMING_NAVIGATION_NOTE.md`](./STREAMING_NAVIGATION_NOTE.md) |
| R-SCR | Отложен | Scroll/jank во время стрима — после streaming |
| R-PRM | Аудит | Качество ответов после «чистки» промпта — read-only audit, без правок до согласования |

---

## Чат — лимиты UI

- Счётчик символов: с **3000** (`CHAR_COUNTER_THRESHOLD`).
- Максимум: **8000** (`MAX_CHAT_MESSAGE_CHARS`); кнопка Send disabled при превышении; `handleSend` early return.
- Сервер: **413** при >8000 (дублирующая защита).

---

## Z-index (оверлеи)

Снизу вверх (приблизительно): PWA banner ~45 → Profile 64–65 → Context switch **200–201** → History 150–151 → Contact profile 260–270 → Paywall **400–410** → Tutorial **500**.

При открытии модалки смены контакта закрываются History и Profile sheet.

---

## API: сессия

- Продуктовая сессия: **`x-session-id`** (после onboarding) и опционально **JWT** (`Authorization: Bearer`).
- Email/login — для памяти и стабильности, не обязателен для базового чата.
- `POST /api/astrology/synastry` — требует **`x-session-id`** (как `/natal`), без обязательного login.

Синастрия в **чате** считается в `buildSystemPrompt`, не через этот endpoint.

---

## Следующие шаги (согласованный порядок)

1. ~~PR1 SWE gate~~  
2. ~~PR2 client fixes + synastry header~~  
3. ~~PR3 docs~~  
4. Technical note streaming → согласование PR  
5. Billing analysis (без pending table без отдельного OK)  
6. Prompt behavior audit (read-only)
