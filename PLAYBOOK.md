# AstroBot — Project Playbook

> Актуально на: апрель 2026. Источник: GitHub `tlustaya1993-design/Astrobot-` (main).
> Используй `@PLAYBOOK.md` в Cursor для контекста.

---

## 1. Продукт

**AstroBot** — русскоязычный AI-астролог (PWA). Пользователь вводит данные рождения, получает персонализированный астрологический чат, ежедневный прогноз, синастрийный анализ с близкими.

- **Домен**: `astroai.site` (Cloudflare → Railway)
- **Монетизация**: YooKassa, пакеты запросов (5 бесплатных, потом оплата)
- **Язык интерфейса**: русский

---

## 2. Технологический стек

| Слой | Технология |
|------|-----------|
| Frontend | React 18 + Vite, TypeScript, Tailwind CSS, Framer Motion |
| Роутинг | Wouter |
| State/Data | TanStack Query |
| Backend | Express.js, TypeScript |
| БД | PostgreSQL + Drizzle ORM |
| AI (чат) | `claude-sonnet-4-6` через `lib/integrations-anthropic-ai/` |
| AI (память/прогноз) | `claude-haiku-4-5` |
| Астрология | Placidus дома, transit/synastry |
| Оплата | YooKassa (Россия) |
| Хостинг | Railway |
| CDN/DNS | Cloudflare |
| Монорепо | pnpm workspaces |

---

## 3. Структура монорепо

```
/
├── artifacts/
│   ├── astrobot/          # Frontend PWA
│   │   └── src/
│   │       ├── pages/         # Роуты
│   │       ├── components/
│   │       │   ├── billing/   # PaywallSheet
│   │       │   ├── chat/      # Чат-компоненты
│   │       │   ├── layout/
│   │       │   ├── profile/
│   │       │   └── ui/        # shadcn/ui
│   │       ├── context/       # AuthContext, AvatarSyncContext
│   │       └── lib/           # session, api helpers
│   └── api-server/        # Backend Express
│       └── src/
│           ├── routes/
│           │   ├── auth.ts
│           │   ├── billing.ts
│           │   ├── contacts.ts
│           │   ├── users.ts
│           │   ├── astrology.ts
│           │   └── openai/
│           │       ├── conversations.ts  # Chat + streaming
│           │       └── daily-forecast.ts
│           └── lib/
│               ├── billing-policy.ts
│               ├── yookassa.ts
│               └── logger.ts
└── lib/
    ├── db/src/schema/     # Drizzle схемы
    └── integrations-anthropic-ai/  # AI клиент
```

---

## 4. Страницы (роуты)

| Путь | Компонент | Описание |
|------|-----------|----------|
| `/` | `Home` | Лендинг / стартовый экран |
| `/onboarding` | `Onboarding` | 3-шаговый онбординг (имя, дата рождения, место) |
| `/chat` | `Chat` | Новый чат |
| `/chat/:id` | `Chat` | Существующий разговор |
| `/profile` | `ProfilePage` | Профиль пользователя |
| `/history` | `History` | История разговоров |
| `/auth/callback` | `AuthCallback` | OAuth callback |
| `/billing/test` | `BillingTestPage` | Тест оплаты (только при `VITE_ENABLE_BILLING_TEST=true`) |

---

## 5. База данных — схемы

### `users`
| Поле | Тип | Описание |
|------|-----|----------|
| `id` | serial PK | |
| `session_id` | text UNIQUE | Анонимный идентификатор |
| `email` | text UNIQUE nullable | При регистрации |
| `password_hash` | text nullable | bcrypt |
| `name` | text | Имя |
| `birth_date` | text | ISO дата рождения |
| `birth_time` | text | Время рождения |
| `birth_time_unknown` | boolean default false | Время неизвестно |
| `birth_place` | text | Название места |
| `birth_lat/lng` | doublePrecision | Координаты |
| `avatar_json` | text | JSON аватара |
| `gender` | text | |
| `language` | text default "ru" | |
| `onboarding_done` | boolean | |
| `tone_preferred_depth` | text | Глубина ответов |
| `tone_preferred_style` | text | Стиль |
| `tone_emotional_sensitivity` | text | |
| `tone_familiarity_level` | text | |
| `requests_balance` | integer default 0 | Купленные запросы |
| `requests_used` | integer default 0 | Использованные (бесплатные) |
| `created_at / updated_at` | timestamp | |

