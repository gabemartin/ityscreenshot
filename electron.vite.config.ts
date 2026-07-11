import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    plugins: [react()],
    server: {
      // Ship Studio expects the renderer on 3000; scripts/dev.mjs sets this from --port
      port: Number(process.env.SHIPSTUDIO_DEV_PORT) || 3000,
      strictPort: true
    }
  }
})
