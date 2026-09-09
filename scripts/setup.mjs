#!/usr/bin/env node
/**
 * First-run walkthrough for a new SpecShot developer.
 * Interactive on a TTY; pass --yes to accept defaults (agents).
 */
import { spawnSync } from 'node:child_process'
import { createInterface } from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { copyFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const yes =
  process.argv.includes('--yes') ||
  process.argv.includes('-y') ||
  process.env.SPECSHOT_SETUP_YES === '1' ||
  !process.stdin.isTTY

function say(title, body) {
  console.log('')
  console.log(`── ${title}`)
  if (body) console.log(body)
}

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, {
    cwd: root,
    stdio: 'inherit',
    ...opts
  })
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

async function ask(rl, question, defaultYes = true) {
  if (yes) return defaultYes
  const hint = defaultYes ? 'Y/n' : 'y/N'
  const answer = (await rl.question(`${question} [${hint}] `)).trim().toLowerCase()
  if (!answer) return defaultYes
  return answer === 'y' || answer === 'yes'
}

const electronIcns = join(
  root,
  'node_modules/electron/dist/Electron.app/Contents/Resources/electron.icns'
)
const productIcns = join(root, 'resources/icon.icns')

say('SpecShot setup', 'macOS + Node 20+ required. No .env or API keys.')

const nodeMajor = Number(process.versions.node.split('.')[0])
if (nodeMajor < 20) {
  console.error(`Node ${process.versions.node} found. Install Node 20 or newer, then re-run.`)
  process.exit(1)
}
if (process.platform !== 'darwin') {
  console.error('SpecShot is a macOS Electron app. Setup must run on a Mac.')
  process.exit(1)
}
console.log(`Node ${process.versions.node} ✓`)

if (!existsSync(join(root, 'node_modules'))) {
  say('Dependencies', 'Running npm install…')
  run('npm', ['install'])
} else {
  console.log('node_modules already present ✓')
}

const rl = yes ? null : createInterface({ input, output })

try {
  say(
    'Dev vs packaged',
    [
      '  npm run dev          — edit code; window opens from the Electron binary',
      '  npm run install:app  — build SpecShot.app and copy it to /Applications',
      '  Use the Applications copy for daily annotate-and-export work.',
      '  Use npm run dev when you are changing the product.'
    ].join('\n')
  )

  const copyIcon = await ask(
    rl,
    'Copy resources/icon.icns onto the Electron.dev dock icon? (redo after Electron upgrades)',
    true
  )
  if (copyIcon) {
    if (!existsSync(productIcns)) {
      console.warn('resources/icon.icns missing — skipped dock icon.')
    } else if (!existsSync(electronIcns)) {
      console.warn('Electron.app not found under node_modules — run npm install first.')
    } else {
      copyFileSync(productIcns, electronIcns)
      console.log('Dev dock icon replaced ✓')
    }
  }

  const installApp = await ask(
    rl,
    'Build SpecShot and install SpecShot.app into /Applications?',
    true
  )
  if (installApp) {
    run('bash', [join(root, 'scripts/install-app.sh')])
  } else {
    console.log('Skipped /Applications install. Run npm run install:app later.')
  }
} finally {
  rl?.close()
}

say(
  'First-run checklist',
  [
    '  1. Open SpecShot from /Applications (Spotlight: SpecShot).',
    '  2. Global hotkey ⌘⇧2 shows the window from anywhere.',
    '  3. The window hides to the menu-bar tray instead of quitting.',
    '  4. Paste a screenshot with ⌘V, or drop an image / .zip / .speck onto the window.',
    '  5. Click to place notes; N / A / S / C switch note / arrow / square / circle.',
    '  6. Save Project writes a .zip bundle for LLM intake; Copy Image grabs a Retina PNG.',
    '  7. Day-to-day coding: npm run dev. After Electron upgrades, re-copy the dock icon.',
    '',
    'Agent skills in this repo:',
    '  .cursor/skills/specshot-setup',
    '  .cursor/skills/install-to-applications'
  ].join('\n')
)
