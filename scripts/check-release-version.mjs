// Verify that every versioned manifest matches the release tag.
// A mismatch makes the updater compare against the wrong current version,
// which can cause repeated update prompts or missed updates.
//
// Usage: node scripts/check-release-version.mjs v0.0.16
import { readFileSync } from 'node:fs'

const tag = process.argv[2] || process.env.GITHUB_REF_NAME || ''
const version = tag.replace(/^v/, '')
if (!version) {
  console.error('Missing release tag (expected vX.Y.Z)')
  process.exit(1)
}

const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
const tauri = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8'))
const docs = readFileSync('docs/index.html', 'utf8')
const cargo = readFileSync('src-tauri/Cargo.toml', 'utf8')

const docVersion = docs.match(/const APP_VERSION = '([^']+)'/)?.[1]
const cargoVersion = cargo.match(/^version = "([^"]+)"/m)?.[1]

const files = {
  'package.json': pkg.version,
  'src-tauri/tauri.conf.json': tauri.version,
  'docs/index.html': docVersion,
  'src-tauri/Cargo.toml': cargoVersion,
}

let failed = false
for (const [file, actual] of Object.entries(files)) {
  if (actual !== version) {
    console.error(`✗ ${file}: ${actual ?? 'missing'} (expected ${version})`)
    failed = true
  } else {
    console.log(`✓ ${file}: ${actual}`)
  }
}

if (failed) process.exit(1)
