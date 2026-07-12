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
    },
  },
  build: {
    sourcemap: false,
    rolldownOptions: {
      output: {
        manualChunks(id) {
          // Extract framer-motion into its own chunk (~150KB) so it stays off the main bundle
          if (id.includes('node_modules/framer-motion') || id.includes('node_modules/motion')) {
            return 'framer-motion';
          }
          // Split wordbank data into per-level chunks to stay under Cloudflare's 25 MiB limit
          if (id.includes('data/cet4.ts')) return 'wordbank-cet4';
          if (id.includes('data/cet6.ts')) return 'wordbank-cet6';
          if (id.includes('data/ielts.ts')) return 'wordbank-ielts';
          if (id.includes('data/toefl.ts')) return 'wordbank-toefl';
          if (id.includes('data/advanced.ts')) return 'wordbank-advanced';
        },
      },
    },
  },
})
