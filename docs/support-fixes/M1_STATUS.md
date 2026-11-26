# Support M1 — статус (staging)

Дата фиксации: **2026-11-26**. Scope: in-app Support intake UX + auto-reply + durable n8n intake на **staging only**. Production freeze сохранён.

---

## Итог

| Пункт | Статус |
|-------|--------|
| M1 на `astrobot-dev` | **Готово** |
| Merge в `dev` | PR [#196](https://github.com/tlustaya1993-design/Astrobot-/pull/196), hotfix [#197](https://github.com/tlustaya1993-design/Astrobot-/pull/197) |
| Production (`astrobot` / `main` / `astroai.site`) | **Не трогали** |
| Production GO | **Не запрошен** — отдельный шаг |

---

## Коммиты и deploy

| Ref | Что |
|-----|-----|
| `ad1db86` | Merge PR #196 — `feat(support): M1 intake UX + auto-reply` |
| `340f6c6` | Merge PR #197 — `fix(db): intake columns before retry index on legacy support_tickets` |
| Active deploy | `5d900264-a3ff-45f8-99cf-8ef7a7763d23` · service **astrobot-dev** · branch **`dev`** · commit **`340f6c6`** · **SUCCESS** |
| Frontend asset | `index-CkfpFOfE.js` |
| Prod service `astrobot` | всё ещё `main` @ `815b0eb` (PR #195) — без изменений |

### Hotfix bootstrap (PR #197)

На legacy Postgres `CREATE TABLE IF NOT EXISTS support_tickets` не добавлял `intake_*` колонки; partial index `support_tickets_intake_retry_idx` падал → `Database migrations failed` → API `DB_INIT_FAILED` / `/api/*` 503.

Исправление: в `lib/db/src/bootstrap-schema.ts` перед индексом — `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` для `intake_delivered_at`, `intake_attempts`, `intake_next_retry_at`, `intake_last_error`.

---

## Проверки (staging)

| Проверка | Результат |
|----------|-----------|
| Ветка `astrobot-dev` | `dev` (было `cursor/support-notify-owner-chat-ea9d` @ `43ce841`) |
| `/api/healthz` | 200 `{"status":"ok"}` |
| `/api/readyz` | 200 `{"status":"ready"}` |
| Логи deploy | `Database migrations complete`, intake retry poller started |
| Smoke `POST /api/support/tickets` | **201** · ticket **#18** · marker `[E2E-M1] 2026-11-26T11:22:44.062Z…` |
| `autoReply` | присутствует (текст автоответа в JSON) |
| `intakeDeliveredAt` | `2026-11-26T11:22:45.000Z` |
| `intakeDelivered` | `true` |
| n8n staging | `n8nTicketId` **30** · workflow copy `ytqvmACITyJZPiZf` execution **#410** |
| Сообщение auto-reply в треде | system / source `system` |

Smoke session: `e2e-m1-16b06a92-5b0e-4523-bc9c-f389faec4cf1`  
Артефакт ответа: `agent-tools/e2e_m1_smoke_out.json` (локально у агента).

---

## Staging / n8n границы (не нарушать без GO)

- App staging: `https://astrobot-dev-production.up.railway.app`
- n8n staging copy: `ytqvmACITyJZPiZf` (Postgres **account 2** `iKR2gtW8KrYkYPrr`)
- Owner TG (staging prefs): account 2 / chat `656328649` / префикс `[ТЕСТ]`
- **Не трогать:** Production workflow `C0gRzhwM97kQIvev`, Postgres account 1, `astroai.site`, сервис `astrobot`, ветка `main`

---

## Оставшиеся пункты

1. **Production GO** — отдельное решение владельца: merge `dev`→`main` / deploy `astrobot` / prod n8n — только после явного GO.
2. **M2** — не начинать в рамках M1.
3. **Тикеты 15–28** (и smoke #18) — **не удалять**, пока владелец не скажет.
4. **TEMP n8n** `5MmEbKKdnV4vdPmO` (upsert smoke) — удалить/архивировать после явной очистки.
5. **Railway UI в браузере** — опционально: нужен логин владельца в dashboard (проверка MCP уже достаточна).
6. **Durable retry / no external_ref dupes** — upsert на staging ранее проверен отдельно; полный re-run после hotfix не блокирует закрытие M1, можно повторить при желании.
7. **Need Info / owner bridge E2E end-to-end в TG** — вне минимального M1 smoke (auto-reply + intake); при необходимости отдельный прогон.

---

## Ссылки

- Upsert SQL: [`n8n-create-ticket-upsert.sql`](./n8n-create-ticket-upsert.sql)
- Операционный снимок: [`../CURRENT_STATE.md`](../CURRENT_STATE.md)