### `conversations`
| Поле | Тип | Описание |
|------|-----|----------|
| `id` | serial PK | |
| `session_id` | text | Владелец |
| `title` | text | Название чата |
| `contact_id` | integer nullable | FK → contacts (синастрия) |
| `created_at / updated_at` | timestamp | |

### `messages`
| Поле | Тип | Описание |
|------|-----|----------|
| `id` | serial PK | |
| `conversation_id` | integer FK | |
| `role` | text | "user" / "assistant" |
| `content` | text | |
| `created_at` | timestamp | |

### `contacts`
| Поле | Тип | Описание |
|------|-----|----------|
| `id` | serial PK | |
| `session_id` | text | Владелец |
| `name` | text | |
| `relation` | text | Тип связи (partner, friend, …) |
| `birth_date / time / place` | text | Данные рождения |
| `birth_lat / lng` | doublePrecision | |
| `avatar_json` | text | JSON аватара |
| `created_at / updated_at` | timestamp | |

### `memories`
| Поле | Тип | Описание |
|------|-----|----------|
| `id` | serial PK | |
| `session_id` | text | |
| `content` | text | Факт/воспоминание |
| `type` | text | Категория |
| `created_at` | timestamp | |

### `payments`
| Поле | Тип | Описание |
|------|-----|----------|
| `id` | serial PK | |
| `session_id` | text | |
| `provider` | text default "yookassa" | |
| `provider_payment_id` | text UNIQUE | ID в YooKassa |
| `app_payment_id` | text UNIQUE | Внутренний UUID |
| `package_code` | text | pack10/30/50/100 |
| `credits_granted` | integer | Кол-во запросов |
| `amount_rub` | text | Сумма в рублях |
| `currency` | text default "RUB" | |
| `status` | text default "pending" | pending/succeeded/canceled |
| `description` | text | |
| `webhook_verified` | boolean | Подпись вебхука проверена |
| `credits_applied_at` | timestamp nullable | Когда начислено |
| `metadata` | jsonb | |
| `created_at / updated_at` | timestamp | |

---

## 6. Платёжная система (YooKassa)

### Пакеты запросов
| Код | Название | Цена | Запросов |
|-----|----------|------|----------|
| `pack10` | Старт | 349 ₽ | 10 |
| `pack30` | Стандарт | 799 ₽ | 30 |
| `pack50` | Про | 1 149 ₽ | 50 |
| `pack100` | Макс | 1 799 ₽ | 100 |

### Логика billing-policy
- `FREE_REQUESTS_LIMIT` = 5 (env `FREE_REQUESTS_QUOTA`, default 5)
- `UNLIMITED_REQUEST_EMAILS` — comma-separated emails, которым всё бесплатно
- Если `requests_used >= FREE_REQUESTS_LIMIT` и `requests_balance == 0` → API возвращает `402`
- Frontend показывает `PaywallSheet` при получении 402

### Антифрод / дросселирование
- Per-session: минимум 2500ms между созданием платежей
- Per-IP: max 45 попыток за 60 секунд (sliding window)

### Эндпоинты оплаты
```
POST /billing/create                   — создать платёж YooKassa
POST /billing/webhook                  — YooKassa webhook (начислить credits)
GET  /billing/status/:appPaymentId     — статус платежа
```

---

## 7. API эндпоинты

### Auth (`/auth`)
```
POST /auth/register    — регистрация (email + password)
POST /auth/login       — вход
POST /auth/logout      — выход
GET  /auth/me          — текущий пользователь
```

### Users (`/users`)
```
GET   /users/me        — профиль
PATCH /users/me        — обновить профиль (имя, дата, место, тон и пр.)
```

