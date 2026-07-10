import path from 'path'
import type { Plugin } from 'vite'
import { defineConfig } from '@lark-apaas/coding-preset-vite-react'

// Replace platform template placeholders for standalone/Cloudflare deployment
function fixHtmlPlaceholders(): Plugin {
  return {
    name: 'fix-html-placeholders',
    enforce: 'post', // run after ogMetaPlugin replaces title with {{appName}}
    transformIndexHtml(html) {
      return html
        .replace(/{{appName}}/g, 'NativeThink')
        .replace(/{{appDescription}}/g, '英语母语思维训练')
        .replace(/{{appAvatar}}/g, '/favicon.svg')
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
  build: {
    rolldownOptions: {
      output: {
        manualChunks(id) {
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
