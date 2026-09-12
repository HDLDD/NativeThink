import path from 'path'
import fs from 'node:fs'
import type { Plugin } from 'vite'
import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'

// dev 环境伺服内置离线小模型（models-bundled/ → /models/）
function serveBundledModels(): Plugin {
  return {
    name: 'serve-bundled-models',
    configureServer(server) {
      server.middlewares.use('/models', (req, res, next) => {
        const rel = decodeURIComponent((req.url || '').split('?')[0]).replace(/^\/+/, '');
        const file = path.resolve(process.cwd(), 'models-bundled', rel);
        if (!file.startsWith(path.resolve(process.cwd(), 'models-bundled')) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
          res.statusCode = 404;
          res.end();
          return;
        }
        const ext = path.extname(file).toLowerCase();
        const types: Record<string, string> = { '.json': 'application/json', '.onnx': 'application/octet-stream', '.txt': 'text/plain' };
        res.setHeader('Content-Type', types[ext] || 'application/octet-stream');
        fs.createReadStream(file).pipe(res);
      });
    },
  };
}

// ── 出厂内置 API Key ──
// 从 gitignore 的 scripts/.apikey 读取（一行文本），构建/开发时注入客户端。
// 密钥不进仓库；换 Key 只需改该文件后重新打包。
let factoryApiKey = ''
try {
  factoryApiKey = fs.readFileSync(path.resolve(process.cwd(), 'scripts/.apikey'), 'utf8').trim()
} catch { /* 文件不存在 — 出厂未内置 */ }

