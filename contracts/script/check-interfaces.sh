#!/usr/bin/env bash
# Fails if contracts/src/interfaces/ drifts from specs/contracts/ (the source of truth).
set -euo pipefail
cd "$(dirname "$0")/.."
status=0
for f in ../specs/contracts/*.sol; do
  b=$(basename "$f")
  if ! cmp -s "$f" "src/interfaces/$b"; then
    echo "interface drift: src/interfaces/$b differs from specs/contracts/$b (change specs/ first, then copy)"
    status=1
  fi
done
exit $status
