---
name: proto-render-deploy
description: Deploy the proto-digitalapple static site (HTML/CSS/packages) to Render at proto.digitalapple.io. Use when Mohit or the user asks to publish, deploy, or update the proto site, HTML prototype, or packages on Render.
---

# Proto → Render deploy (agentic)

## Scope

Repository root: `proto-digitalapple/` (static files only).

- **Site files:** `index.html`, `css/`, `packages/`
- **No npm build** unless the user adds a `package.json` and asks for one
- **Target:** Render static site → **proto.digitalapple.io**

## Deploy steps (always run, do not only describe)

1. Edit or create HTML/CSS/JS under this repo as requested.
2. From `proto-digitalapple/`:
   - `git status` → stage relevant files
   - Commit with a clear message (only if user asked to deploy or save)
   - `git push origin main`
3. Render auto-deploys on push if the service is linked to this repo.
4. Optional: run `scripts/deploy.ps1` if `RENDER_API_KEY` and `RENDER_PROTO_SERVICE_ID` are set in the environment (never read keys from chat or commit them).

## Render API (reference)

- **Service ID:** stored in repo as `RENDER_PROTO_SERVICE_ID` env on developer machine, not in git
- **Trigger deploy:** `POST https://api.render.com/v1/services/{serviceId}/deploys` body `{"clearCache":"clear"}`
- **Custom domain:** `POST .../custom-domains` body `{"name":"proto.digitalapple.io"}`

## MCP options

| Tool | Use |
|------|-----|
| **Git / gh** | push commits to `digitalapplein/proto-digitalapple` |
| **Shell + Render API** | trigger deploy, read deploy status |
| **GitHub MCP** | `push_files` for small hotfixes without local git |

## Packages folder

Users add self-contained demos under `packages/<name>/`. Link from `index.html` or document the URL path `/packages/<name>/...` on the live site.

## Safety

- Do not commit API keys, `.env` secrets, or customer data
- Prefer `--legacy-peer-deps` only if a future `package.json` is added and Render build fails on peers
