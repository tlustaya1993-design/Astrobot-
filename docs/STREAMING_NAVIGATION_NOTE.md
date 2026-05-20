# Technical note: streaming при навигации между чатами

**Статус:** черновик на согласование PR (не реализовано).  
**Ограничения:** без Stop в v1; не ломать server-side background generation.

---

## Проблема

1. Пользователь отправляет сообщение в чат A.
2. Уходит в чат B (или список) до конца стрима.
3. Сегодня: `useEffect` в `Chat.tsx` вызывает `clearLocalMessages()` при смене `conversationId` → UI теряет локальный стрим.
4. Сервер часто **продолжает** генерацию и пишет assistant message в БД (by design при disconnect).

Итог: ответ есть в БД, но UX «пропал»; `isStreaming` в hook глобальный — может блокировать отправку в чате B.

---

## Цель

- **Не abort** fetch при обычной навигации.
- Не строить полноценный «stream manager» с очередями, воркерами и UI для всех диалогов.
- Минимальный diff, совместимый с текущим server behavior.

---

## Что НЕ делаем (v1)

- `AbortController` при unmount / смене route.
- Кнопка Stop.
- Отдельный WebSocket / второй канал.
- Глобальная очередь сообщений по всем conversations.

---

## Предлагаемый минимальный diff

### Идея

Привязать активный стрим к **`targetConversationId`** того запроса, который его открыл. UI чата показывает streaming-состояние **только если** `activeStreamConversationId === conversationId` (или null на `/chat` без id).

### Файлы

| Файл | Изменение |
|------|-----------|
| `artifacts/astrobot/src/hooks/use-chat-stream.ts` | Ref/state: `streamingForConversationId`, `isStreaming` → производный или разделить «глобально идёт запрос» vs «этот чат показывает спиннер». Не abort при unmount. По `done` / error — `invalidateQueries` для **того** `targetId`, не текущего route. |
| `artifacts/astrobot/src/pages/Chat.tsx` | Убрать или сузить `clearLocalMessages()` на смене `conversationId`: не сбрасывать глобальный стрим; при монтировании чата B — `localMessages` пустые из query, B не blocked если стрим привязан к A. Disable composer: `isStreaming && streamingForConversationId === conversationId` (или `streamingForConversationId != null` — уточнить продуктово). |
| (опционально) `use-chat-stream.ts` | Expose `streamingConversationId` для индикатора «ответ дописывается в другом чате» — **не обязательно в v1**. |

**Оценка объёма:** ~60–100 строк, 2 файла. Без новых модулей.

---

## Почему это не «полноценный stream manager»

- Один активный HTTP stream на вкладку (как сейчас).
- Нет Map из N параллельных стримов — server `inFlight` всё равно один запрос на session.
- Нет персистентной очереди — только корректная привязка UI + invalidate после завершения.

---

## Совместимость с server background generation

| Server behavior | Клиент v1 |
|---------------|-----------|
| Дописывает ответ после disconnect | OK — fetch живёт, по завершении invalidate чата A |
| `inFlight` блокирует второй запрос той же session | OK — пока стрим A идёт, B может показать «подожди» или disabled send **для всей session** (текущее поведение throttle). Продуктово приемлемо в v1 |
| Списание balance до стрима | Без изменений в этом PR |
| Rollback на stream error | Без изменений |

**Риск:** пользователь в B не может отправить, пока A стримится — **то же**, что сейчас с глобальным `isStreaming`. Улучшение session-level параллелизма — не в v1.

---

## Поведение по сценариям

| Сценарий | Ожидание v1 |
|----------|-------------|
| A стримит, остаёмся в A | Как сейчас |
| A стримит, переходим в B | B без локального пузыря A; composer B: disabled если session in-flight (как сейчас) или только если привязали стрим к A — **согласовать** |
| A стримит, возврат в A до конца | Видим локальный стрим, если не очистили; иначе после invalidate — сообщения из API |
| A стримит, возврат в A после конца | Полный ответ из `useGetOpenaiConversation` после invalidate |
| Ошибка сети на A | Ошибка в A при возврате; invalidate не помогает — local error state привязан к A |

**Рекомендация v1:** `isStreaming` блокирует send **глобально** (проще, без обхода throttle). Улучшение «писать в B пока A в фоне» — отдельное решение с server.

---

## Проверка (QA)

1. Отправить длинный вопрос в чат A → сразу открыть чат B → дождаться 60s → вернуться в A → ответ в истории.
2. Во время стрима A попытаться send в B → ожидаемое сообщение throttle / disabled (зафиксировать фактическое).
3. Network offline mid-stream → ошибка, retry в A.
4. Новый чат с `/chat` во время стрима A → нет краша, нет чужих пузырей.

---

## Альтернативы (отклонены для v1)

| Альтернатива | Почему нет |
|--------------|------------|
| Abort on navigation | Теряем ответ при живом server |
| Не invalidate, только local | Рассинхрон с БД |
| Отдельный hook instance per Chat mount | Сложнее, дубли state |

---

## После согласования

1. Реализовать PR «streaming navigation v1» по таблице файлов выше.
2. Обновить `DECISIONS.md` D-009 статусом «реализовано».
3. Затем — scroll/jank (отдельный PR).
