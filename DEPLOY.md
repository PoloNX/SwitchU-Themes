# Deployment guide

This repo ships two pieces:

| Piece | Where it runs | What it does |
| --- | --- | --- |
| `site/` | GitHub Pages (`docs/`) | Theme browser, studio, icon workshop |
| `pr-proxy/` | Cloudflare Worker | GitHub API access, PR creation, GitHub OAuth |

You need **three** GitHub/Cloudflare objects:

1. A **GitHub OAuth App** → for "Sign in with GitHub" on the site.
2. A **GitHub App** → for creating branches, committing files and opening PRs.
3. A **Cloudflare Worker** → the proxy that holds the credentials.

---

## 0. Prerequisites

- A Cloudflare account (free tier is enough).
- Admin rights on `PoloNX/SwitchU-Themes` and `PoloNX/SwitchU`.
- Node.js 20+ and `npm`.
- `npx wrangler` (installed automatically via the workspace devDependency).

```bash
git clone https://github.com/PoloNX/SwitchU-Themes
cd SwitchU-Themes
npm install
```

---

## 1. Create the GitHub OAuth App (sign-in)

GitHub → **Settings → Developer settings → OAuth Apps → New OAuth App**

| Field | Value |
| --- | --- |
| Application name | `SwitchU Themes` |
| Homepage URL | `https://<owner>.github.io/SwitchU-Themes/` |
| Authorization callback URL | `https://<worker-name>.<subdomain>.workers.dev/api/auth/callback` |

> The callback URL must match the Worker URL exactly. If you do not know it yet,
> deploy the Worker first (step 3), then come back and set it.

After creating, note:

- **Client ID** → `GITHUB_OAUTH_CLIENT_ID`
- **Client Secret** (generate one) → `GITHUB_OAUTH_CLIENT_SECRET`

The site only requests the `read:user` scope.

---

## 2. Create the GitHub App (PR creation)

GitHub → **Settings → Developer settings → GitHub Apps → New GitHub App**

| Field | Value |
| --- | --- |
| GitHub App name | `SwitchU Themes Studio` |
| Homepage URL | `https://<owner>.github.io/SwitchU-Themes/` |
| Webhook | **disable** ("Active" unchecked) |
| Repository permissions → Contents | **Read and write** |
| Repository permissions → Pull requests | **Read and write** |

Then:

1. **Create app**.
2. Note the **App ID** → `GITHUB_APP_ID`.
3. **Generate a private key** → downloads a `.pem` → `GITHUB_PRIVATE_KEY`.
4. **Install App** and select **both** repositories:
   - `PoloNX/SwitchU-Themes` (themes + catalog)
   - `PoloNX/SwitchU` (icon packs → `romfs/icons/<id>/`)

   If you skip the second repo, theme PRs still work but **icon-pack PRs will
   fail** with a 404.
5. After installing, the URL contains the installation id:
   `https://github.com/settings/installations/<INSTALLATION_ID>`
   → `GITHUB_INSTALLATION_ID`.

---

## 3. Deploy the Cloudflare Worker

### 3.1 Log in

```bash
cd pr-proxy
npx wrangler login
```

### 3.2 Set the plain variables

Edit `pr-proxy/wrangler.toml`:

```toml
[vars]
GITHUB_APP_ID = "123456"
GITHUB_INSTALLATION_ID = "12345678"
GITHUB_REPO_OWNER = "PoloNX"
GITHUB_REPO_NAME = "SwitchU-Themes"
GITHUB_DEFAULT_BRANCH = "main"
ALLOWED_ORIGIN = "https://<owner>.github.io"
ICON_PACK_REPO_OWNER = "PoloNX"
ICON_PACK_REPO_NAME = "SwitchU"
```

> `ALLOWED_ORIGIN` is the **origin only** (scheme + host, no path). For GitHub
> Pages project sites this is `https://<owner>.github.io`.

### 3.3 Set the secrets

Never put these in `wrangler.toml`. Use `wrangler secret put`:

```bash
npx wrangler secret put GITHUB_PRIVATE_KEY        # paste the whole .pem (with newlines)
npx wrangler secret put GITHUB_OAUTH_CLIENT_ID
npx wrangler secret put GITHUB_OAUTH_CLIENT_SECRET
npx wrangler secret put SESSION_SECRET            # long random string
npx wrangler secret put EDITOR_TOKEN              # optional maintainer override
```

Generate a strong session secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

> `EDITOR_TOKEN` is optional. When set, a request sending `X-Editor-Token`
> with this value can update *any* proposal (maintainer override).

### 3.4 Deploy

```bash
npm run deploy          # wrangler deploy
```

Wrangler prints the URL, e.g.
`https://switchu-themes-pr-proxy.<subdomain>.workers.dev`.

