#!/usr/bin/env node

// Fetch and store CDN assets locally under ./libs so cli.js can inline them.
// Uses Node 18+ global fetch.

import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
// libs at repo root (parent of scripts/)
const repoRoot = path.resolve(__dirname, '..')
const libsDir = path.join(repoRoot, 'libs')

async function ensureDir(dir) {
  await fsp.mkdir(dir, { recursive: true })
}

async function download(url, destPath) {
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`)
  }
  const buf = Buffer.from(await res.arrayBuffer())
  await fsp.writeFile(destPath, buf)
  return destPath
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'))
}

function getDiff2HtmlVersion() {
  const pkg = readJson(path.join(repoRoot, 'package.json'))
  const spec = (pkg.dependencies && pkg.dependencies.diff2html) || 'latest'
  // Try to use installed version if available; else strip ^/~ from spec.
  try {
    const installed = readJson(
      path.join(repoRoot, 'node_modules', 'diff2html', 'package.json'),
    )
    if (installed.version) return installed.version
  } catch {}
  return spec.replace(/^\^|~|>=?\s*/g, '') || 'latest'
}

async function main() {
  const diff2htmlVersion = getDiff2HtmlVersion()
  const highlightVersion = '11.9.0' // matches current CDN usage

  await ensureDir(libsDir)

  const assets = [
    {
      url: `https://cdn.jsdelivr.net/npm/diff2html@${diff2htmlVersion}/bundles/js/diff2html-ui.min.js`,
      out: path.join(libsDir, 'diff2html-ui.min.js'),
    },
    {
      url: `https://cdn.jsdelivr.net/npm/diff2html@${diff2htmlVersion}/bundles/css/diff2html.min.css`,
      out: path.join(libsDir, 'diff2html.min.css'),
    },
    {
      url: `https://cdnjs.cloudflare.com/ajax/libs/highlight.js/${highlightVersion}/styles/github.min.css`,
      out: path.join(libsDir, 'highlightjs-github.min.css'),
    },
  ]

  console.log(`Fetching assets to ${path.relative(repoRoot, libsDir)} ...`)

  for (const a of assets) {
    const name = path.basename(a.out)
    process.stdout.write(`- ${name} <- ${a.url} ... `)
    try {
      await download(a.url, a.out)
      console.log('OK')
    } catch (err) {
      console.log('FAIL')
      console.error(err.message)
      process.exitCode = 1
    }
  }

  console.log('Done.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
