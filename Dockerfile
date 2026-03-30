FROM node:22-alpine AS base
RUN npm install -g pnpm@9
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY artifacts/api-server/package.json ./artifacts/api-server/
COPY artifacts/astrobot/package.json ./artifacts/astrobot/
COPY lib/api-client-react/package.json ./lib/api-client-react/
COPY lib/api-spec/package.json ./lib/api-spec/
COPY lib/api-zod/package.json ./lib/api-zod/
COPY lib/db/package.json ./lib/db/
COPY lib/integrations-openai-ai-react/package.json ./lib/integrations-openai-ai-react/
COPY lib/integrations-openai-ai-server/package.json ./lib/integrations-openai-ai-server/
COPY scripts/package.json ./scripts/
RUN pnpm install --frozen-lockfile=false

FROM deps AS builder
COPY . .
RUN BASE_PATH=/ pnpm --filter @workspace/astrobot run build
RUN pnpm --filter @workspace/api-server run build

FROM base AS runner
WORKDIR /app
COPY --from=builder /app /app
RUN pnpm install --frozen-lockfile=false
ENV NODE_ENV=production
EXPOSE 3000
CMD ["sh", "-c", "for i in 1 2 3 4 5; do pnpm --filter @workspace/db run push && break || sleep 10; done && pnpm --filter @workspace/api-server run start"]
