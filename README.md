# web

Front-end for the HomeSchooling platform: a public marketing site and a content-admin console, deployed as two
separate Azure Static Web Apps.

## Folder map

| Folder | What it is | Build step |
| --- | --- | --- |
| `site/` | Public marketing website (home, how it works, for parents, curriculum, pricing, contact, privacy notice, terms, 404). | None — plain HTML/CSS/vanilla JS, served as-is. No trackers, no external scripts. |
| `admin/` | Content-admin console (React + TypeScript + Vite SPA) used by staff to manage activities and content. | Vite build (`pnpm run build:<env>`), output in `admin/dist`. |
| `tools/` | Repo-wide scripts, currently `check-site.mjs`. | Node stdlib only, no dependencies. |
| `.github/workflows/` | CI (`ci.yml`) and deploy (`deploy.yml`) pipelines. | — |

`site/` is intentionally public/indexable; `admin/` is not (its `staticwebapp.config.json` sends
`X-Robots-Tag: noindex, nofollow`, and there's nothing behind it worth crawling).

## Who uses the admin console

Everyone signs in at the same address; what they see depends on their platform role.

| Role | Sees | Can do |
| --- | --- | --- |
| `educator` | My activities, New activity | Build activities in the guided builder (number of exercises, kind of each exercise, skills per exercise, pictures on exercises, choices and match/order items), check them, and send them for review. Only their own drafts; once sent they are read-only until a reviewer answers. |
| `content_admin` | Everything above for all activities, plus Dashboard, Review queue, Educators, Activity log, Import | Publish, send back with a note (required), archive, edit anyone's activity in the JSON editor, see what each educator did and export the log as CSV. |
| `super_admin` | Everything `content_admin` sees | Also invite educators (a temporary password is emailed; it must be replaced at first sign-in) and disable or enable their accounts. |

The builder saves drafts by itself (a few seconds after the last change) without requiring them to be complete. "Check this
activity" runs the same validation the server runs on submit and records the result; any later change means checking again,
and the server refuses a submit whose content was not the content that passed. Pictures are uploaded to the activity
(JPEG/PNG/WebP up to 5 MB) and shown from short-lived links, so the CSP in `admin/public/staticwebapp.config.json` allows
`img-src` from Azure Blob Storage and the API origin. The wire format is documented in
`api-contracts/docs/activity-format-v2.md`.

## Setup

You need Node.js 22.13+ and pnpm 10 (`npm install -g pnpm`). `admin/` is a Vite React app with its own `package.json`; `site/` has no
dependencies at all.

### Windows (PowerShell)

```powershell
cd web\admin
pnpm install
pnpm dev
```

### macOS / Linux

```bash
cd web/admin
pnpm install
pnpm dev
```

`pnpm dev` starts the admin console at `http://localhost:5173`, talking to whatever API
`admin/.env.dev`'s `VITE_API_BASE_URL` points at (see below for running a local API).

There's nothing to install or build for `site/` — open any `site/*.html` file directly, or serve the folder
with any static file server, e.g.:

```bash
npx serve site
# or
python3 -m http.server 8080 --directory site
```

## Environment files (`admin/.env.*`)

Vite loads one of these per build mode. Only `VITE_`-prefixed keys belong here — everything in them ends up in
the public JS bundle, so **never put secrets in these files**. They are committed to the repo on purpose
(they hold public values only) and must stay out of `.gitignore`.

| File | Mode | Used by |
| --- | --- | --- |
| `admin/.env.dev` | `dev` | `pnpm dev`, `pnpm run build:dev` — points at `http://localhost:8000` by default. |
| `admin/.env.nonprod` | `nonprod` | `pnpm run build:nonprod` — placeholder API URL until Terraform's nonprod `api_url` output is filled in, or the deploy workflow overrides it. |
| `admin/.env.prod` | `prod` | `pnpm run build:prod` — same, for the prod stack. |

A `VITE_API_BASE_URL` already present in the environment (e.g. set by CI) always wins over the value in the
`.env.<mode>` file — see `admin/scripts/write-swa-config.mjs`'s comment and `deploy.yml`'s "Resolve API base
URL override" step.

## pnpm scripts (run inside `admin/`)

| Script | What it does |
| --- | --- |
| `pnpm dev` | Vite dev server, mode `dev`. |
| `pnpm run build:dev` / `build:nonprod` / `build:prod` | Production build for that environment, then writes `dist/staticwebapp.config.json` from `public/staticwebapp.config.json` with the API origin filled into the CSP's `connect-src`. |
| `pnpm run preview` | Serves the last build locally on port 4173. |
| `pnpm run typecheck` | `tsc --noEmit`. |
| `pnpm run lint` | ESLint over the whole project. |
| `pnpm test` | Vitest (component tests + the `write-swa-config.mjs` unit tests). |

## Pointing the admin console at a local API

The backend repo has a batteries-included local dev server that needs no Docker:

```bash
cd backend-api
python scripts/dev_server.py
```

It brings up an embedded PostgreSQL, runs migrations, seeds `seed/launch-bundle.json`, creates an admin user,
and starts the API on `http://127.0.0.1:8000` (prints the admin email/password to log in with). `admin/.env.dev`
already points `VITE_API_BASE_URL` at that address, so `pnpm dev` in `admin/` just works against it.

## `tools/check-site.mjs`

A dependency-free Node script that walks every `site/*.html` page and checks:

- it has a non-empty `<title>`
- its `<html>` tag has a non-empty `lang` attribute
- it has a `<meta name="description" content="...">` with non-empty content
- every internal `href`/`src` resolves to a real file under `site/`

Run it from the repo root:

```bash
node tools/check-site.mjs
```

Exits non-zero and prints every problem found if anything's wrong. `ci.yml` runs it on every PR and push to
`main`.

## CI (`.github/workflows/ci.yml`)

Runs on every pull request and on push to `main`. Two independent jobs, no deploy:

- **admin**: `pnpm install --frozen-lockfile`, then `pnpm run lint`, `pnpm run typecheck`, `pnpm test`, `pnpm run build:dev`.
- **site**: `node tools/check-site.mjs`.

## Deploy to GitHub Pages (`.github/workflows/pages.yml`)

Every push to `main` (and a manual run) publishes the public site at the root of the Pages address and the admin console
under `/admin/`. The console is built with hash routing, so its pages are `https://<domain>/admin/#/...`, because Pages
cannot rewrite unknown paths. Pages also cannot send response headers, so the console's Content-Security-Policy is
embedded in `index.html` as a `<meta>` tag (`admin/scripts/write-pages-csp.mjs`); that loses `frame-ancestors`, which means
the console could be framed by another site. Keep this in mind before putting real content-admin work behind it.

**One-time setup (repository settings, done by a person):**

1. Settings -> Pages -> Build and deployment -> Source: **GitHub Actions**. A private repository needs a GitHub plan
   that includes Pages for private repos.
2. Settings -> Secrets and variables -> Actions -> **Variables**: `API_BASE_URL` (required, the API the console talks to)
   and optionally `ADMIN_ENV_NAME` (`dev`, `nonprod` or `prod`; default `dev`).
3. Settings -> Pages -> **Custom domain**, then create the DNS record GitHub shows. Tick "Enforce HTTPS" when it offers it.
4. Add the final `https://<domain>` origin to the API's allowed CORS origins (`extra_cors_origins` in the matching
   `infra/envs/<env>/<env>.tfvars`, then `terraform apply`). Without it the browser blocks every call the console makes.

