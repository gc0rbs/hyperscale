# syntax=docker/dockerfile:1
# Ponder indexer for one season (indexer/README.md). Build from the repository root:
#   docker build -f indexer/Dockerfile -t stock-miner-indexer .
# Needs DATABASE_URL (Postgres), CHAIN_ID, PONDER_RPC_URL_<chainId>, and the season addresses either
# from a mounted contracts/deployments/<chainId>.json or SEASON_MINE_ADDRESS & co.
FROM node:22-bookworm-slim
ENV CI=true NODE_ENV=production
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY app/package.json app/
COPY contracts/package.json contracts/
COPY indexer/package.json indexer/
COPY ops/package.json ops/
COPY sim/package.json sim/
RUN pnpm install --frozen-lockfile --filter @stock-miner/indexer
# The indexer's ABIs are generated from the app's forge-synced JSON at start.
COPY app/src/abi/ app/src/abi/
COPY indexer/ indexer/
RUN mkdir -p contracts/deployments && chown -R node:node indexer contracts
USER node
WORKDIR /repo/indexer
EXPOSE 42069
CMD ["pnpm", "start"]
