# AstroBot — Project Playbook

> Документ для AI-агентов (Cursor, Claude). Содержит полное описание архитектуры, правила работы с кодом и спецификацию автотестов.

---

## 1. Обзор проекта

**AstroBot** — русскоязычный AI-астролог (PWA). Пользователь вводит дату рождения, получает натальную карту, ежедневный прогноз и ведёт чат с Claude.

- **Продакшн**: https://astroai.site (Railway ← GitHub `tlustaya1993-design/Astrobot-`, ветка `main`)
- **Язык интерфейса**: Русский
- **AI модели**: Claude Sonnet (чат), Claude Haiku (память, прогноз)

---

## 2. Технологический стек

| Слой | Технологии |
|------|-----------|
| Frontend | React 18, Vite, TypeScript, Tailwind CSS v4, Framer Motion |
| Backend | Node.js, Express 5, TypeScript |
| Database | PostgreSQL + Drizzle ORM |
| AI | Anthropic Claude (через `lib/integrations-anthropic-ai/`) |
| Auth | JWT (365 дней) + анонимные сессии через UUID |
| Monorepo | pnpm workspaces |
| Deploy | GitHub → Railway (автодеплой из main) |
| DNS | Cloudflare (proxy) → Railway |

---

## 3. Структура монорепо

```
/
├── artifacts/
│   ├── astrobot/          # React PWA (frontend)
│   │   ├── src/
│   │   │   ├── pages/     # Chat, Home, Onboarding, History
│   │   │   ├── components/
│   │   │   │   ├── chat/  # PeoplePanel, DailyForecastCard, HistoryDrawer, AstroMarkdown
│   │   │   │   ├── profile/   # ProfileSheet
│   │   │   │   ├── layout/    # AppLayout
│   │   │   │   └── ui/        # AstroAvatar, Button, Input, DateInput...
│   │   │   ├── context/   # AuthContext
│   │   │   ├── hooks/     # useChatStream
│   │   │   └── lib/       # session.ts (JWT/sessionId), astrology.ts
│   │   └── public/images/ # avatar-bot.png, cosmic-bg.png
│   │
│   └── api-server/        # Express API
│       └── src/
│           ├── routes/
│           │   ├── auth.ts          # /api/auth/register, /login, /logout
│           │   ├── users.ts         # /api/users/me (GET/PUT)
│           │   ├── contacts.ts      # /api/contacts (CRUD)
│           │   ├── astrology.ts     # /api/astrology/natal-chart
│           │   └── openai/
│           │       ├── conversations.ts  # /api/openai/conversations (CRUD + streaming)
│           │       └── daily-forecast.ts # /api/openai/daily-forecast
│           ├── lib/
│           │   ├── astrology.ts     # Swiss Ephemeris, Placidus houses, синастрия
│           │   └── logger.ts
│           └── middleware/
│               └── auth.ts          # sessionMiddleware (JWT/x-session-id)
│
├── lib/
│   ├── db/                # Drizzle schema + migrations
│   │   └── src/schema/
│   │       ├── users.ts
│   │       ├── conversations.ts  # contactId (nullable) для синастрии
│   │       ├── messages.ts
│   │       ├── contacts.ts
│   │       └── memories.ts
│   └── integrations-anthropic-ai/  # Anthropic client
│
└── PLAYBOOK.md            # этот файл
```

---

## 4. База данных

### Таблицы

#### `users`
| Поле | Тип | Описание |
|------|-----|---------|
| id | serial PK | |
| session_id | text UNIQUE | UUID, создаётся на клиенте |
| email | text UNIQUE | nullable (анонимы) |
| password_hash | text | bcrypt |
| name | text | имя пользователя |
| birth_date | text | YYYY-MM-DD |
| birth_time | text | HH:MM (nullable) |
| birth_place | text | город |
| birth_lat / birth_lng | double | геокоординаты |
| gender | text | |
| onboarding_done | boolean | false пока не пройдёт онбординг |
| requests_used | integer | **СЧЁТЧИК — в данный момент не пишется, баг!** |
| tone_preferred_depth | text | deep/medium/light |
| tone_preferred_style | text | mystical/practical/... |

