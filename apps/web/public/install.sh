#!/bin/sh
# Install the safu-node CLI on Linux or macOS.
#
#   curl -fsSL https://new.sharu.io/install.sh | sh
#
# Environment overrides:
#   SAFU_NODE_VERSION   release version without the tag prefix (e.g. 0.1.0).
#                       Defaults to the latest release.
#   SAFU_NODE_INSTALL_DIR  install directory (default: $HOME/.local/bin).
#   SAFU_NODE_REPO      owner/repo to download from
#                       (default: urbanisierung/sharu-io-monorepo).
set -eu

REPO="${SAFU_NODE_REPO:-urbanisierung/sharu-io-monorepo}"
INSTALL_DIR="${SAFU_NODE_INSTALL_DIR:-$HOME/.local/bin}"
BIN="safu-node"

err() {
  echo "error: $*" >&2
  exit 1
}

# Resolve the build target triple from the host OS and architecture.
os="$(uname -s)"
arch="$(uname -m)"
case "$os" in
  Linux)
    case "$arch" in
      x86_64 | amd64) target="x86_64-unknown-linux-gnu" ;;
      aarch64 | arm64) target="aarch64-unknown-linux-gnu" ;;
      *) err "unsupported Linux architecture: $arch" ;;
    esac
    ;;
  Darwin)
    case "$arch" in
      arm64 | aarch64) target="aarch64-apple-darwin" ;;
      x86_64 | amd64) err "Intel macOS (x86_64) is no longer pre-built; build from source with 'cargo build --release -p safu-node'" ;;
      *) err "unsupported macOS architecture: $arch" ;;
    esac
    ;;
  *)
    err "unsupported OS: $os (use install.ps1 on Windows)"
    ;;
esac

asset="${BIN}-${target}.tar.gz"
if [ -n "${SAFU_NODE_VERSION:-}" ]; then
  base="https://github.com/${REPO}/releases/download/safu-node-v${SAFU_NODE_VERSION}"
else
  base="https://github.com/${REPO}/releases/latest/download"
fi
url="${base}/${asset}"

# Prefer curl, fall back to wget.
if command -v curl >/dev/null 2>&1; then
  fetch() { curl -fsSL "$1" -o "$2"; }
elif command -v wget >/dev/null 2>&1; then
  fetch() { wget -qO "$2" "$1"; }
else
  err "neither curl nor wget is installed"
fi

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

echo "downloading ${asset}…"
fetch "$url" "$tmp/$asset" || err "download failed: $url"

# Verify the checksum when the sidecar .sha256 is available.
if fetch "${url}.sha256" "$tmp/$asset.sha256" 2>/dev/null; then
  expected="$(awk '{print $1}' "$tmp/$asset.sha256")"
  if command -v sha256sum >/dev/null 2>&1; then
    actual="$(sha256sum "$tmp/$asset" | awk '{print $1}')"
  elif command -v shasum >/dev/null 2>&1; then
    actual="$(shasum -a 256 "$tmp/$asset" | awk '{print $1}')"
  else
    actual=""
  fi
  if [ -n "$actual" ] && [ "$expected" != "$actual" ]; then
    err "checksum mismatch (expected $expected, got $actual)"
  fi
  [ -n "$actual" ] && echo "checksum verified"
fi

tar -xzf "$tmp/$asset" -C "$tmp"
mkdir -p "$INSTALL_DIR"
install -m 0755 "$tmp/$BIN" "$INSTALL_DIR/$BIN" 2>/dev/null \
  || { cp "$tmp/$BIN" "$INSTALL_DIR/$BIN" && chmod 0755 "$INSTALL_DIR/$BIN"; }

echo "installed $BIN to $INSTALL_DIR/$BIN"
"$INSTALL_DIR/$BIN" version || true

case ":$PATH:" in
  *":$INSTALL_DIR:"*) ;;
  *)
    echo
    echo "note: $INSTALL_DIR is not on your PATH. Add it, e.g.:"
    echo "  export PATH=\"$INSTALL_DIR:\$PATH\""
    ;;
esac
