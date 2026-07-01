#!/bin/sh
# Install the sharu CLI on Linux or macOS.
#
#   curl -fsSL https://new.sharu.io/install.sh | sh
#
# Environment overrides:
#   SHARU_VERSION   release version without the tag prefix (e.g. 0.1.0).
#                       Defaults to the latest release.
#   SHARU_INSTALL_DIR  install directory (default: $HOME/.local/bin).
#   SHARU_REPO      owner/repo to download from
#                       (default: urbanisierung/sharu-io-monorepo).
#   SHARU_TOKEN     GitHub token with read access, for installing from a
#                       private repo (also honours GH_TOKEN / GITHUB_TOKEN).
set -eu

REPO="${SHARU_REPO:-urbanisierung/sharu-io-monorepo}"
INSTALL_DIR="${SHARU_INSTALL_DIR:-$HOME/.local/bin}"
BIN="sharu"

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
      x86_64 | amd64) err "Intel macOS (x86_64) is no longer pre-built; build from source with 'cargo build --release -p sharu'" ;;
      *) err "unsupported macOS architecture: $arch" ;;
    esac
    ;;
  *)
    err "unsupported OS: $os (use install.ps1 on Windows)"
    ;;
esac

asset="${BIN}-${target}.tar.gz"

# A token unlocks release downloads from a private repo (and dodges anonymous
# rate limits). It is optional — public releases install with no token at all.
TOKEN="${SHARU_TOKEN:-${GH_TOKEN:-${GITHUB_TOKEN:-}}}"

if [ -n "${SHARU_VERSION:-}" ]; then
  release_api="https://api.github.com/repos/${REPO}/releases/tags/sharu-v${SHARU_VERSION}"
  public_base="https://github.com/${REPO}/releases/download/sharu-v${SHARU_VERSION}"
else
  release_api="https://api.github.com/repos/${REPO}/releases/latest"
  public_base="https://github.com/${REPO}/releases/latest/download"
fi

# Prefer curl, fall back to wget. Branch on the token up front so the auth header
# (whose value contains a space) is never assembled by unquoted shell expansion.
if command -v curl >/dev/null 2>&1; then
  if [ -n "$TOKEN" ]; then
    api_get() { curl -fsSL -H "Authorization: Bearer $TOKEN" -H "Accept: application/vnd.github+json" "$1"; }
    fetch_asset() { curl -fsSL -H "Authorization: Bearer $TOKEN" -H "Accept: application/octet-stream" "$1" -o "$2"; }
  else
    fetch_public() { curl -fsSL "$1" -o "$2"; }
  fi
elif command -v wget >/dev/null 2>&1; then
  if [ -n "$TOKEN" ]; then
    api_get() { wget -q --header="Authorization: Bearer $TOKEN" --header="Accept: application/vnd.github+json" -O - "$1"; }
    fetch_asset() { wget -q --header="Authorization: Bearer $TOKEN" --header="Accept: application/octet-stream" -O "$2" "$1"; }
  else
    fetch_public() { wget -qO "$2" "$1"; }
  fi
else
  err "neither curl nor wget is installed"
fi

# Resolve a release asset's authenticated API URL by name. Private repos 404 the
# public releases/download path for anonymous requests, so a token install must
# go through the API assets endpoint instead. Within each asset object the
# `releases/assets/<id>` url line precedes that asset's name line.
asset_api_url() {
  api_get "$release_api" | awk -v want="$1" '
    match($0, /https:[^"]*\/releases\/assets\/[0-9]+/) { cur = substr($0, RSTART, RLENGTH) }
    match($0, /"name":[[:space:]]*"[^"]*"/) {
      n = substr($0, RSTART, RLENGTH)
      sub(/^"name":[[:space:]]*"/, "", n)
      sub(/"$/, "", n)
      if (n == want) { print cur; exit }
    }'
}

# Download a release asset by name to a file. With a token, fetch through the API
# assets endpoint (works for private repos); otherwise use the public URL.
download() {
  if [ -n "$TOKEN" ]; then
    _url="$(asset_api_url "$1")" || return 1
    [ -n "$_url" ] || return 1
    fetch_asset "$_url" "$2"
  else
    fetch_public "${public_base}/$1" "$2"
  fi
}

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

echo "downloading ${asset}…"
if ! download "$asset" "$tmp/$asset"; then
  if [ -n "$TOKEN" ]; then
    err "could not download ${asset} from ${REPO} — is the token valid and does it grant read access?"
  else
    err "could not download ${asset}.
If ${REPO} is private, supply a GitHub token with read access and re-run, e.g.:
  curl -fsSL https://new.sharu.io/install.sh | SHARU_TOKEN=\"\$(gh auth token)\" sh"
  fi
fi

# Verify the checksum when the sidecar .sha256 is available.
if download "${asset}.sha256" "$tmp/$asset.sha256" 2>/dev/null; then
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

tar -xzf "$tmp/$asset" -C "$tmp" \
  || err "the download is not a valid .tar.gz — it was likely an error page, not ${asset}"
[ -s "$tmp/$BIN" ] || err "the archive did not contain the ${BIN} binary"

# Guard against the classic 'exec format error': confirm we got a native
# executable for this host before installing it, so a wrong-arch or corrupt
# download fails here with a clear message instead of at first run.
if command -v file >/dev/null 2>&1; then
  case "$(file -b "$tmp/$BIN")" in
    *ELF* | *Mach-O* | *executable*) ;;
    *) err "downloaded ${BIN} is not a native executable for ${target}: $(file -b "$tmp/$BIN")" ;;
  esac
fi

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
