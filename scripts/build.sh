#!/bin/bash
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUTPUT="$ROOT/dist/output"
OUTPUT_RESOURCE="$ROOT/dist/output_resource"
OUTPUT_STATIC="$ROOT/dist/output_static"

# 环境变量: CLIENT_BASE_PATH / ASSETS_CDN_PATH / STATIC_ASSETS_BASE_URL
# 妙搭平台注入: MIAODA_APP_ID → /app/<appId>, MIAODA_RESOURCE_CDN_PREFIX, MIAODA_STATIC_CDN_PREFIX
export CLIENT_BASE_PATH="${MIAODA_APP_ID:+/app/$MIAODA_APP_ID}"
export ASSETS_CDN_PATH="${MIAODA_RESOURCE_CDN_PREFIX:-/}"
export STATIC_ASSETS_BASE_URL="${MIAODA_STATIC_CDN_PREFIX}"
export NODE_ENV="${NODE_ENV:-production}"

# 清理
rm -rf "$ROOT/dist"

# 1. Vite 构建 → dist/client/
npx vite build --outDir "$ROOT/dist/client" --emptyOutDir

# 2. HTML → dist/output/
mkdir -p "$OUTPUT"
find "$ROOT/dist/client" -maxdepth 1 \( -name '*.html' -o -name 'routes.json' \) -exec cp {} "$OUTPUT/" \;

# 3. assets/ → dist/output_resource/（JS/CSS/字体，上传到 CDN）
if [ -d "$ROOT/dist/client/assets" ]; then
  mkdir -p "$OUTPUT_RESOURCE"
  cp -r "$ROOT/dist/client/assets" "$OUTPUT_RESOURCE/"
fi

# 4. 私有静态资源 → dist/output_static/（排除代码文件）
if [ -d "$ROOT/shared/static" ]; then
  mkdir -p "$OUTPUT_STATIC"
  if command -v rsync &>/dev/null; then
    rsync -a --exclude='*.ts' --exclude='*.tsx' --exclude='*.js' --exclude='*.jsx' "$ROOT/shared/static/" "$OUTPUT_STATIC/"
  else
    cp -r "$ROOT/shared/static/." "$OUTPUT_STATIC/"
    rm -f "$OUTPUT_STATIC"/*.ts "$OUTPUT_STATIC"/*.tsx "$OUTPUT_STATIC"/*.js "$OUTPUT_STATIC"/*.jsx 2>/dev/null || true
  fi
fi

# 5. capability 配置 → dist/output_capabilities/
if [ -d "$ROOT/shared/capabilities" ]; then
  mkdir -p "$ROOT/dist/output_capabilities"
  cp -r "$ROOT/shared/capabilities/." "$ROOT/dist/output_capabilities/"
fi

# 清理中间产物
rm -rf "$ROOT/dist/client"

echo "Build complete"
echo "  HTML         → dist/output/"
[ -d "$OUTPUT_RESOURCE" ] && echo "  Resource     → dist/output_resource/" || true
[ -d "$OUTPUT_STATIC" ] && echo "  Static       → dist/output_static/" || true
[ -d "$ROOT/dist/output_capabilities" ] && echo "  Capabilities → dist/output_capabilities/" || true
