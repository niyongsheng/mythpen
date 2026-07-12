#!/usr/bin/env node
// Copy sql-wasm.wasm from node_modules to server/ so bun --compile --assets can bundle it.
// Cross-platform: works on macOS, Linux, Windows CI.
import { copyFileSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)

// Resolve the real path of sql.js (follows pnpm symlinks)
const pkgPath = require.resolve('sql.js/package.json')
const src = join(dirname(pkgPath), 'dist', 'sql-wasm.wasm')

// Destination: server/sql-wasm.wasm
const __dirname = dirname(fileURLToPath(import.meta.url))
const dest = join(__dirname, '..', 'server', 'sql-wasm.wasm')

if (!existsSync(src)) {
  console.error(`❌ WASM not found at: ${src}`)
  process.exit(1)
}

copyFileSync(src, dest)
console.log(`✅ WASM copied: ${src} → ${dest}`)