#### `conversations`
| Поле | Тип | Описание |
|------|-----|---------|
| id | serial PK | |
| session_id | text | владелец |
| title | text | авто-генерируется |
| contact_id | integer | nullable, ссылка на contacts.id (синастрия) |
| created_at | timestamp | |

#### `messages`
| Поле | Тип | Описание |
|------|-----|---------|
| id | serial PK | |
| conversation_id | integer FK | |
| role | text | 'user' / 'assistant' |
| content | text | |
| created_at | timestamp | |

#### `contacts`
| Поле | Тип | Описание |
|------|-----|---------|
| id | serial PK | |
| session_id | text | владелец |
| name | text | имя контакта |
| relation | text | муж/жена/ребёнок/... |
| birth_date | text | YYYY-MM-DD |
| birth_time / birth_place | text | nullable |
| birth_lat / birth_lng | double | nullable |

#### `memories`
| Поле | Тип | Описание |
|------|-----|---------|
| id | serial PK | |
| session_id | text | |
| content | text | факт для долгосрочной памяти AI |
| created_at | timestamp | |

### Миграции
```bash
pnpm --filter @workspace/db run push-force   # применить изменения схемы
```
Или напрямую SQL (безопаснее для новых nullable колонок):
```sql
ALTER TABLE table_name ADD COLUMN IF NOT EXISTS column_name type;
```

---

## 5. API Endpoints

### Auth
```
POST /api/auth/register    { email, password, sessionId? } → { token, sessionId, email }
POST /api/auth/login       { email, password } → { token, sessionId, email }
POST /api/auth/logout      → 200
```

### Users
```
GET  /api/users/me         → User (профиль текущего пользователя)
PUT  /api/users/me         { name, birthDate, birthTime, birthPlace, ... } → User
```

### Contacts (синастрия)
```
GET    /api/contacts           → Contact[]
POST   /api/contacts           { name, relation, birthDate, ... } → Contact
GET    /api/contacts/:id       → Contact
PUT    /api/contacts/:id       → Contact
DELETE /api/contacts/:id       → 200
```

### Conversations
```
GET    /api/openai/conversations       → ConversationWithContact[]
POST   /api/openai/conversations       { title } → Conversation
GET    /api/openai/conversations/:id   → Conversation + messages[]
DELETE /api/openai/conversations/:id   → 200
POST   /api/openai/conversations/:id/messages  { content, contactId? } → streaming SSE
```

### Daily Forecast
```
GET /api/openai/daily-forecast   → { date, text, moonPhase: { name, emoji } }
```
Кешируется на клиенте в `sessionStorage` по ключу `daily-forecast-YYYY-MM-DD`.

### Astrology
```
GET /api/astrology/natal-chart   → { planets[], houses[], aspects[] }
```

---

## 6. Система аутентификации

**Два типа сессий:**

1. **Анонимная** — UUID хранится в `localStorage` (`astrobot_session_id`). Запросы идут с заголовком `x-session-id: <uuid>`.

2. **Зарегистрированная** — после логина JWT (365д) хранится в `localStorage` (`astrobot_jwt`). Запросы идут с `Authorization: Bearer <token>`.

**middleware/auth.ts** парсит оба варианта и кладёт `sessionId` в `req.sessionId`.

**Конвертация** анонима в аккаунт: при регистрации передаётся `sessionId` из localStorage, сервер мигрирует данные к новому аккаунту.

---

## 7. Frontend — страницы и компоненты

### Страницы (wouter routing)
| Route | Компонент | Описание |
|-------|-----------|---------|
| `/` | Home | Лендинг с CTA в онбординг/чат |
| `/onboarding` | Onboarding | 3-шаговый онбординг (имя, дата рождения, тон общения) |
| `/chat` | Chat | Новый чат |
| `/chat/:id` | Chat | Существующий диалог |
| `/history` | History | История чатов (редирект, основной UI — HistoryDrawer) |