**Now go back to step 1** and set the OAuth callback to
`https://switchu-themes-pr-proxy.<subdomain>.workers.dev/api/auth/callback`.

### 3.5 Smoke-test the Worker

```bash
curl https://<worker-url>/api/health
# {"ok":true,"repo":"PoloNX/SwitchU-Themes"}

curl https://<worker-url>/api/auth
# {"clientId":"Iv1.xxxxx"}
```

If `/api/auth` returns an empty `clientId`, the OAuth secrets are missing.

---

## 4. Configure and deploy the site (GitHub Pages)

### 4.1 Add the proxy URL as a repository variable

Repo → **Settings → Secrets and variables → Actions → Variables → New repository variable**

| Name | Value |
| --- | --- |
| `VITE_PR_PROXY_URL` | `https://switchu-themes-pr-proxy.<subdomain>.workers.dev` |

The workflow already reads `${{ vars.VITE_PR_PROXY_URL }}`.

### 4.2 Enable Pages

Repo → **Settings → Pages → Build and deployment → Source: GitHub Actions**.

The workflow `.github/workflows/deploy-pages.yml` builds the site into `docs/`
and publishes it on every push to `main` (or manual **Run workflow**).

### 4.3 Deploy

Merge into `main` (or run the workflow manually). The site ends up at:

```
https://<owner>.github.io/SwitchU-Themes/
```

---

## 5. Verify end to end

1. Open the site → the catalog loads (themes, audio, backgrounds counts > 0).
2. Click **Sign in with GitHub** → GitHub consent → you come back signed in
   (avatar + `@login` visible).
3. **Icon workshop** → upload one glyph → **Download icon pack** (zip works
   without any credentials) → **Submit to SwitchU** (needs the GitHub App
   installed on `PoloNX/SwitchU`).
4. **Theme creator** → make a change → **Create pull request** (needs the
   GitHub App on `PoloNX/SwitchU-Themes`).
5. Open that PR's **edit link** from the PR body → you can edit because you are
   the signed-in author.

> On **first** proposal creation after this migration, `authorLogin` is written
> to the proposal metadata. Proposals created *before* the OAuth change fall
> back to their recorded `contributor` handle — if it does not match your
> GitHub login, only `EDITOR_TOKEN` can update them.

---

## 6. Local development

Two terminals.

**Proxy:**

```bash
cd pr-proxy
cp .dev.vars.example .dev.vars
# fill in the values
npx wrangler dev            # http://localhost:8787
```

Add a local OAuth callback while developing:
`http://localhost:8787/api/auth/callback`.

**Site:**

```bash
cd site
cp .env.example .env
# VITE_PR_PROXY_URL=http://localhost:8787
npm run dev                 # http://localhost:5173
```

Useful checks:

```bash
npm run build               # typechecks site + proxy, builds the site
npm run sync:catalog        # regenerate site/public/catalog from index.json + themes/
```

---

## 7. Updating

| Change | How |
| --- | --- |
| Themes / `index.json` | Merge to `main` → Pages redeploys |
| Site code | Merge to `main` → Pages redeploys |
| Proxy code | `cd pr-proxy && npm run deploy` |
| Rotate a secret | `npx wrangler secret put <NAME>` |
| Rotate the App private key | Generate a new key in the GitHub App, `wrangler secret put GITHUB_PRIVATE_KEY` |

---

## 8. Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| `Missing VITE_PR_PROXY_URL` | The repository variable is unset, or the workflow was not re-run after adding it. |
| `GitHub OAuth is not configured on the proxy.` | `GITHUB_OAUTH_CLIENT_ID` / `_SECRET` missing on the Worker. |
| Redirected back with `auth_error` | Callback URL mismatch, or the OAuth secret is wrong. |
| `Sign in` works but submits return **401** | The site is not sending the session; clear `localStorage` and sign in again. |
| Submit returns **403 Forbidden** | You are not the proposal author. Use the author account or `X-Editor-Token`. |
| Theme PR fails with **404** | GitHub App not installed on `PoloNX/SwitchU-Themes`. |
| Icon-pack PR fails with **404** | GitHub App not installed on `PoloNX/SwitchU`, or `ICON_PACK_REPO_*` wrong. |
| `Bad credentials` / `GitHub API ... 401` | Private key or App ID / installation id is wrong. |
| CORS error in the browser | `ALLOWED_ORIGIN` does not match the site origin (scheme + host only). |
| Catalog shows 0 themes | `npm run sync:catalog` did not run, or `themes/` / `index.json` are missing. |

> After changing Worker secrets or `wrangler.toml`, run `npm run deploy` again —
> `wrangler secret put` alone does not create the Worker on a first deploy.
