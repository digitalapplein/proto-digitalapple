# Proto site — full deployment guide

Static HTML/CSS sandbox for **proto.digitalapple.io**, designed so Mohit and the team can publish pages with **Cursor, Claude, or ChatGPT** (edit → push → live).

---

## Quick links

| What | URL |
|------|-----|
| **Live site (Render)** | https://proto-digitalapple.onrender.com |
| **Custom domain (after DNS)** | https://proto.digitalapple.io |
| **GitHub repo** | https://github.com/digitalapplein/proto-digitalapple |
| **Render dashboard** | https://dashboard.render.com/static/srv-dap7ttf40ujc73bsgudg |
| **Render workspace** | My Workspace (`aiops@digitalapple.ai`) |

---

## Where is “proto”?

### On your machine (this monorepo)

```
C:\Users\DA\Documents\VF-RCA-SURVEY\proto-digitalapple\
```

Open that folder in Cursor to edit the site.

### In GitHub

- **Org / repo:** `digitalapplein/proto-digitalapple`
- **Default branch:** `master`
- **Clone:**

```bash
git clone https://github.com/digitalapplein/proto-digitalapple.git
cd proto-digitalapple
```

### On Render

| Setting | Value |
|---------|--------|
| **Service name** | `proto-digitalapple` |
| **Service ID** | `srv-dap7ttf40ujc73bsgudg` |
| **Type** | Static Site |
| **Connected repo** | `https://github.com/digitalapplein/proto-digitalapple` |
| **Branch** | `master` |
| **Root directory** | *(repo root — empty)* |
| **Build command** | `echo Static HTML site` |
| **Publish directory** | `.` (entire repo root) |
| **Auto-deploy** | On every commit to `master` |
| **Default URL** | https://proto-digitalapple.onrender.com |

There is **no npm build** for the default setup — plain HTML, CSS, and JS under `packages/`.

---

## Repository layout

```
proto-digitalapple/
├── index.html              # Home page
├── css/
│   └── style.css           # Global styles
├── packages/               # Self-contained demos / widgets
│   ├── README.md
│   └── demo-widget/
│       └── main.js
├── scripts/
│   └── deploy.ps1          # Optional: trigger Render deploy via API
├── .cursor/skills/
│   └── proto-render-deploy/
│       └── SKILL.md        # Instructions for Cursor agent
├── render.yaml             # Optional Blueprint reference
├── .env.example            # Local env template (service ID only)
├── GUIDE.md                # This file
├── AGENTIC-DEPLOY.md       # Architecture + agent prompts
└── README.md               # Short overview
```

### Adding a new “package”

1. Create a folder: `packages/my-feature/`
2. Add `index.html`, CSS, JS, images as needed.
3. Link from `index.html` or open directly:  
   `https://proto-digitalapple.onrender.com/packages/my-feature/index.html`

---

## How to deploy

### Option A — Agentic (recommended for Mohit)

1. Open `proto-digitalapple` in **Cursor** (or use Claude/ChatGPT with repo access).
2. Ask the agent, for example:
   - *“Update the hero on proto and deploy.”*
   - *“Add `packages/pilot-1/` with a simple landing page and push to Render.”*
3. The agent should:
   - Edit files under this repo
   - `git add`, `git commit`, `git push origin master`
4. **Render auto-deploys** within ~1–2 minutes after push.

Cursor uses the skill: `.cursor/skills/proto-render-deploy/SKILL.md`.

### Option B — Manual (git only)

From the repo root:

```powershell
cd C:\Users\DA\Documents\VF-RCA-SURVEY\proto-digitalapple

git status
git add -A
git commit -m "Describe your change"
git push origin master
```

