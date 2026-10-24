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

## Known deployment values

These are already in use for this project — reuse them instead of inventing new ones.

| Item | Value |
| --- | --- |
| Worker name | `switchu-themes-pr-proxy` |
| Workers subdomain | `switchu` |
| Worker URL | `https://switchu-themes-pr-proxy.switchu.workers.dev` |
| OAuth callback URL | `https://switchu-themes-pr-proxy.switchu.workers.dev/api/auth/callback` |
| Site URL | `https://polonx.github.io/SwitchU-Themes/` |
| `ALLOWED_ORIGIN` | `https://polonx.github.io` |
| Repo variable `VITE_PR_PROXY_URL` | already set on `PoloNX/SwitchU-Themes` |

> To re-check the repo variable at any time:
> `gh variable list -R PoloNX/SwitchU-Themes`

## Current state (what is left to do)

`https://switchu-themes-pr-proxy.switchu.workers.dev/api/health` already answers,
so the Worker **exists**. But `/api/auth` returns `404 Not found`, which means it
is still running the **old** code without the OAuth routes.

Remaining work:

1. Add `GITHUB_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_SECRET` and `SESSION_SECRET`
   as Worker secrets (step 3.3).
2. Create the GitHub OAuth App with callback
   `https://switchu-themes-pr-proxy.switchu.workers.dev/api/auth/callback` (step 1).
3. Run `npm run deploy` in `pr-proxy/` to publish the new Worker code (step 3.4).
4. Confirm the GitHub App is installed on **both** `PoloNX/SwitchU-Themes` and
   `PoloNX/SwitchU` (step 2).
5. Merge this branch to `main` so Pages rebuilds the site with the sign-in UI.
6. Re-run `curl .../api/auth` — it should return a `clientId`, not a 404.

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
| Homepage URL | `https://polonx.github.io/SwitchU-Themes/` |
| Authorization callback URL | `https://switchu-themes-pr-proxy.switchu.workers.dev/api/auth/callback` |

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
| Homepage URL | `https://polonx.github.io/SwitchU-Themes/` |
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
ALLOWED_ORIGIN = "https://polonx.github.io"
ICON_PACK_REPO_OWNER = "PoloNX"
ICON_PACK_REPO_NAME = "SwitchU"
```

> `ALLOWED_ORIGIN` is the **origin only** (scheme + host, no path). For GitHub
> Pages project sites this is `https://polonx.github.io`.

### 3.3 Set the secrets

`wrangler secret put` reads **one line** per prompt, so pasting a multi-line PEM
(or piping a value) easily stores a truncated/corrupt secret. Use
`wrangler secret bulk` with a JSON file instead — it handles newlines correctly
and sets everything at once.

**Recommended: bulk upload**

```bash
cd pr-proxy

python3 - <<'PY'
import json, glob, pathlib
pems = sorted(glob.glob("/home/charlie/Downloads/*.private-key.pem"))
pem = pathlib.Path(pems[-1]).read_text().strip() if pems else ""
json.dump({
    "GITHUB_PRIVATE_KEY": pem,
    "GITHUB_OAUTH_CLIENT_SECRET": "COLLE_TON_SECRET_ICI",
    "SESSION_SECRET": "COLLE_TA_VALEUR_ICI",
}, open("/tmp/switchu-secrets.json", "w"), indent=2)
print("private key found:", bool(pem))
PY

npx wrangler secret bulk /tmp/switchu-secrets.json
rm /tmp/switchu-secrets.json
```

> **fish shell:** heredocs (`<<'PY'`) are not supported. Use `python3 -c` instead:
>
> ```fish
> ls ~/Downloads/*.private-key.pem          # find the file
>
> python3 -c 'import json,pathlib,sys; json.dump({"GITHUB_PRIVATE_KEY": pathlib.Path(sys.argv[1]).read_text().strip(), "GITHUB_OAUTH_CLIENT_SECRET": "COLLE_TON_SECRET_ICI", "SESSION_SECRET": "COLLE_TA_VALEUR_ICI"}, open("/tmp/switchu-secrets.json","w"), indent=2)' ~/Downloads/<app>.private-key.pem
> ```
>
> Or create `/tmp/switchu-secrets.json` directly in your editor — no shell
> quoting and nothing lands in your shell history.