### Ключевые компоненты

**Chat.tsx** — основной экран:
- `PeoplePanel` — горизонтальная прокрутка контактов (я + контакты для синастрии)
- `DailyForecastCard` — карточка прогноза (разворачивается)
- `HistoryDrawer` — левая панель с историей чатов
- `AstroMarkdown` — рендеринг markdown ответов бота
- `useChatStream` hook — streaming через SSE

**Синастрийный режим**: при выборе контакта в `PeoplePanel` → `selectedContactId` передаётся в запрос сообщения → сервер строит синастрию двух карт.

**HistoryDrawer** — показывает двойные аватары для синастрийных чатов (user + contact).

**AstroAvatar** — кастомный SVG-аватар (цвет, знак, стиль). **НЕ ТРОГАТЬ** без явного задания.

---

## 8. AI-система

### Промпт-архитектура (`buildSystemPrompt`)
1. **Натальная карта** пользователя (Swiss Ephemeris, дома Placidus)
2. **Эфемериды** текущего дня (транзитные планеты)
3. **Solar Return** текущего года
4. **Прогрессии** (Secondary Progressions)
5. **Лунный возврат**
6. **Solar Arc Directions**
7. **Transit Perfections**
8. **Синастрия** (если выбран контакт): аспекты двух карт
9. **Памятки** (`memories`): факты о пользователе из прошлых чатов

### Модели
- **claude-sonnet-4-6** — основной чат (streaming)
- **claude-haiku-4-5** — извлечение фактов в память, генерация ежедневного прогноза

### Память
После каждого ответа бота Haiku анализирует разговор и извлекает факты (работа, дети, события), сохраняет в `memories`. Подключается в следующем разговоре.

---

## 9. Деплой

```
Replit (разработка) → GitHub (main) → Railway (продакшн)
```

- **Railway сервис**: `astrobot` (id: `944065ba`)
- **Railway проект**: `a9b8506b`
- **URL**: `astrobot-production-04ad.up.railway.app` и `astroai.site`
- **Автодеплой**: каждый push в `main` → Railway пересобирает
- **Миграции**: `artifacts/api-server/src/migrate.ts` запускается перед стартом сервера

### Переменные окружения (Railway)
```
DATABASE_URL       # PostgreSQL connection string
JWT_SECRET         # секрет для подписи JWT
ANTHROPIC_API_KEY  # ключ Claude
PORT               # Railway подставляет автоматически
FRONTEND_DIST      # путь к собранному frontend (Railway CWD issue)
NODE_ENV=production
```

---

## 10. Правила работы с кодом

### ❌ НЕ ТРОГАТЬ без явного задания
- `AstroAvatar.tsx` — SVG-аватар, сложная логика. Редизайн запланирован отдельно
- `ProfileSheet.tsx` — лист профиля, редизайн запланирован
- `PeoplePanel.tsx` — панель контактов
- Любые файлы связанные с оплатой (Stripe/ЮКасса) — работает Cursor отдельно

### ⚠️ Известные баги (не чинить без задания)
- `requests_used` в БД всегда 0 — счётчик не пишется после каждого запроса к Claude
- Pre-existing TypeScript errors: `req.sessionId`, `requestsUsed` в схеме — игнорировать

### ✅ Правила написания кода
- Весь UI-текст на **русском**
- Компоненты разбивать на отдельные файлы (не делать гигантские файлы)
- Использовать `AstroMarkdown` для рендеринга ответов Claude (не `<p>` с raw-текстом)
- При ошибке загрузки изображений — показывать иконку-фолбэк (не [?])
- Автоскролл чата — только при новом сообщении, не во время стриминга

---

## 11. Ценообразование (только для справки, в приложение НЕ добавлять)

| Пакет | Цена | Запросы |
|-------|------|---------|
| Стартовый | 349₽ | 10 |
| Базовый | 799₽ | 30 |
| Популярный | 1149₽ | 50 |
| Максимальный | 1799₽ | 100 |
| Подписка/мес | 899₽ | безлимит |
| Подписка/год | 6999₽ | безлимит |

