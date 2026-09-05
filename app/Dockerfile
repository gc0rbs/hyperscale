# Build context is the repo root (railway/app.json). Next.js app, `next start` on $PORT.
FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=1
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY app/package.json app/
COPY contracts/package.json contracts/
COPY indexer/package.json indexer/
COPY ops/package.json ops/
COPY sim/package.json sim/
RUN pnpm install --frozen-lockfile --filter @stock-miner/app...
COPY specs/design specs/design
COPY app app
# NEXT_PUBLIC_* are inlined at build time; Railway passes service variables as build args.
ARG NEXT_PUBLIC_CHAIN_ID NEXT_PUBLIC_RPC_URL NEXT_PUBLIC_SEASON_ID NEXT_PUBLIC_MINE_ADDRESS \
    NEXT_PUBLIC_FRAGMENTS_ADDRESS NEXT_PUBLIC_VAULT_ADDRESS NEXT_PUBLIC_FACTORY_ADDRESS \
    NEXT_PUBLIC_RIG_ADDRESS NEXT_PUBLIC_LP_ADDRESS NEXT_PUBLIC_USDC_ADDRESS NEXT_PUBLIC_ORACLE_ADDRESS \
    NEXT_PUBLIC_ELIGIBILITY_ADDRESS NEXT_PUBLIC_STOCK_ADDRESSES NEXT_PUBLIC_OPEN_TIME NEXT_PUBLIC_ROBINHOOD_CHAIN_ID
RUN pnpm --filter @stock-miner/app build

FROM base AS run
ENV NODE_ENV=production
COPY --from=build /repo /repo
WORKDIR /repo/app
EXPOSE 3000
CMD ["sh", "-c", "pnpm exec next start -p ${PORT:-3000}"]
