import { createHash } from 'node:crypto'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import { defineConfig } from 'vitest/config'

// Headers for the local server. The game is static, so they are all about what a page may
// do: nothing framed, nothing sniffed, no camera or microphone, no referrer sent anywhere.
const HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
}

// Adds a Content Security Policy to the built page. Only the build gets one, because the
// development server injects its own inline scripts. The one inline script the page keeps
// (it sets the theme before the first paint) is allowed by its hash, so nothing else inline
// can run. Styles allow inline attributes, which React uses for widths and flag sizes.
function contentSecurityPolicy(): Plugin {
  return {
    name: 'content-security-policy',
    apply: 'build',
    transformIndexHtml(html) {
      const hashes = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(
        ([, body]) => `'sha256-${createHash('sha256').update(body ?? '').digest('base64')}'`,
      )
      const policy = [
        "default-src 'self'",
        `script-src 'self' ${hashes.join(' ')}`,
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "font-src 'self'",
        "connect-src 'self'",
        "object-src 'none'",
        "base-uri 'none'",
        "form-action 'none'",
      ].join('; ')
      return html.replace(
        '<meta charset="utf-8" />',
        `<meta charset="utf-8" />\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`,
      )
    },
  }
}

// A relative base, so the build can be opened from any folder or sub-path.
export default defineConfig({
  base: './',
  plugins: [react(), contentSecurityPolicy()],
  // The pack is compiled into the bundle and is more than half of it, so the usual
  // warning about a large chunk would fire on every build and mean nothing.
  build: { target: 'es2023', chunkSizeWarningLimit: 1200 },
  preview: { headers: HEADERS },
  // The game's server does everything; the dev server only proxies to it (pnpm dev:server).
  server: { headers: HEADERS, proxy: { '/api': { target: 'http://127.0.0.1:8150', changeOrigin: true } } },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
    restoreMocks: true,
  },
})