### Conversations (`/openai/conversations`)
```
GET    /openai/conversations           — список чатов (с contactName/contactRelation)
POST   /openai/conversations           — создать чат
GET    /openai/conversations/:id       — чат + история сообщений
DELETE /openai/conversations/:id       — удалить
POST   /openai/conversations/:id/chat  — отправить сообщение (SSE streaming)
```

### Contacts (`/contacts`)
```
GET    /contacts       — список контактов
POST   /contacts       — добавить контакт
PATCH  /contacts/:id   — обновить
DELETE /contacts/:id   — удалить
```

### Astrology (`/astrology`)
```
GET /astrology/chart     — натальная карта
GET /astrology/synastry  — синастрия с контактом
```

### Daily Forecast (`/openai/daily-forecast`)
```
GET /openai/daily-forecast — ежедневный прогноз (SSE streaming)
```

---

## 8. Авторизация

- **Анонимный режим**: `sessionId` в localStorage → заголовок `x-session-id`
- **JWT**: после регистрации/логина → `Authorization: Bearer <token>` + `x-session-id`
- Все запросы используют `getAuthHeaders()` из `lib/session.ts`
- `AuthContext` — состояние авторизации в React
- `AvatarSyncContext` — синхронизация аватара между компонентами

---

## 9. AI интеграция

- **Библиотека**: `lib/integrations-anthropic-ai/`
- **Чат**: `claude-sonnet-4-6` — стриминг через SSE
- **Память и прогноз**: `claude-haiku-4-5` — быстрее и дешевле
- **AstroMarkdown**: компонент для рендеринга ответов Claude (не сырой HTML, не `#`-заголовки)
- Промпт включает: натальную карту, воспоминания, историю сообщений, транзиты текущего дня

---

## 10. Фронтенд — ключевые компоненты

### Chat (`/chat`)
- `HistoryDrawer` — история чатов (левый drawer); синастрийные чаты = двойной аватар
- `PeoplePanel` — список контактов для синастрии (правый drawer)
- `DailyForecastCard` — карточка прогноза вверху чата
- `AstroMarkdown` — рендеринг ответов AI
- `PaywallSheet` — показывается при 402 (лимит исчерпан)
- `ChatSidebar` — боковая панель на десктопе
- `SynastryRowAvatars` — двойной аватар в истории

### Billing
- `PaywallSheet` — выбор пакета → создание платежа → редирект на YooKassa → callback на `/auth/callback`

### Profile
- `ProfileSheet` — шторка профиля (**не трогать, редизайн Cursor**)
- `ProfilePage` — страница профиля `/profile`

---

## 11. Environment Variables

| Переменная | Где | Описание |
|-----------|-----|----------|
| `DATABASE_URL` | Railway | PostgreSQL |
| `JWT_SECRET` | Railway | Секрет JWT |
| `YOOKASSA_SHOP_ID` | Railway | ID магазина |
| `YOOKASSA_SECRET_KEY` | Railway | Ключ YooKassa |
| `ANTHROPIC_API_KEY` | Railway | Claude API |
| `FREE_REQUESTS_QUOTA` | Railway | Кол-во бесплатных запросов (default 5) |
| `UNLIMITED_REQUEST_EMAILS` | Railway | Comma-separated emails без лимита |
| `VITE_ENABLE_BILLING_TEST` | Railway/Vite | `"true"` = показать /billing/test |

---

## 12. Правила для Cursor

### Что НЕ трогать без прямого указания
- `AstroAvatar.tsx` — кастомный редизайн
- `ProfileSheet.tsx` — кастомный редизайн
- `PeoplePanel.tsx` — кастомный редизайн
- Страницы оплаты (YooKassa) — финансовая логика

### Кодстайл
- TypeScript строгий, без `any`
- Ответы Claude рендерить через `AstroMarkdown`, не через `<p>` или `dangerouslySetInnerHTML`
- При добавлении полей в БД: `ALTER TABLE … ADD COLUMN IF NOT EXISTS` или `pnpm --filter @workspace/db run push-force`
- Стриминг: SSE через `res.write()`, не WebSocket

