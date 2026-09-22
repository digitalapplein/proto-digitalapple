# Packages folder

Add self-contained static “packages” here (HTML fragments, CSS, JS modules, images).

Example layout:

```
packages/
  my-demo/
    index.html
    style.css
    app.js
```

Reference from the site root, e.g. `packages/my-demo/index.html` or import JS from `index.html`.

Agents (Cursor / Claude / ChatGPT) can create or update files under `packages/` and deploy via git push or `scripts/deploy.ps1`.