---

## 12. Автотесты (Playwright)

### Setup
```typescript
// tests/playwright.config.ts
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  use: {
    baseURL: 'http://localhost:80',
    locale: 'ru-RU',
  },
});
```

### Тест 1: Онбординг
```typescript
// tests/e2e/onboarding.spec.ts
test('полный онбординг новый пользователь', async ({ page }) => {
  await page.goto('/onboarding');

  // Шаг 1: Имя
  await page.getByPlaceholder(/имя/i).fill('Анна');
  await page.getByRole('button', { name: /далее/i }).click();

  // Шаг 2: Дата рождения
  await page.getByPlaceholder(/дата рождения/i).fill('15.05.1990');
  // CityAutocomplete: вводим город, выбираем из списка
  await page.getByPlaceholder(/город/i).fill('Москва');
  await page.getByText('Москва, Россия').first().click();
  await page.getByRole('button', { name: /далее/i }).click();

  // Шаг 3: Тон общения
  await page.getByRole('button', { name: /завершить|начать/i }).click();

  // Должны попасть в чат
  await expect(page).toHaveURL('/chat');
  await expect(page.getByText('О чём спросить звёзды?')).toBeVisible();
});
```

### Тест 2: Регистрация и логин
```typescript
// tests/e2e/auth.spec.ts
test('регистрация нового пользователя', async ({ page }) => {
  await page.goto('/chat');

  // Открываем историю → логин
  await page.locator('[aria-label="Открыть историю"]').click();
  await page.getByText('Войти / Зарегистрироваться').click();

  // Переключаем на регистрацию
  await page.getByText('Регистрация').click();
  await page.getByPlaceholder(/email/i).fill(`test${Date.now()}@test.com`);
  await page.getByPlaceholder(/пароль/i).fill('test1234');
  await page.getByRole('button', { name: /зарегистрироваться/i }).click();

  // Модал должен закрыться, пользователь залогинен
  await expect(page.getByText('Войти / Зарегистрироваться')).not.toBeVisible();
});

test('логин существующего пользователя', async ({ page }) => {
  await page.goto('/chat');
  await page.locator('[aria-label="Открыть историю"]').click();
  await page.getByText('Войти / Зарегистрироваться').click();

  await page.getByPlaceholder(/email/i).fill('test@existing.com');
  await page.getByPlaceholder(/пароль/i).fill('password123');
  await page.getByRole('button', { name: /войти/i }).click();

  await expect(page.getByText('Войти / Зарегистрироваться')).not.toBeVisible();
});
```

### Тест 3: Отправка сообщения в чат
```typescript
// tests/e2e/chat.spec.ts
test('отправка вопроса и получение ответа', async ({ page }) => {
  await page.goto('/chat');

  // Кликаем на подсказку
  await page.getByText('Расскажи о моей натальной карте').click();
  // Текст должен попасть в поле ввода
  await expect(page.getByPlaceholder(/спросите звёзды/i)).toHaveValue(/натальной карте/i);

  // Отправляем
  await page.getByRole('button', { name: /отправить/i }).click();

  // Появляется сообщение пользователя
  await expect(page.getByText('Расскажи о моей натальной карте')).toBeVisible();

  // Бот начинает печатать (индикатор или текст)
  await expect(page.locator('.typing-dot, [class*="streaming"]')).toBeVisible({ timeout: 5000 });

  // Ждём полного ответа
  await expect(page.locator('[class*="assistant"], [class*="prose"]').first()).toBeVisible({ timeout: 30000 });
});

test('чат создаёт URL /chat/:id после первого сообщения', async ({ page }) => {
  await page.goto('/chat');
  await page.getByPlaceholder(/спросите звёзды/i).fill('Привет');
  await page.keyboard.press('Enter');

  // URL должен смениться
  await expect(page).toHaveURL(/\/chat\/\d+/, { timeout: 10000 });
});
```

