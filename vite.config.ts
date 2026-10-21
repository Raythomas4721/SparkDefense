import { defineConfig } from 'vitest/config';

export default defineConfig({
  // 相對路徑，方便部署到 GitHub Pages 的子路徑
  base: './',
  build: {
    // Phaser 本身約 1.2 MB，單獨切成一個 chunk
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks: { phaser: ['phaser'] },
      },
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
