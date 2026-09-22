// Writes dist/staticwebapp.config.json for one build mode.
//
// public/staticwebapp.config.json is the template. Its Content-Security-Policy needs the API origin in
// connect-src, and that origin differs per environment, so it is filled in here from VITE_API_BASE_URL
// (a variable in the environment wins over the .env.<mode> file, exactly as it does for `vite build`).
//
// Usage: node scripts/write-swa-config.mjs <mode>
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { loadEnv } from 'vite'

export const PLACEHOLDER = '__API_ORIGIN__'

/** The origin (scheme, host, port) of the API URL: the only thing a CSP source expression may contain. */
export function apiOrigin(apiBaseUrl) {
  let url
  try {
    url = new URL(apiBaseUrl)
  } catch {
    throw new Error(`VITE_API_BASE_URL is not a valid URL: "${apiBaseUrl}"`)
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(`VITE_API_BASE_URL must be http(s), got "${apiBaseUrl}"`)
  }
  return url.origin
}

export function renderConfig(templateText, apiBaseUrl) {
  const origin = apiOrigin(apiBaseUrl)
  if (!templateText.includes(PLACEHOLDER)) throw new Error(`The template has no ${PLACEHOLDER} placeholder`)
  const rendered = templateText.replaceAll(PLACEHOLDER, origin)
  return `${JSON.stringify(JSON.parse(rendered), null, 2)}\n`
}

async function main() {
  const mode = process.argv[2]
  if (!mode) throw new Error('Usage: node scripts/write-swa-config.mjs <mode>')
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const env = loadEnv(mode, root, 'VITE_')
  const template = await readFile(path.join(root, 'public', 'staticwebapp.config.json'), 'utf8')
  const output = renderConfig(template, env.VITE_API_BASE_URL ?? '')
  await writeFile(path.join(root, 'dist', 'staticwebapp.config.json'), output)
  const origin = apiOrigin(env.VITE_API_BASE_URL)
  console.log(`dist/staticwebapp.config.json written (mode ${mode}, connect-src ${origin})`)
  if (new URL(origin).hostname.endsWith('.invalid')) {
    console.warn(`WARNING: ${origin} is a placeholder. Set VITE_API_BASE_URL (Terraform output api_url) before deploying.`)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message)
    process.exit(1)
  })
}
