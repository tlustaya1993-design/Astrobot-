# Billing charge flow — analysis (read-only + proposed minimal fix)

**Ветка:** `chore/billing-charge-analysis-v1`  
**Статус:** анализ + минимальный код без миграции (не в `main` до merge).

---

## Текущая модель (до правки в ветке)

Поля `users`: `requestsUsed` (бесплатная квота), `requestsBalance` (платные пакеты).

| Шаг | Когда | Что происходит |
|-----|--------|----------------|
| 1 | До стрима | `canAffordRequest` — проверка |
| 2 | До стрима | **`requestsBalance` уменьшается** (`getBalanceAfterCharge`) |
| 3 | До стрима | insert user message |
| 4 | Стрим | LLM |
| 5 | Успех | `requestsUsed += requestCost`, insert assistant |
| 6 | Ошибка стрима | `rollbackRequestsBalance` + SSE error |

### Риск (P1)

Между шагами **2** и **5** процесс может упасть → баланс уже списан, `requestsUsed` не вырос, ответа нет.

Бесплатная квота (`requestsUsed`) до успеха **не** трогается — риск в основном для **платного balance**.

### Что уже закрыто

- **SWE 503** до списания (`main`, коммит SWE gate).
- **Rollback** при ошибке внутри stream `catch`.
- **Удаление user message** + rollback в top-level handler.

### Что не закрыто без миграции

- Crash между pre-debit balance и success `requestsUsed`.
- Клиент `!res.body` при HTTP 200: сервер мог уже списать balance (до правки в ветке).

---

## Минимальный fix (в этой ветке, без pending table)

**Идея:** не менять `requestsBalance` до успешного завершения стрима. На успехе — одним `update`: `requestsUsed += cost` и `requestsBalance = getBalanceAfterCharge(...)`.

| Шаг | После fix |
|-----|-----------|
| До стрима | только `canAffordRequest` + user message |
| Успех | balance + used вместе |
| Ошибка | rollback balance по сути no-op; user message удаляется как раньше |

**Не решает:** два инстанса API без Redis in-flight (см. `CURRENT_STATE.md`).

---

## Рекомендация после merge

1. Проверить на staging: ошибка стрима → balance не меняется.
2. Успешный ответ → balance и used как раньше по смыслу.
3. Pending table — только если понадобится аудит или multi-instance charge.

---

## Ручная проверка

1. Пользователь с платным balance: отправить вопрос → успех → balance уменьшился, used вырос.
2. Симулировать 503 SWE (если возможно) → balance не изменился.
3. (Опционально) оборвать стрим / 500 → balance не должен уменьшиться после fix.
