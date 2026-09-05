# Build context is the repo root (railway/app.json). Next.js app, standalone server on $PORT.
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
# Tracked mainnet deployment files: the app reads contracts/deployments/<chainId>.json when the
# NEXT_PUBLIC_*_ADDRESS variables are unset (lib/deployment.ts).
COPY contracts/deployments contracts/deployments
COPY app app
# NEXT_PUBLIC_* are inlined at build time; Railway passes service variables as build args.
ARG NEXT_PUBLIC_CHAIN_ID NEXT_PUBLIC_RPC_URL NEXT_PUBLIC_SEASON_ID NEXT_PUBLIC_MINE_ADDRESS \
    NEXT_PUBLIC_FRAGMENTS_ADDRESS NEXT_PUBLIC_VAULT_ADDRESS NEXT_PUBLIC_FACTORY_ADDRESS \
    NEXT_PUBLIC_RIG_ADDRESS NEXT_PUBLIC_LP_ADDRESS NEXT_PUBLIC_USDC_ADDRESS NEXT_PUBLIC_ORACLE_ADDRESS \
    NEXT_PUBLIC_ELIGIBILITY_ADDRESS NEXT_PUBLIC_STOCK_ADDRESSES NEXT_PUBLIC_OPEN_TIME NEXT_PUBLIC_ROBINHOOD_CHAIN_ID \
    NEXT_PUBLIC_WC_PROJECT_ID NEXT_PUBLIC_APP_URL NEXT_PUBLIC_INDEXER_URL NEXT_PUBLIC_GEOFENCE NEXT_PUBLIC_RIG_BUY_URL
RUN pnpm --filter @stock-miner/app build

# Runtime: only the traced standalone output (next.config.ts `output: "standalone"`, traced from the repo
# root), the static assets and public/. Plain `node`, so a crash prints its stack trace in the deploy log.
FROM node:22-bookworm-slim AS run
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000
COPY --from=build /repo/app/.next/standalone /repo
COPY --from=build /repo/app/.next/static /repo/app/.next/static
COPY --from=build /repo/app/public /repo/app/public
COPY --from=build /repo/contracts/deployments /repo/contracts/deployments
WORKDIR /repo/app
EXPOSE 3000
CMD ["node", "server.js"]
