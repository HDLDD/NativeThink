import path from 'path'
import { defineConfig } from '@lark-apaas/coding-preset-vite-react'

export default defineConfig({
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
