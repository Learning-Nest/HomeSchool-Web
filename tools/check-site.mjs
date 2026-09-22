#!/usr/bin/env node
// Static checks for site/ — no build step, no dependencies beyond Node's stdlib.
//
// For every site/*.html page, checks:
//   - has a non-empty <title>
//   - the <html> tag has a lang attribute
//   - has a <meta name="description" content="..."> with non-empty content
//   - every internal href/src attribute resolves to a real file under site/
//
// Usage: node tools/check-site.mjs
// Exit code 0 if everything passes, 1 if any problem is found (problems are printed to stderr).

import { readFile, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const siteDir = path.resolve(here, '..', 'site')

/** Recursively list files under `dir`, returning paths relative to `dir`. */
async function listFiles(dir, base = dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await listFiles(full, base)))
    } else if (entry.isFile()) {
      files.push(path.relative(base, full))
    }
  }
  return files
}

function isInternalRef(value) {
  if (!value) return false
  const v = value.trim()
  if (v === '') return false
  if (v.startsWith('#')) return false // pure in-page anchor
  if (v.startsWith('mailto:') || v.startsWith('tel:')) return false
  if (v.startsWith('data:')) return false
  if (/^[a-z][a-z0-9+.-]*:/i.test(v)) return false // any other scheme (http:, https:, etc.)
  if (v.startsWith('//')) return false // protocol-relative external
  return true
}

async function fileExists(p) {
  try {
    const s = await stat(p)
    return s.isFile()
  } catch {
    return false
  }
}

async function checkPage(relPath, allFiles) {
  const problems = []
  const fullPath = path.join(siteDir, relPath)
  const html = await readFile(fullPath, 'utf8')

  // <html ... lang="...">
  const htmlTagMatch = html.match(/<html\b([^>]*)>/i)
  if (!htmlTagMatch) {
    problems.push('missing <html> tag')
  } else {
    const langMatch = htmlTagMatch[1].match(/\blang\s*=\s*["']([^"']*)["']/i)
    if (!langMatch || langMatch[1].trim() === '') {
      problems.push('<html> tag is missing a non-empty lang attribute')
    }
  }

  // <title>
  const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i)
  if (!titleMatch || titleMatch[1].trim() === '') {
    problems.push('missing or empty <title>')
  }

  // <meta name="description" content="...">
  const metaTags = html.match(/<meta\b[^>]*>/gi) || []
  const descriptionMeta = metaTags.find((tag) => /name\s*=\s*["']description["']/i.test(tag))
  if (!descriptionMeta) {
    problems.push('missing <meta name="description">')
  } else {
    const contentMatch = descriptionMeta.match(/content\s*=\s*["']([^"']*)["']/i)
    if (!contentMatch || contentMatch[1].trim() === '') {
      problems.push('<meta name="description"> has empty content')
    }
  }

  // internal href/src references
  const refMatches = html.matchAll(/\b(?:href|src)\s*=\s*["']([^"']+)["']/gi)
  const pageDir = path.dirname(relPath)
  for (const match of refMatches) {
    const raw = match[1]
    if (!isInternalRef(raw)) continue
    const [withoutHash] = raw.split('#')
    const withoutQuery = withoutHash.split('?')[0]
    if (withoutQuery === '') continue // e.g. "?query" or same-page reference

    const targetRelToSite = withoutQuery.startsWith('/')
      ? withoutQuery.slice(1)
      : path.normalize(path.join(pageDir, withoutQuery))
    const targetFull = path.join(siteDir, targetRelToSite)

    if (!(await fileExists(targetFull))) {
      problems.push(`broken internal reference "${raw}" (resolved to site/${targetRelToSite})`)
    }
  }

  return problems
}

async function main() {
  const allFiles = await listFiles(siteDir)
  const htmlFiles = allFiles.filter((f) => f.endsWith('.html')).sort()

  if (htmlFiles.length === 0) {
    console.error(`No .html files found under ${siteDir}`)
    process.exitCode = 1
    return
  }

  let problemCount = 0
  for (const relPath of htmlFiles) {
    const problems = await checkPage(relPath, allFiles)
    if (problems.length > 0) {
      problemCount += problems.length
      console.error(`\n${relPath}:`)
      for (const problem of problems) {
        console.error(`  - ${problem}`)
      }
    }
  }

  if (problemCount > 0) {
    console.error(`\ncheck-site: ${problemCount} problem(s) across ${htmlFiles.length} page(s).`)
    process.exitCode = 1
  } else {
    console.log(`check-site: ${htmlFiles.length} page(s) OK.`)
  }
}

main().catch((error) => {
  console.error(error.stack || error.message)
  process.exitCode = 1
})
