import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  // wasm-pack(web target) 通过 `new URL('*.wasm', import.meta.url)` 定位 wasm，
  // 不能让 esbuild 预打包，否则 import.meta.url 指向被打包的 chunk、wasm 会 404。
  optimizeDeps: {
    exclude: ['@firecrawl/anydoc-wasm'],
  },
})
