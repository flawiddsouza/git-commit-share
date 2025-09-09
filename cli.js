#!/usr/bin/env node

import fs from 'fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'child_process'
import { JSDOM } from 'jsdom'

function getLastCommitHash() {
  try {
    return execSync('git log --oneline -1', { encoding: 'utf8' })
      .split(' ')[0]
      .trim()
  } catch (error) {
    console.error('Error getting last commit hash:', error.message)
    process.exit(1)
  }
}

function getCommitMessage(commit) {
  try {
    // %B prints the raw body (subject + body) of the commit message
    return execSync(`git log -1 --format=%B ${commit}`, {
      encoding: 'utf8',
    }).trim()
  } catch (error) {
    console.error('Error getting commit message:', error.message)
    process.exit(1)
  }
}

function getCommitDiff(commit) {
  try {
    // Use stable diff flags to avoid color codes, use patience algorithm,
    // detect renames/copies, and ignore CR-only EOL noise.
    const cmd = [
      'git',
      '--no-pager',
      'show',
      '--no-color',
      '--no-ext-diff',
      '--unified=3',
      '--diff-algorithm=patience',
      '-M', // detect renames
      '-C', // detect copies
      '--ignore-cr-at-eol',
      commit,
    ].join(' ')

    return execSync(cmd, { encoding: 'utf8' })
  } catch (error) {
    console.error('Error getting commit diff:', error.message)
    process.exit(1)
  }
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Resolve libs directory relative to this file so it works when installed globally
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const libsDir = path.resolve(__dirname, 'libs')

function readLibRequired(file) {
  const p = path.join(libsDir, file)
  try {
    return fs.readFileSync(p, 'utf8')
  } catch (e) {
    console.error(
      `Missing required library: ${file} in ${libsDir}.\n` +
        `Run: npm run fetch:libs\n` +
        `or:  node ./scripts/fetch-libs.js`,
    )
    process.exit(1)
  }
}

function safeInline(content, kind) {
  if (!content) return ''
  if (kind === 'script') return content.replace(/<\/script>/gi, '<\\/script>')
  if (kind === 'style') return content.replace(/<\/style>/gi, '<\\/style>')
  return content
}

function generateHtml(commit, commitMessage, diffOutput) {
  // Escape the diff output for use in JavaScript string
  const escapedDiff = diffOutput
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
  const escapedMessage = escapeHtml(commitMessage)

  // Load required local libs (must exist)
  const cssHighlight = readLibRequired('highlightjs-github.min.css')
  const cssDiff2Html = readLibRequired('diff2html.min.css')
  const jsDiff2Html = readLibRequired('diff2html-ui.min.js')

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Commit ${commit} Diff</title>
  <style>${safeInline(cssHighlight, 'style')}</style>
  <style>${safeInline(cssDiff2Html, 'style')}</style>
  <style>
    body {
      font-family: Arial, sans-serif;
      margin: 20px;
    }
    h1 {
      color: #333;
    }
    .commit-meta {
      background: #f6f8fa;
      border: 1px solid #d0d7de;
      border-radius: 6px;
      padding: 12px 16px;
      margin-top: 8px;
      white-space: pre-wrap; /* preserve newlines in message */
    }
    #diff-container {
      margin-top: 20px;
    }
  </style>
</head>
<body>
  <h1>Changes in Commit ${commit}</h1>
  <div class="commit-meta" id="commit-message">${escapedMessage || 'No commit message'}</div>
  <div id="diff-container"></div>
  <script>${safeInline(jsDiff2Html, 'script')}</script>
  <script>
    document.addEventListener('DOMContentLoaded', function() {
      const diffString = '${escapedDiff}'
      const targetElement = document.getElementById('diff-container')
      const configuration = {
        drawFileList: true,
        matching: 'lines',
        outputFormat: 'side-by-side',
        highlight: true,
        synchronisedScroll: true,
        fileListToggle: true,
        fileListStartVisible: false,
        fileContentToggle: true,
        stickyFileHeaders: true,
        colorScheme: 'auto'
      }

      const diff2htmlUi = new Diff2HtmlUI(targetElement, diffString, configuration)
      diff2htmlUi.draw()
      diff2htmlUi.highlightCode()
      diff2htmlUi.synchronisedScroll()
    })
  </script>
</body>
</html>
  `.trim()
}

// Generate a fully static HTML by executing the existing inline scripts in a headless DOM
async function generateStaticHtml(commit, commitMessage, diffOutput) {
  const base = generateHtml(commit, commitMessage, diffOutput)

  // Create a DOM, execute inline scripts (diff2html-ui + our boot script)
  const dom = new JSDOM(base, {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    url: 'https://local.example/',
  })

  // Wait until the diff has been rendered into #diff-container or timeout
  await new Promise((resolve) => {
    const start = Date.now()
    function check() {
      const el = dom.window.document.getElementById('diff-container')
      if (el && el.children && el.children.length > 0) return resolve()
      if (Date.now() - start > 5000) return resolve() // give up after 5s
      setTimeout(check, 25)
    }
    // Also wait for load to fire once
    dom.window.addEventListener('load', () => setTimeout(check, 10))
    // Fallback: start polling soon in case scripts already ran
    setTimeout(check, 20)
  })

  // Strip all scripts in-place to make it static, then serialize
  dom.window.document.querySelectorAll('script').forEach((s) => s.remove())
  return dom.serialize()
}

async function main() {
  const args = process.argv.slice(2)
  const isStatic = args.includes('--static')
  const positional = args.filter((a) => !a.startsWith('-'))
  const commit = positional[0] || getLastCommitHash()
  console.log(
    `Generating ${isStatic ? 'static ' : ''}diff for commit: ${commit}`,
  )

  const commitMessage = getCommitMessage(commit)
  const diffOutput = getCommitDiff(commit)
  const html = isStatic
    ? await generateStaticHtml(commit, commitMessage, diffOutput)
    : generateHtml(commit, commitMessage, diffOutput)

  const outputFile = `commit-${commit}-diff.html`
  fs.writeFileSync(outputFile, html)
  console.log(
    `${isStatic ? 'Static (no JS) ' : ''}HTML file created: ${outputFile}`,
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
