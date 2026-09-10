# syntax=docker/dockerfile:1
# Always-on season services: keeper, watch, guardian, sweep (docs/RUNBOOK.md §5).
# Build from the repository root:  docker build -f ops/Dockerfile -t stock-miner-ops .
# Run:  docker run --rm -e CHAIN_ID=4663 -e RPC_URL=… -e KEEPER_KEY=… \
#         -v $PWD/contracts/deployments:/repo/contracts/deployments:ro stock-miner-ops keeper --interval 30

# 1. Contract artifacts: ops reads ABIs from contracts/out, so build them with the pinned Foundry.
FROM ghcr.io/foundry-rs/foundry:v1.5.1 AS contracts
USER root
WORKDIR /src
COPY contracts/ contracts/
COPY specs/ specs/
# A hosted checkout (Railway) has no git submodules: fetch the two libraries at the pinned commits
# (`git submodule status` in contracts/) when they are missing.
RUN cd contracts \
 && ([ -f lib/forge-std/src/Test.sol ] || (rm -rf lib/forge-std && git clone -q https://github.com/foundry-rs/forge-std lib/forge-std && git -C lib/forge-std checkout -q 3b20d60d14b343ee4f908cb8079495c07f5e8981)) \
 && ([ -f lib/openzeppelin-contracts/contracts/token/ERC20/ERC20.sol ] || (rm -rf lib/openzeppelin-contracts && git clone -q https://github.com/OpenZeppelin/openzeppelin-contracts lib/openzeppelin-contracts && git -C lib/openzeppelin-contracts checkout -q acd4ff74de833399287ed6b31b4debf6b2b35527)) \
 && forge build

# 2. Runtime: Node 22 + pnpm (version pinned by package.json "packageManager"), ops workspace only.
FROM node:22-bookworm-slim AS runtime
ENV CI=true NODE_ENV=production
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY app/package.json app/
COPY contracts/package.json contracts/
COPY indexer/package.json indexer/
COPY ops/package.json ops/
COPY sim/package.json sim/
RUN pnpm install --frozen-lockfile --filter @stock-miner/ops
COPY ops/ ops/
COPY specs/params/ specs/params/
COPY --from=contracts /src/contracts/out contracts/out
# Season addresses: mount contracts/deployments (written by CreateSeason) at /repo/contracts/deployments.
RUN mkdir -p contracts/deployments
USER node
ENTRYPOINT ["pnpm", "--filter", "@stock-miner/ops"]
CMD ["keeper", "--interval", "30"]
