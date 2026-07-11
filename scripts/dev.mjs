#!/usr/bin/env node
/**
 * Ship Studio (and Vite-style tooling) pass `--port`. electron-vite's CLI
 * does not accept that flag and crashes with CACError. This wrapper maps
 * `--port` / `-p` onto the renderer server via SHIPSTUDIO_DEV_PORT, then
 * forwards the remaining args to electron-vite.
 */
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const args = process.argv.slice(2)
const forwarded = []
let port = process.env.PORT ? Number(process.env.PORT) : 3000

for (let i = 0; i < args.length; i++) {
  const arg = args[i]
  if (arg === '--port' || arg === '-p') {
    const next = args[i + 1]
    if (next && !next.startsWith('-')) {
      port = Number(next)
      i++
    }
    continue
  }
  if (arg.startsWith('--port=')) {
    port = Number(arg.slice('--port='.length))
    continue
  }
  forwarded.push(arg)
}

process.env.SHIPSTUDIO_DEV_PORT = String(Number.isFinite(port) ? port : 3000)

const electronViteBin = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'node_modules',
  'electron-vite',
  'bin',
  'electron-vite.js'
)

const child = spawn(process.execPath, [electronViteBin, 'dev', ...forwarded], {
  stdio: 'inherit',
  env: process.env
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 1)
})
