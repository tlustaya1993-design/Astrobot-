#!/bin/sh
for i in 1 2 3 4 5; do
  pnpm --filter @workspace/db run push:ci && break || sleep 10
done
exec pnpm --filter @workspace/api-server run start