The Azure route (`deploy.yml`) is now manual-only (workflow_dispatch) and needs the Azure setup below.

## Deploy to Azure Static Web Apps (`.github/workflows/deploy.yml`, manual)

Builds `admin/dist` and deploys it, plus `site/`, to two separate Azure Static Web Apps, using Azure OIDC
login (`azure/login@v2`) — no stored Azure credentials, and Static Web Apps deployment tokens are fetched at
deploy time via `az staticwebapp secrets list` and masked in the logs rather than stored as GitHub secrets.

**Triggers:**
- `workflow_dispatch` with an `environment` input (`nonprod` or `prod`) — deploy on demand to either.
- No push trigger: pushes to `main` publish to GitHub Pages instead.

**Manual setup a human must do in the GitHub repo settings before this workflow can run** (not done by this
PR — there's no way to create GitHub Environments or Azure federated credentials from a commit):

1. Create two GitHub **Environments**: `nonprod` and `prod` (Settings → Environments).
2. On the `prod` environment, add **required reviewers** (Settings → Environments → `prod` → Deployment
   protection rules) so a human approves every production deploy. `nonprod` needs no protection rules.
3. On each environment, add these **variables** (Settings → Environments → `<env>` → Variables — not
   secrets, since OIDC login inputs aren't sensitive):
   - `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID` — identity used for OIDC login.
   - `AZURE_RESOURCE_GROUP` — resource group containing the two Static Web Apps for that environment.
   - `SWA_ADMIN_NAME`, `SWA_SITE_NAME` — the Azure Static Web App resource names (see
     `infra/modules/static_web_apps`, named `swa-<prefix>-admin` / `swa-<prefix>-site`).
   - `API_BASE_URL` — optional; overrides the admin build's API URL when the `.env.<env>` file's placeholder
     isn't good enough (e.g. before Terraform's `api_url` output has been committed there).
4. On the Azure side, configure a federated credential on that app registration / managed identity trusting
   this repo + each GitHub Environment (subject `repo:<org>/web:environment:nonprod` and
   `repo:<org>/web:environment:prod`), with `Static Web Apps Contributor`-equivalent access (or narrower —
   just enough to run `az staticwebapp secrets list`) on the resource group.

No long-lived Azure secret or SWA deployment token needs to be stored in GitHub at all.