Check deploy status: [Render dashboard → Events / Deploys](https://dashboard.render.com/static/srv-dap7ttf40ujc73bsgudg).

### Option C — Manual deploy trigger (API)

Use when you pushed but want a **fresh deploy** or **clear cache** without a new commit.

1. Copy `.env.example` → `.env` (local only, never commit `.env`).
2. Set:
   - `RENDER_API_KEY` — from [Render → Account → API Keys](https://dashboard.render.com/u/settings#api-keys)
   - `RENDER_PROTO_SERVICE_ID` — `srv-dap7ttf40ujc73bsgudg`
3. Run:

```powershell
cd proto-digitalapple
$env:RENDER_API_KEY = "rnd_..."   # or load from .env
$env:RENDER_PROTO_SERVICE_ID = "srv-dap7ttf40ujc73bsgudg"
.\scripts\deploy.ps1
```

**API equivalent:**

```http
POST https://api.render.com/v1/services/srv-dap7ttf40ujc73bsgudg/deploys
Authorization: Bearer YOUR_RENDER_API_KEY
Content-Type: application/json

{"clearCache":"clear"}
```

---

## Custom domain: proto.digitalapple.io

Custom domain is **already added in Render** but must be **verified via DNS**.

| Field | Value |
|-------|--------|
| **Domain** | `proto.digitalapple.io` |
| **Custom domain ID** | `cdm-dap7u3942hec73973e6g` |
| **Status** | Verify in dashboard (was `unverified` until DNS is set) |

### DNS steps (infra / DNS admin)

1. Open [Render → proto-digitalapple → Settings → Custom Domains](https://dashboard.render.com/static/srv-dap7ttf40ujc73bsgudg).
2. Note the **CNAME target** Render shows for `proto.digitalapple.io` (often `proto-digitalapple.onrender.com` or a Render hostname).
3. At your DNS provider for **digitalapple.io**, add:

| Type | Name / Host | Value |
|------|-------------|--------|
| **CNAME** | `proto` | *(target from Render dashboard)* |

4. Wait for propagation (minutes to hours).
5. In Render, use **Verify** if available, or wait until status shows verified.

Until DNS works, use **https://proto-digitalapple.onrender.com**.

---

## Render API reference (proto service)

| Action | Method | Endpoint |
|--------|--------|----------|
| Get service | `GET` | `/v1/services/srv-dap7ttf40ujc73bsgudg` |
| List deploys | `GET` | `/v1/services/srv-dap7ttf40ujc73bsgudg/deploys` |
| Trigger deploy | `POST` | `/v1/services/srv-dap7ttf40ujc73bsgudg/deploys` |
| List custom domains | `GET` | `/v1/services/srv-dap7ttf40ujc73bsgudg/custom-domains` |
| Add custom domain | `POST` | `/v1/services/srv-dap7ttf40ujc73bsgudg/custom-domains` body `{"name":"proto.digitalapple.io"}` |

Base URL: `https://api.render.com`  
Auth header: `Authorization: Bearer YOUR_API_KEY`

**Workspace owner ID** (if creating new services): `tea-dak3gbuq1p3s73cfs57g`

---

## If you add npm / packages later

Survey admin services use:

- Env: `NPM_CONFIG_LEGACY_PEER_DEPS=true`
- Build: `npm install --legacy-peer-deps && npm run build`

The **proto** site is static-only today. If you add `package.json` and a real build:

1. Update **Build command** in Render to e.g. `npm install --legacy-peer-deps && npm run build`
2. Set **Publish directory** to `build` or `dist` (match your tool)
3. Add `NPM_CONFIG_LEGACY_PEER_DEPS=true` in Render **Environment** for that service

---

## Troubleshooting

| Problem | What to check |
|---------|----------------|
| Site shows old content | Hard refresh; wait for deploy `live`; run `deploy.ps1` with `clearCache` |
| 404 on `/packages/...` | File path must exist in repo; push to `master`; no SPA rewrite on this service |
| Deploy failed | Render dashboard → failed deploy → **Logs** |
| Custom domain not working | DNS CNAME; domain verification in Render |
| Git push rejected | `git pull origin master` first; ensure access to `digitalapplein/proto-digitalapple` |
| Agent didn’t deploy | Confirm push to `master`; confirm Render GitHub app has repo access |

---

## Security

- **Never commit** `RENDER_API_KEY`, `.env`, or PEM files.
- Rotate API keys if they appear in chat, tickets, or logs.
- Proto is a **public** static site — do not put secrets, internal APIs, or PII in HTML/JS.

---

## Related docs in this repo

| File | Purpose |
|------|---------|
| `GUIDE.md` | This guide — locations, Render, DNS, deploy |
| `AGENTIC-DEPLOY.md` | Agent/MCP workflow and architecture |
| `README.md` | One-page summary |
| `.cursor/skills/proto-render-deploy/SKILL.md` | Cursor agent skill |

---

## One-line summary

**Edit** `proto-digitalapple` → **push** to `master` on GitHub → **Render** publishes to **proto-digitalapple.onrender.com** (and **proto.digitalapple.io** once DNS is verified).
