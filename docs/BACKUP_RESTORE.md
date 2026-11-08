# Бэкапы и восстановление AstroBot

Цель: переписка, аккаунты и платежи **не зависели** от случайного wipe Railway Postgres / смены `DATABASE_URL`.

Redeploy API **сам по себе данные не удаляет**. Теряются данные, когда пропадает или подменяется **PostgreSQL**.

---

## 1. Обязательный минимум (сделайте сегодня)

### A. Включить бэкапы у Postgres на Railway

1. Railway → сервис **Postgres** (не API).
2. Включите **Backups / Point-in-time recovery** (зависит от плана).
3. Убедитесь, что API использует **тот же** `DATABASE_URL=${{Postgres.DATABASE_URL}}`, а не новый пустой инстанс.
4. Раз в месяц: тестовый restore в **отдельную** staging-БД (не в прод).

### B. Логический бэкап приложения (этот репозиторий)

Снимает users / contacts / conversations / messages / memories / payments в `*.json.gz`.

```bash
# Локально или в CI/cron с доступом к DATABASE_URL
pnpm db:backup
# файл: ./backups/astrobot-backup-<timestamp>.json.gz
```

Через админку (скачать файл к себе на диск / в облако):

```http
GET /api/admin/backup/download
Authorization: Bearer <admin JWT>
```

Восстановление (только с явного подтверждения):

```bash
DATABASE_URL=... pnpm db:restore -- ./backups/astrobot-backup-....json.gz --yes
```

Скрипты: `scripts/db/backup.mjs`, `scripts/db/restore.mjs`.

Env для backup-скрипта:

| Переменная | Назначение |
|------------|------------|
| `DATABASE_URL` | Postgres |
| `BACKUP_DIR` | Куда писать файлы (default `./backups`) |
| `BACKUP_KEEP` | Сколько файлов хранить (default 14) |
| `BACKUP_HTTP_PUT_URL` | Опционально: presigned URL для выгрузки gzip |

---

## 2. Рекомендуется: вынести БД в Neon (PITR вне Railway)

Чтобы отмена/сбой **Railway API** не убивал данные:

1. Создайте проект на [Neon](https://neon.tech), включите history/PITR.
2. Скопируйте connection string.
3. На Railway API замените `DATABASE_URL` на Neon URL (один раз, с даунтаймом на миграцию).
4. Перенесите данные: `pnpm db:backup` со старой БД → `pnpm db:restore -- … --yes` на Neon **или** `pg_dump`/`pg_restore`.
5. Railway Postgres plugin можно отключить **после** проверки, что прод читает Neon.

---

## 3. Расписание (cron)

Варианты:

1. **Внешний cron** (GitHub Actions scheduled / свой сервер) раз в сутки: `pnpm db:backup` + сохранение артефакта / PUT в S3.
2. **Ручной ритуал**: раз в день скачать `GET /api/admin/backup/download` и положить в Google Drive / iCloud / S3.
3. Railway Cron Job (если доступен на плане) с `BACKUP_DIR` на volume или `BACKUP_HTTP_PUT_URL`.

Диск контейнера API **эфемерный** — бэкап только внутри контейнера бесполезен. Файл должен уехать **наружу**.

---

## 4. Алерт «пустая БД»

При старте в `NODE_ENV=production`, если `users=0` и `payments=0`, в логи и (если настроен) в Telegram уходит предупреждение.

- Первый запуск нового проекта — ожидаемо.
- Если прод уже жил и алерт вдруг пришёл — **не кормите трафик**, восстанавливайте бэкап.

---

## 5. Runbook: «слетели аккаунты»

1. Не создавайте новый Postgres и не меняйте `DATABASE_URL` «наугад».
2. Проверьте Railway/Neon: жив ли старый инстанс, есть ли snapshots.
3. Restore snapshot провайдера **или** `pnpm db:restore` из последнего `.json.gz`.
4. Проверьте: число users/payments, вход админа, тестовый чат, reconcile платежей.
5. Если локальные `payments` потеряны, а ЮKassa жива — ручное начисление через admin grant / reconcile по `provider_payment_id`.

---

## 6. Что это не заменяет

- Обязательный email/Яндекс до оплаты (отдельная задача).
- Consumer-export чатов пользователю.
- Георепликацию.
