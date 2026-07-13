import path from 'path'
import type { Plugin } from 'vite'
import { defineConfig } from '@lark-apaas/coding-preset-vite-react'

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
  plugins: [fixHtmlPlaceholders()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@shared': path.resolve(__dirname, 'shared'),
    },
  },
  server: {
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
