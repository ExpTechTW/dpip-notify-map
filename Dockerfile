FROM oven/bun:1.4.0 AS builder

WORKDIR /app

# 一起帶上 lockfile。原本只 COPY package*.json(比對不到 bun.lockb),
# 等於每次建置都要重新向 registry 逐一查 132 個套件的 manifest —— 網路一抖就
# ConnectionRefused / FailedToOpenSocket 整批失敗。有 lockfile 就直接照鎖定版本裝。
COPY package.json bun.lockb ./

RUN bun install

COPY . .
ENV NODE_ENV=production
RUN bun run build

FROM oven/bun:1.4.0 AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

CMD ["bun", "server.js"]
