# proto.digitalapple.io

Static HTML/CSS sandbox for **agentic deploys** (Cursor, Claude, ChatGPT).

**Full instructions:** see **[GUIDE.md](./GUIDE.md)** (paths, Render, DNS, deploy options).

## Workflow for Mohit / team

1. Edit `index.html`, `css/`, or add folders under `packages/`.
2. Ask your AI agent: *“Deploy proto to Render”* (see `.cursor/skills/proto-render-deploy/SKILL.md`).
3. Agent commits, pushes to GitHub, and triggers Render (auto-deploy on push).

## Manual deploy

```powershell
git add -A && git commit -m "proto update" && git push
# optional immediate deploy:
$env:RENDER_API_KEY = "your-key"
$env:RENDER_PROTO_SERVICE_ID = "srv-..."
./scripts/deploy.ps1
```

## Custom domain DNS

After Render adds `proto.digitalapple.io`, create a **CNAME** (or ALIAS) pointing to the hostname Render shows in Dashboard → Custom Domains.
