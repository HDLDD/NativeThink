#!/bin/bash
set -e

# Fix MSYS path conversion on Windows (Git Bash)
export MSYS_NO_PATHCONVERSION=1

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUTPUT="$ROOT/dist/output"
OUTPUT_RESOURCE="$ROOT/dist/output_resource"
OUTPUT_STATIC="$ROOT/dist/output_static"

# Environment variables:
# CLIENT_BASE_PATH / ASSETS_CDN_PATH / STATIC_ASSETS_BASE_URL
# Miaoda platform: MIAODA_APP_ID → /app/<appId>, MIAODA_RESOURCE_CDN_PREFIX, MIAODA_STATIC_CDN_PREFIX
# Cloudflare Pages: set CF_PAGES=1 to skip miaoda output splitting
export CLIENT_BASE_PATH="${MIAODA_APP_ID:+/app/$MIAODA_APP_ID}"
export ASSETS_CDN_PATH="${MIAODA_RESOURCE_CDN_PREFIX:-/}"
export STATIC_ASSETS_BASE_URL="${MIAODA_STATIC_CDN_PREFIX}"
export NODE_ENV="${NODE_ENV:-production}"

# Clean
rm -rf "$ROOT/dist"

# 1. Vite build → dist/client/
# base is read from CLIENT_BASE_PATH env var in vite.config.ts (avoids MSYS path mangling on Windows)
npx vite build --outDir "$ROOT/dist/client" --emptyOutDir

# 2. Create 404.html for SPA client-side routing (Cloudflare Pages / Vercel)
cp "$ROOT/dist/client/index.html" "$ROOT/dist/client/404.html"

# If CF_PAGES mode, skip miaoda output splitting — dist/client/ is the final output
if [ "${CF_PAGES}" = "1" ]; then
  echo "Build complete (Cloudflare Pages mode)"
  echo "  dist/client/ → deploy directory"
  exit 0
fi

# 3. HTML → dist/output/
mkdir -p "$OUTPUT"
find "$ROOT/dist/client" -maxdepth 1 \( -name '*.html' -o -name 'routes.json' \) -exec cp {} "$OUTPUT/" \;

# 4. assets/ → dist/output_resource/ (JS/CSS/fonts, upload to CDN)
if [ -d "$ROOT/dist/client/assets" ]; then
  mkdir -p "$OUTPUT_RESOURCE"
  cp -r "$ROOT/dist/client/assets" "$OUTPUT_RESOURCE/"
fi

# 5. Private static assets → dist/output_static/ (exclude code files)
if [ -d "$ROOT/shared/static" ]; then
  mkdir -p "$OUTPUT_STATIC"
  if command -v rsync &>/dev/null; then
    rsync -a --exclude='*.ts' --exclude='*.tsx' --exclude='*.js' --exclude='*.jsx' "$ROOT/shared/static/" "$OUTPUT_STATIC/"
  else
    cp -r "$ROOT/shared/static/." "$OUTPUT_STATIC/"
    rm -f "$OUTPUT_STATIC"/*.ts "$OUTPUT_STATIC"/*.tsx "$OUTPUT_STATIC"/*.js "$OUTPUT_STATIC"/*.jsx 2>/dev/null || true
  fi
fi

# 6. capability config → dist/output_capabilities/
if [ -d "$ROOT/shared/capabilities" ]; then
  mkdir -p "$ROOT/dist/output_capabilities"
  cp -r "$ROOT/shared/capabilities/." "$ROOT/dist/output_capabilities/"
fi

echo "Build complete (miaoda mode)"
echo "  HTML         → dist/output/"
[ -d "$OUTPUT_RESOURCE" ] && echo "  Resource     → dist/output_resource/" || true
[ -d "$OUTPUT_STATIC" ] && echo "  Static       → dist/output_static/" || true
[ -d "$ROOT/dist/output_capabilities" ] && echo "  Capabilities → dist/output_capabilities/" || true
