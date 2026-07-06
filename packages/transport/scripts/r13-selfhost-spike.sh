#!/usr/bin/env bash
# R1.3 spike runner (docs/r1-discovery-hardening-plan.md §R1.3): boot a LOCAL
# self-hosted iroh-relay (--dev) + iroh-dns-server (pkarr relay), then run the
# gated WASM spike test against them with ZERO n0 infrastructure.
#
# Prereqs (not in CI — run on a dev box):
#   cargo install iroh-relay --features server
#   cargo install iroh-dns-server
#   pnpm --filter @safu/transport build   # builds the wasm the test loads
#
# Usage:  bash packages/transport/scripts/r13-selfhost-spike.sh
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../../.." && pwd)"
TMP="$(mktemp -d)"
trap 'kill ${DNS_PID:-} ${RELAY_PID:-} 2>/dev/null; rm -rf "$TMP"' EXIT

# Relay: plain-HTTP dev mode on 127.0.0.1:3340, metrics off (avoids an IPv6-only
# metrics bind on hosts without [::]).
cat >"$TMP/relay.toml" <<'EOF'
enable_metrics = false
http_bind_addr = "127.0.0.1:3340"
EOF

# DNS server: the shipped dev config, with Mainline disabled — the pkarr HTTP
# store (:8080) is all the spike needs, and DHT bootstrap requires external UDP.
DNS_SRC="$(find "${CARGO_HOME:-$HOME/.cargo}/registry/src" -maxdepth 2 -type d -name 'iroh-dns-server-*' 2>/dev/null | head -1)"
if [ -z "$DNS_SRC" ]; then echo "iroh-dns-server sources not found; cargo install iroh-dns-server" >&2; exit 2; fi
sed 's/^enabled = true/enabled = false/' "$DNS_SRC/config.dev.toml" >"$TMP/dns.toml"

echo "== starting iroh-dns-server (pkarr :8080) =="
iroh-dns-server --config "$TMP/dns.toml" >"$TMP/dns.log" 2>&1 & DNS_PID=$!
echo "== starting iroh-relay --dev (:3340) =="
iroh-relay --dev --config-path "$TMP/relay.toml" >"$TMP/relay.log" 2>&1 & RELAY_PID=$!

for port in 8080 3340; do
  up=""
  for _ in $(seq 1 40); do
    if (exec 3<>"/dev/tcp/127.0.0.1/$port") 2>/dev/null; then exec 3>&- 3<&-; up=1; break; fi
    sleep 0.25
  done
  [ -n "$up" ] || { echo "port $port never came up" >&2; tail -5 "$TMP"/*.log >&2; exit 1; }
done

echo "== running gated WASM spike test =="
cd "$REPO"
SAFU_SPIKE=1 SPIKE_RELAY="http://localhost:3340" SPIKE_PKARR="http://127.0.0.1:8080/pkarr" \
  pnpm exec vitest run --project node packages/transport/src/discovery-selfhost.spike.test.ts
