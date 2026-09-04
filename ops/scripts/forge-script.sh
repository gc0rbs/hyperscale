#!/usr/bin/env bash
# Runs a forge script against RPC_URL (default local Anvil). Extra args pass through, e.g. --broadcast --verify.
#   bash scripts/forge-script.sh DeployFactory --broadcast
# NO_PROXY keeps localhost RPC off the remote-session agent proxy (it otherwise hangs broadcasts).
set -euo pipefail
name=$1; shift
cd "$(dirname "$0")/../../contracts"
export NO_PROXY="${NO_PROXY:-127.0.0.1,localhost}" no_proxy="${no_proxy:-127.0.0.1,localhost}"
exec forge script "script/${name}.s.sol" --rpc-url "${RPC_URL:-http://127.0.0.1:8545}" "$@"
