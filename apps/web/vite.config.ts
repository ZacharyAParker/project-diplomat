import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// A relative base, so the build can be opened from any folder or sub-path.
export default defineConfig({
  base: './',
  plugins: [react()],
  // The pack is compiled into the bundle and is more than half of it, so the usual
  // warning about a large chunk would fire on every build and mean nothing.
  build: { target: 'es2023', chunkSizeWarningLimit: 1200 },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
    restoreMocks: true,
  },
})