### Известные баги (проверить перед закрытием)
- [ ] `requests_used` может не инкрементироваться в некоторых edge-cases — проверить в `conversations.ts` после стриминга
- [ ] Pre-existing TS-ошибки на `req.sessionId`, `requestsUsed` — не трогать, они намеренно игнорируются

---

## 13. Деплой

```
GitHub main → Railway (auto-deploy) → astroai.site (Cloudflare)
```

- Push в `main` = автодеплой на Railway
- Cloudflare проксирует весь трафик (TLS + кеш)
- `_railway-verify` TXT-запись добавлена в Cloudflare вручную

### Команды
```bash
# Локальная разработка
pnpm --filter @workspace/astrobot run dev
pnpm --filter @workspace/api-server run dev

# Применить изменения схемы БД
pnpm --filter @workspace/db run push-force
```

---

## 14. Playwright E2E тесты (спецификация)

### T1: Онбординг
```typescript
test('onboarding flow', async ({ page }) => {
  await page.goto('/');
  await page.fill('[data-testid="name-input"]', 'Тестовый');
  await page.click('[data-testid="next-step"]');
  await page.fill('[data-testid="birth-date"]', '15.06.1993');
  await page.click('[data-testid="next-step"]');
  await page.fill('[data-testid="birth-place"]', 'Москва');
  await page.click('[data-testid="complete-onboarding"]');
  await expect(page).toHaveURL('/chat');
});
```

### T2: Регистрация
```typescript
test('register and login', async ({ page }) => {
  await page.goto('/chat');
  await page.click('[data-testid="auth-button"]');
  await page.fill('[data-testid="email-input"]', 'test@example.com');
  await page.fill('[data-testid="password-input"]', 'password123');
  await page.click('[data-testid="register-submit"]');
  await expect(page.locator('[data-testid="user-avatar"]')).toBeVisible();
});
```

### T3: Чат со стримингом
```typescript
test('send message and receive streaming response', async ({ page }) => {
  await page.goto('/chat');
  await page.fill('[data-testid="chat-input"]', 'Расскажи про мой Асцендент');
  await page.click('[data-testid="send-button"]');
  await expect(page.locator('[data-testid="assistant-message"]')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('[data-testid="send-button"]')).toBeEnabled({ timeout: 30000 });
});
```

### T4: Синастрия
```typescript
test('synastry flow', async ({ page }) => {
  await page.goto('/chat');
  await page.click('[data-testid="people-panel-toggle"]');
  await page.click('[data-testid="add-contact"]');
  await page.fill('[data-testid="contact-name"]', 'Партнёр');
  await page.fill('[data-testid="contact-birth-date"]', '01.01.1990');
  await page.click('[data-testid="save-contact"]');
  await page.click('[data-testid="contact-item"]:first-child');
  await expect(page.locator('[data-testid="synastry-badge"]')).toBeVisible();
});
```

### T5: PaywallSheet при лимите
```typescript
test('paywall shown when limit reached (402)', async ({ page }) => {
  // Пользователь с requests_used >= 5 и balance == 0
  await page.goto('/chat');
  await page.fill('[data-testid="chat-input"]', 'Тест');
  await page.click('[data-testid="send-button"]');
  await expect(page.locator('[data-testid="paywall-sheet"]')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('text=Старт')).toBeVisible();
  await expect(page.locator('text=349 ₽')).toBeVisible();
});
```

### T6: История чатов
```typescript
test('history drawer open and close', async ({ page }) => {
  await page.goto('/chat');
  await page.click('[data-testid="history-toggle"]');
  await expect(page.locator('[data-testid="history-drawer"]')).toBeVisible();
  await page.click('[data-testid="history-close"]');
  await expect(page.locator('[data-testid="history-drawer"]')).not.toBeVisible();
});
```

---

## 15. Чеклист перед пушем

- [ ] TypeScript компилируется без новых ошибок
- [ ] Нет `console.log` (кроме `logger.ts`)
- [ ] Ответы AI через `AstroMarkdown`
- [ ] Новые поля БД добавлены с `IF NOT EXISTS`
- [ ] PaywallSheet не сломан (тест 402)
- [ ] Биллинг: credits начисляются после webhook
