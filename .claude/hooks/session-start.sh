#!/usr/bin/env bash
# Prepares a fresh Claude Code remote session: Foundry, pnpm deps, uv deps. Idempotent and quiet.
set -uo pipefail
cd "$(dirname "$0")/../.."

export PATH="$HOME/.foundry/bin:$HOME/.local/bin:$PATH"

if ! command -v forge >/dev/null 2>&1; then
  echo "[session-start] installing Foundry (stable) from GitHub release tarball"
  mkdir -p "$HOME/.foundry/bin"
  if ! curl -sSL https://github.com/foundry-rs/foundry/releases/download/stable/foundry_stable_linux_amd64.tar.gz \
      | tar -xz -C "$HOME/.foundry/bin"; then
    echo "[session-start] Foundry tarball failed; trying foundryup"
    curl -sSL https://foundry.paradigm.xyz | bash >/dev/null 2>&1 && "$HOME/.foundry/bin/foundryup" >/dev/null 2>&1 || true
  fi
fi
forge --version 2>/dev/null | head -1 || echo "[session-start] Foundry unavailable; contracts checks will fail"

if [ -d contracts/lib ] && [ -z "$(ls -A contracts/lib/forge-std 2>/dev/null)" ]; then
  echo "[session-start] fetching contract submodules"
  git submodule update --init --recursive >/dev/null 2>&1 || true
fi

if [ ! -d node_modules ]; then
  echo "[session-start] pnpm install"
  pnpm install --frozen-lockfile >/dev/null 2>&1 || pnpm install >/dev/null 2>&1 || echo "[session-start] pnpm install failed"
fi

if command -v uv >/dev/null 2>&1 && [ ! -d sim/.venv ]; then
  echo "[session-start] uv sync (sim)"
  (cd sim && uv sync --extra dev >/dev/null 2>&1) || echo "[session-start] uv sync failed"
fi

# Make forge available to later Bash calls in this session.
if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  echo "export PATH=\"$HOME/.foundry/bin:$HOME/.local/bin:\$PATH\"" >> "$CLAUDE_ENV_FILE"
fi
echo "[session-start] ready"
