// Adds a Content-Security-Policy <meta> tag to dist/index.html for the GitHub Pages build.
//
// GitHub Pages cannot send response headers, so the policy that public/staticwebapp.config.json delivers as a
// header on Azure Static Web Apps is embedded in the page instead. The frame-ancestors directive is dropped: browsers
// ignore it inside a <meta> tag, so Pages cannot stop the console being framed.
//
// Usage: node scripts/write-pages-csp.mjs <mode>
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { loadEnv } from 'vite'
import { renderConfig } from './write-swa-config.mjs'

/** The CSP from the rendered Static Web Apps config, without the directives a <meta> tag cannot carry. */
export function metaPolicy(renderedConfig) {
  const csp = JSON.parse(renderedConfig)?.globalHeaders?.['Content-Security-Policy']
  if (!csp) throw new Error('The config has no Content-Security-Policy header')
  return csp
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part && !part.startsWith('frame-ancestors'))
    .join('; ')
}

export function injectMeta(html, policy) {
  if (html.includes('http-equiv="Content-Security-Policy"')) throw new Error('index.html already has a CSP meta tag')
  const tag = `<meta http-equiv="Content-Security-Policy" content="${policy.replaceAll('"', '&quot;')}" />`
  if (!/<head[^>]*>/i.test(html)) throw new Error('index.html has no <head> element')
  return html.replace(/<head[^>]*>/i, (head) => `${head}\n    ${tag}`)
}

async function main() {
  const mode = process.argv[2]
  if (!mode) throw new Error('Usage: node scripts/write-pages-csp.mjs <mode>')
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const env = loadEnv(mode, root, 'VITE_')
  const template = await readFile(path.join(root, 'public', 'staticwebapp.config.json'), 'utf8')
  const policy = metaPolicy(renderConfig(template, env.VITE_API_BASE_URL ?? ''))
  const file = path.join(root, 'dist', 'index.html')
  await writeFile(file, injectMeta(await readFile(file, 'utf8'), policy))
  console.log(`dist/index.html: CSP meta tag added (mode ${mode})`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message)
    process.exit(1)
  })
}