// Mock virtual:capabilities for Cloudflare Pages (Lark platform virtual module)
// This plugin resolves the virtual module to an empty object at build time
function mockVirtualCapabilities(): Plugin {
  return {
    name: 'mock-virtual-capabilities',
    resolveId(id) {
      if (id === 'virtual:capabilities') return '\0virtual:capabilities'
    },
    load(id) {
      if (id === '\0virtual:capabilities') {
        return 'export default {}'
      }
    },
    // Handle dynamic imports of virtual:capabilities
    transform(code, id) {
      // Replace dynamic imports of virtual:capabilities with the mock
      if (code.includes('virtual:capabilities')) {
        return {
          code: code.replace(/import\(['"]virtual:capabilities['"]\)/g, 'Promise.resolve({ default: {} })'),
          map: null,
        }
      }
    },
  }
}

// Replace platform template placeholders and strip platform-only analytics for Cloudflare
function fixHtmlPlaceholders(): Plugin {
  return {
    name: 'fix-html-placeholders',
    enforce: 'post', // run after ogMetaPlugin replaces title with {{appName}}
    transformIndexHtml(html) {
      let result = html
        .replace(/{{appName}}/g, 'NativeThink')
        .replace(/{{appDescription}}/g, '英语母语思维训练')
        .replace(/{{appAvatar}}/g, '/favicon.svg')

      // Strip platform-only analytics/tracking scripts (they're only useful on miaoda,
      // add no value on Cloudflare/GitHub Pages, and significantly slow mobile loading):
      // - Slardar error monitoring SDK
      // - Tea/collectEvent analytics SDK
      // - Performance monitoring
      // - Platform runtime template injection
      result = result.replace(/<script>[\s\S]*?KSlardarWeb[\s\S]*?<\/script>/g, '')
      result = result.replace(/<script>[\s\S]*?collectEvent[\s\S]*?<\/script>/g, '')
      result = result.replace(/<script>[\s\S]*?window\.appId = "\{\{appId\}\}"[\s\S]*?appInfo[\s\S]*?<\/script>/g, '')
      result = result.replace(/<script>[\s\S]*?slardarScript[\s\S]*?<\/script>/g, '')
      result = result.replace(/<script>[\s\S]*?teaScript[\s\S]*?<\/script>/g, '')
      result = result.replace(/<script[^>]*performance[^>]*><\/script>/g, '')
      result = result.replace(/<script[^>]*feishucdn[^>]*><\/script>/g, '')

      return result
    },
  }
}

export default defineConfig({
  base: process.env.CLIENT_BASE_PATH || '/',
  // 让 dev 模式（普通浏览器，无 Node 环境）下 src/index.tsx 里的 process.env 可用；构建时 esbuild 本就会替换
  define: {
    'process.env.CLIENT_BASE_PATH': JSON.stringify(process.env.CLIENT_BASE_PATH || '/'),
    // 出厂内置 API Key（可为空 — scripts/.apikey 不存在时）
    '__FACTORY_API_KEY__': JSON.stringify(factoryApiKey),
  },
  plugins: [tailwindcss(), mockVirtualCapabilities(), fixHtmlPlaceholders(), serveBundledModels()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@shared': path.resolve(__dirname, 'shared'),
    },
  },
  server: {
    // 跨域隔离 → 多线程 WASM（离线小模型提速）；credentialless 允许跨域图片/音频
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless',
    },
    proxy: {
      '/api/tts': {
        target: 'https://nativethink.pages.dev',
        changeOrigin: true,
      },
      '/api/auth': {
        target: 'https://nativethink.pages.dev',
        changeOrigin: true,
      },
      '/api/data': {
        target: 'https://nativethink.pages.dev',
        changeOrigin: true,
      },
      '/api/ai': {
        target: 'https://nativethink.pages.dev',
        changeOrigin: true,
      },
      '/api/feedback': {
        target: 'https://nativethink.pages.dev',
        changeOrigin: true,
      },
      // 插图/维基/B站 — 之前漏配导致 dev 环境插图全部 404
      '/api/word-image': {
        target: 'https://nativethink.pages.dev',
        changeOrigin: true,
      },
      '/api/wikipedia': {
        target: 'https://nativethink.pages.dev',
        changeOrigin: true,
      },
      '/api/bilibili-info': {
        target: 'https://nativethink.pages.dev',
        changeOrigin: true,
      },
      '/api/bilibili-subtitle': {
        target: 'https://nativethink.pages.dev',
        changeOrigin: true,
      },
      '/api/bilibili-transcribe': {
        target: 'https://nativethink.pages.dev',
        changeOrigin: true,
      },
    },
  },
  build: {
    sourcemap: false,
    rolldownOptions: {
      output: {
        manualChunks(id) {
          // ── Vendor chunks (third-party libraries) ──

          // React core (~130KB) — loaded on every page
          if (id.includes('node_modules/react-dom/') || id.includes('node_modules/react/')) {
            return 'vendor-react';
          }
          // React Router (~40KB) — navigation
          if (id.includes('node_modules/react-router') || id.includes('node_modules/@remix-run')) {
            return 'vendor-router';
          }
          // Radix UI components (~100KB) — UI primitives
          if (id.includes('node_modules/@radix-ui/')) {
            return 'vendor-radix';
          }
          // Lucide icons (~50KB) — icon library
          if (id.includes('node_modules/lucide-react/')) {
            return 'vendor-icons';
          }
          // Framer Motion (~130KB) — animations
          if (id.includes('node_modules/framer-motion') || id.includes('node_modules/motion')) {
            return 'vendor-motion';
          }
          // Recharts (~200KB) — charts (only ProgressPage)
          if (id.includes('node_modules/recharts') || id.includes('node_modules/d3-')) {
            return 'vendor-charts';
          }
          // React Markdown (~100KB) — markdown rendering
          if (id.includes('node_modules/react-markdown') || id.includes('node_modules/remark-') ||
              id.includes('node_modules/unified') || id.includes('node_modules/mdast-') ||
              id.includes('node_modules/micromark') || id.includes('node_modules/unist-')) {
            return 'vendor-markdown';
          }
          // Date utilities (~20KB)
          if (id.includes('node_modules/date-fns/')) {
            return 'vendor-date';
          }
          // Zod (~30KB) — validation
          if (id.includes('node_modules/zod/')) {
            return 'vendor-zod';
          }

          // ── Wordbank data chunks (lazy-loaded) ──
          if (id.includes('data/cet4.ts')) return 'wordbank-cet4';
          if (id.includes('data/cet6.ts')) return 'wordbank-cet6';
          if (id.includes('data/ielts.ts')) return 'wordbank-ielts';
          if (id.includes('data/toefl.ts')) return 'wordbank-toefl';
          if (id.includes('data/advanced.ts')) return 'wordbank-advanced';
          if (id.includes('data/zhongkao.ts')) return 'wordbank-zhongkao';
          if (id.includes('data/gaokao.ts')) return 'wordbank-gaokao';
          if (id.includes('data/postgraduate.ts')) return 'wordbank-postgraduate';
          if (id.includes('data/professional.ts')) return 'wordbank-professional';
        },
      },
    },
  },
})
