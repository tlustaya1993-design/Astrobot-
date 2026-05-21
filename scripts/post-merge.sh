#!/bin/bash
set -e
pnpm install --frozen-lockfile
# Схема БД: runDbMigrations при старте API, не drizzle-kit push (Replit post-merge).
