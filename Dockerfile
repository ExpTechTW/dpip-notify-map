FROM oven/bun:1.3.4 AS builder

WORKDIR /app

# 一起帶上 lockfile。原本只 COPY package*.json(比對不到 bun.lockb),
# 等於每次建置都要重新向 registry 逐一查 132 個套件的 manifest —— 網路一抖就
# ConnectionRefused / FailedToOpenSocket 整批失敗。有 lockfile 就直接照鎖定版本裝。
COPY package.json bun.lockb ./

# 併發連線降到 16(預設 48),避免同時開太多 socket 被拒;偶發失敗再重試兩次。
RUN bun install --frozen-lockfile --network-concurrency 16 \
 || (sleep 5  && bun install --frozen-lockfile --network-concurrency 8) \
 || (sleep 20 && bun install --frozen-lockfile --network-concurrency 4)

COPY . .
ENV NODE_ENV=production
RUN bun run build

FROM oven/bun:1.3.4 AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

CMD ["bun", "server.js"]
