#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist"
EXT_DIR="$DIST_DIR/extension"
PAGES_DIR="$DIST_DIR/pages"

VERSION="${VERSION:-}"
if [[ -z "$VERSION" ]]; then
  VERSION="$(node -p "require('$ROOT_DIR/package.json').version")"
fi

ZIP_NAME="torrent-link-proxy-v${VERSION}.zip"
ZIP_PATH="$DIST_DIR/$ZIP_NAME"

EXTENSION_FILES=(
  manifest.json
  background.js
  content.js
  popup.html
  popup.js
  options.html
  options.js
  icon16.svg
  icon48.svg
  icon128.svg
  _locales
)

PAGES_FILES=(
  index.html
  README.md
  icon16.svg
  icon48.svg
  icon128.svg
)

rm -rf "$DIST_DIR"
mkdir -p "$EXT_DIR" "$PAGES_DIR"

for file in "${EXTENSION_FILES[@]}"; do
  cp -R "$ROOT_DIR/$file" "$EXT_DIR/"
done

(
  cd "$EXT_DIR"
  zip -qr "$ZIP_PATH" .
)

for file in "${PAGES_FILES[@]}"; do
  cp -R "$ROOT_DIR/$file" "$PAGES_DIR/"
done
cp "$ZIP_PATH" "$PAGES_DIR/"

echo "Built extension package: $ZIP_PATH"
echo "Built pages artifact dir: $PAGES_DIR"
