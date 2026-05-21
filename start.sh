#!/bin/sh
# Миграции: runDbMigrations + waitForDb в artifacts/api-server/src/index.ts (без drizzle-kit push).
exec pnpm --filter @workspace/api-server run start
