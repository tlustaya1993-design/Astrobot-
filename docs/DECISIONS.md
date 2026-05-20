# AstroBot — зафиксированные решения

Журнал архитектурных и продуктовых решений. Новые пункты добавляются с ID `D-0xx`. При изменении поведения — обновлять запись, не удалять историю.

---

## D-001 — Свежий астроконтекст в system prompt

**Решение:** На каждый запрос чата пересобирается system prompt с актуальными расчётами. Сообщения assistant с astro-разбором в history подменяются заглушкой, чтобы не тащить устаревшие дома.

**Где:** `conversations.ts` — `buildSystemPrompt`, фильтр `isAstroAssistantMessage`.

---

## D-002 — Расширенный режим по контакту и стоимость

**Решение:** `contactExtendedMode` на conversation; в теле сообщения передаётся boolean. Стоимость: база 1 (короткое 2 при ≥1200 символов); с контактом extended — ×2 или 3 (не 4) при длинном+extended.

**Где:** `conversations.ts` message handler; UI `Chat.tsx`.

---

## D-003 — SSE + batching + AstroMarkdown reveal

**Решение:** Стрим SSE; клиент батчит ~30ms; markdown через `AstroMarkdown` с memo на завершённых блоках; опциональный character reveal для UX.

**Tradeoff:** Доп. ререндеры и scroll — отдельная оптимизация (после streaming navigation).

---

## D-004 — Railway: один сервис API + SPA

**Решение:** Prod — Express раздаёт API и `FRONTEND_DIST`. Не Replit artifacts.

**Где:** `railway.toml`, `app.ts`.

---

## D-005 — Сессия: JWT или x-session-id

**Решение:** `sessionMiddleware` выставляет `req.sessionId` из Bearer или `x-session-id`. Маршруты сами решают, блокировать ли без session.

**Исключение (исправлено):** `POST /api/astrology/synastry` теперь требует `x-session-id` как `/natal`.

---

## D-006 — Replit не используется в prod

**Решение:** Файлы `.replit` / `artifact.toml` — legacy, не источник деплоя.

---

## D-007 — In-flight lock: in-memory, Redis условно

**Решение (2026-05):** `markInFlight` / `clearInFlight` только in-process. Redis используется для **interval** throttle между запросами.

**Условие:** При **2+ репликах** API — внедрить Redis in-flight; при **1 реплике** — зафиксировать в `CURRENT_STATE.md`, Redis lock не делать.

**Статус:** Число реплик — **уточнить у владельца**.

---

## D-008 — SWE gate до списания (вариант A)

**Решение (2026-05):** Если `SWE_AVAILABLE === false`, ответ **503 JSON** до `markInFlight`, debit balance и insert user message.

**Где:** `conversations.ts` POST `.../messages`.

---

## D-009 — Стриминг при навигации: не abort

**Решение (2026-05):** Обычная навигация между чатами **не** обрывает fetch (не `AbortController` on unmount). Server-side generation в фоне сохраняется.

**Реализация:** См. черновик [`STREAMING_NAVIGATION_NOTE.md`](./STREAMING_NAVIGATION_NOTE.md) — после согласования note.

**Не в scope note v1:** кнопка Stop.

---

## D-010 — Лимит 8000 на клиенте

**Решение (2026-05):** Send disabled и `handleSend` return при `length > 8000`; сервер 413 остаётся.

---

## D-011 — Context switch modal

**Решение (2026-05):** z-index 200+ и закрытие History/Profile при показе модалки «Продолжить / Новый чат».

---

## D-012 — Prompt changes

**Решение (2026-05):** Любые правки `buildSystemPrompt` только после **read-only Prompt Behavior Audit** и отдельного согласования. Не смешивать с stabilization PR.

---

## D-013 — Billing atomicity

**Решение (2026-05):** Сначала анализ + минимальный fix **без миграции**. Таблица pending charges — только по отдельному согласованию.
