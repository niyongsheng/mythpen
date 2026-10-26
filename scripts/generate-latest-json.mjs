// Build the updater manifest (latest.json) from CI artifacts.
//
// Each build job uploads its bundle directory. This script locates the updater
// artifact and its .sig file for every platform, then writes latest.json next
// to the downloaded artifact folders. The release workflow uploads that file
// as a release asset, which the app reads from:
//   https://github.com/<owner>/<repo>/releases/latest/download/latest.json
//
// Usage: node scripts/generate-latest-json.mjs [artifacts-dir]
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'

const repo = process.env.GITHUB_REPOSITORY
const tag = process.env.RELEASE_TAG || process.env.GITHUB_REF_NAME
const root = process.argv[2] || '.'

if (!repo || !tag) {
  console.error('GITHUB_REPOSITORY and RELEASE_TAG (or GITHUB_REF_NAME) are required')
  process.exit(1)
}

const version = tag.replace(/^v/, '')

// The updater looks up `{os}-{arch}-{bundle-type}` first and only falls back to
// `{os}-{arch}`. Linux ships three install formats that cannot be swapped for
// one another (a deb install rejects an AppImage and vice versa), so each gets
// its own manifest entry. The generic `linux-x86_64` entry stays for clients
// built before the bundle-type aware lookup and points at the AppImage.
const PLATFORMS = [
  {
    key: 'darwin-aarch64',
    artifact: 'Mythpen-macOS-ARM',
    isUpdaterArtifact: (name) => name.endsWith('.app.tar.gz'),
  },
  {
    key: 'windows-x86_64',
    artifact: 'Mythpen-Windows-x86_64',
    isUpdaterArtifact: (name) => name.endsWith('-setup.exe'),
  },
  {
    key: 'linux-x86_64-appimage',
    artifact: 'Mythpen-Linux-x86_64',
    isUpdaterArtifact: (name) => name.endsWith('.AppImage'),
  },
  {
    key: 'linux-x86_64-deb',
    artifact: 'Mythpen-Linux-x86_64',
    isUpdaterArtifact: (name) => name.endsWith('.deb'),
  },
  {
    key: 'linux-x86_64-rpm',
    artifact: 'Mythpen-Linux-x86_64',
    isUpdaterArtifact: (name) => name.endsWith('.rpm'),
  },
  {
    key: 'linux-x86_64',
    artifact: 'Mythpen-Linux-x86_64',
    isUpdaterArtifact: (name) => name.endsWith('.AppImage'),
  },
]

function walk(dir) {
  const files = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) files.push(...walk(full))
    else files.push(full)
  }
  return files
}

const filesByDir = new Map()
function filesIn(dir) {
  if (!filesByDir.has(dir)) filesByDir.set(dir, walk(dir))
  return filesByDir.get(dir)
}

const platforms = {}
for (const platform of PLATFORMS) {
  const dir = join(root, platform.artifact)
  if (!existsSync(dir)) {
    console.error(`Missing artifact directory: ${dir}`)
    process.exit(1)
  }

  const artifact = filesIn(dir).find((file) => platform.isUpdaterArtifact(basename(file)))
  if (!artifact) {
    console.error(`No updater artifact (${platform.key}) found in ${dir}`)
    process.exit(1)
  }

  const signaturePath = `${artifact}.sig`
  if (!existsSync(signaturePath)) {
    console.error(`Missing signature file: ${signaturePath}`)
    process.exit(1)
  }

  const name = basename(artifact)
  platforms[platform.key] = {
    signature: readFileSync(signaturePath, 'utf8').trim(),
    url: `https://github.com/${repo}/releases/download/${tag}/${encodeURIComponent(name)}`,
  }
  console.log(`${platform.key}: ${name}`)
}

const manifest = {
  version,
  pub_date: new Date().toISOString(),
  platforms,
}

const outputPath = join(root, 'latest.json')
writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`)
console.log(`Wrote ${outputPath} for v${version}`)
