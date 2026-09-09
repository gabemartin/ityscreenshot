#!/usr/bin/env bash
# Copy the packaged SpecShot.app into /Applications (macOS only).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="/Applications/SpecShot.app"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "install-app.sh is macOS-only. SpecShot is a Mac desktop app."
  exit 1
fi

find_app() {
  local candidate
  for candidate in \
    "$ROOT/dist/mac-arm64/SpecShot.app" \
    "$ROOT/dist/mac/SpecShot.app" \
    "$ROOT/dist/mac-x64/SpecShot.app"
  do
    if [[ -d "$candidate" ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  return 1
}

APP=""
if ! APP="$(find_app)"; then
  echo "No packaged SpecShot.app found under dist/. Building with npm run pack…"
  (cd "$ROOT" && npm run pack)
  APP="$(find_app)"
fi

if [[ -z "$APP" || ! -d "$APP" ]]; then
  echo "Build finished but SpecShot.app was not found under dist/mac*/."
  exit 1
fi

if pgrep -f "/Applications/SpecShot.app/Contents/MacOS" >/dev/null 2>&1; then
  echo "Quitting the installed SpecShot so it can be replaced…"
  osascript -e 'quit app "SpecShot"' >/dev/null 2>&1 || true
  sleep 1
fi

rm -rf "$DEST"
ditto "$APP" "$DEST"
xattr -cr "$DEST" 2>/dev/null || true

echo "Installed $DEST"
echo "Open it from Spotlight, Launchpad, or: open -a SpecShot"
open -R "$DEST"
