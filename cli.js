#!/usr/bin/env node

import fs from 'fs'
import { execSync } from 'child_process'

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
    return execSync(`git log -1 --format=%B ${commit}`, { encoding: 'utf8' }).trim()
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
      commit
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

function generateHtml(commit, commitMessage, diffOutput) {
  // Escape the diff output for use in JavaScript string
  const escapedDiff = diffOutput.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r')
  const escapedMessage = escapeHtml(commitMessage)

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Commit ${commit} Diff</title>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/diff2html/bundles/css/diff2html.min.css">
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

  <script src="https://cdn.jsdelivr.net/npm/diff2html/bundles/js/diff2html-ui.min.js"></script>
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

function main() {
  const commit = process.argv[2] || getLastCommitHash()
  console.log(`Generating diff for commit: ${commit}`)

  const commitMessage = getCommitMessage(commit)
  const diffOutput = getCommitDiff(commit)
  const html = generateHtml(commit, commitMessage, diffOutput)

  const outputFile = `commit-${commit}-diff.html`
  fs.writeFileSync(outputFile, html)
  console.log(`Self-contained HTML file created: ${outputFile}`)
}

main()