### Тест 4: Синастрия
```typescript
// tests/e2e/synastry.spec.ts
test('добавление контакта и режим синастрии', async ({ page }) => {
  await page.goto('/chat');

  // Нажимаем + Добавить в PeoplePanel
  await page.getByText('+ Добавить').click();

  // Заполняем форму контакта
  await page.getByPlaceholder(/имя/i).fill('Сергей');
  await page.getByPlaceholder(/дата рождения/i).fill('20.03.1985');
  await page.getByRole('button', { name: /сохранить|добавить/i }).click();

  // Контакт появляется в PeoplePanel
  await expect(page.getByText('Сергей')).toBeVisible();

  // Кликаем по контакту
  await page.getByText('Сергей').click();

  // Появляется подсказка синастрии
  await expect(page.getByText('Синастрия активна')).toBeVisible();
  // Чипы меняются на синастрийные
  await expect(page.getByText('Расскажи о нашей синастрии')).toBeVisible();
  // Плейсхолдер меняется
  await expect(page.getByPlaceholder(/совместимости/i)).toBeVisible();
});
```

### Тест 5: История чатов
```typescript
// tests/e2e/history.spec.ts
test('история отображает список диалогов', async ({ page }) => {
  await page.goto('/chat');

  // Открываем историю
  await page.locator('[aria-label="Открыть историю"]').click();

  // Ящик появился
  await expect(page.getByText('Новый диалог')).toBeVisible();

  // Закрываем по кнопке X
  await page.locator('button').filter({ hasText: '' }).first().click();
  await expect(page.getByText('Новый диалог')).not.toBeVisible();
});

test('смахивание с левого края открывает историю', async ({ page }) => {
  await page.goto('/chat');

  // Имитируем свайп
  await page.touchscreen.tap(10, 400);
  // Полноценный swipe через mouse events
  await page.mouse.move(5, 400);
  await page.mouse.down();
  await page.mouse.move(100, 400, { steps: 10 });
  await page.mouse.up();

  await expect(page.getByText('Новый диалог')).toBeVisible({ timeout: 2000 });
});
```

### Тест 6: Ежедневный прогноз
```typescript
// tests/e2e/forecast.spec.ts
test('карточка прогноза отображается на главном экране чата', async ({ page }) => {
  await page.goto('/chat');

  // Если пользователь без даты рождения — заглушка
  const card = page.locator('[class*="forecast"], [class*="rounded-2xl"]').first();
  await expect(card).toBeVisible();
  await expect(page.getByText(/прогноз на сегодня/i)).toBeVisible();
});

test('прогноз разворачивается по клику', async ({ page }) => {
  await page.goto('/chat');

  const header = page.getByText(/прогноз на сегодня/i);
  await header.click();

  // Появляется дополнительный контент или кнопки
  await expect(page.getByText(/расскажи подробнее|какие транзиты/i)).toBeVisible({ timeout: 3000 });
});
```

### Запуск тестов
```bash
# Установка Playwright
pnpm add -D @playwright/test
npx playwright install chromium

# Запуск всех тестов
npx playwright test

# Запуск конкретного теста
npx playwright test tests/e2e/chat.spec.ts

# С UI (интерактивный режим)
npx playwright test --ui

# Репорт
npx playwright show-report
```

---

## 13. Чеклист перед деплоем

- [ ] `pnpm --filter @workspace/db run push-force` — применить изменения схемы
- [ ] Проверить TypeScript: `pnpm -r run typecheck` (игнорировать pre-existing errors)
- [ ] Локально открыть http://localhost:80 и пройти онбординг
- [ ] Отправить тестовое сообщение в чат — убедиться что streaming работает
- [ ] Push в `main` → ждать Railway деплой (~2-3 мин) → проверить https://astroai.site

---

## 14. Быстрые команды

```bash
# Запуск локально
pnpm --filter @workspace/api-server run dev   # API на порту из PORT env
pnpm --filter @workspace/astrobot run dev     # Frontend

# Сборка
pnpm --filter @workspace/astrobot run build

# Применить схему БД
pnpm --filter @workspace/db run push-force

# Проверить типы
pnpm -r run typecheck
```