> `GITHUB_OAUTH_CLIENT_ID` is **public** (the site fetches it from `/api/auth`),
> so keep it in `[vars]` in `wrangler.toml` rather than as a secret. That way you
> can read and fix it.

Generate a strong session secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

**Alternative: one secret at a time**

Pipe from a file rather than pasting, and never go through `npm run`:

```bash
npx wrangler secret put GITHUB_PRIVATE_KEY < ~/Downloads/<app>.private-key.pem
npx wrangler secret put GITHUB_OAUTH_CLIENT_SECRET
npx wrangler secret put SESSION_SECRET
```

`EDITOR_TOKEN` is optional. When set, a request sending `X-Editor-Token` with
this value can update *any* proposal (maintainer override):

```bash
npx wrangler secret put EDITOR_TOKEN
```

> Secrets are **write-only** — Cloudflare never returns them. Verify a secret is
> correct through behaviour (`curl .../api/auth`), not by re-reading it. Clear a
> bad one with `npx wrangler secret delete <NAME>`.

> **If a secret is ever exposed** (pasted into chat, committed, shared in an
> issue), rotate it: generate a new OAuth **client secret** in the GitHub OAuth
> App and delete the old one, generate a new `SESSION_SECRET`, then
> `wrangler secret bulk` + `npm run deploy`.

### 3.4 Deploy

```bash
npm run deploy          # wrangler deploy
```

Wrangler prints the URL, e.g.
`https://switchu-themes-pr-proxy.switchu.workers.dev`.

> You must redeploy after changing secrets — `secret put` alone does not update
> the running Worker.

**Now go back to step 1** and set the OAuth callback to
`https://switchu-themes-pr-proxy.switchu.workers.dev/api/auth/callback`.

### 3.5 Smoke-test the Worker

```bash
curl https://switchu-themes-pr-proxy.switchu.workers.dev/api/health
# {"ok":true,"repo":"PoloNX/SwitchU-Themes"}

curl https://switchu-themes-pr-proxy.switchu.workers.dev/api/auth
# {"clientId":"Iv1.xxxxx"}
```

If `/api/auth` returns an empty `clientId`, the OAuth secrets are missing. If it
returns a single control character (e.g. `"\u0016"`), the secret was stored
corrupt — see the bulk-upload note in step 3.3 and set it again.

---

## 4. Configure and deploy the site (GitHub Pages)

### 4.1 Add the proxy URL as a repository variable

**Already done** on `PoloNX/SwitchU-Themes`. Verify with:

```bash
gh variable list -R PoloNX/SwitchU-Themes
```

Expected:

| Name | Value |
| --- | --- |
| `VITE_PR_PROXY_URL` | `https://switchu-themes-pr-proxy.switchu.workers.dev` |

If it is missing, add it under
**Settings → Secrets and variables → Actions → Variables → New repository variable**.

The workflow already reads `${{ vars.VITE_PR_PROXY_URL }}`.

### 4.2 Enable Pages

Repo → **Settings → Pages → Build and deployment → Source: GitHub Actions**.

The workflow `.github/workflows/deploy-pages.yml` builds the site into `docs/`
and publishes it on every push to `main` (or manual **Run workflow**).

### 4.3 Deploy

Merge into `main` (or run the workflow manually). The site ends up at:

```
https://polonx.github.io/SwitchU-Themes/
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
| `/api/auth` returns `{"clientId":"\u0016"}` or another 1-char value | The secret was stored truncated. Re-set it with `wrangler secret bulk`, then `npm run deploy`. |
| `/api/auth` returns `{"error":"Not found"}` | The Worker is running old code — redeploy with `cd pr-proxy && npm run deploy`. |
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
