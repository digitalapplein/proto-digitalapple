const banner = document.createElement("div");
banner.className = "proto-toast";
banner.textContent = "packages/demo-widget loaded — add your own modules here";
banner.style.cssText =
  "position:fixed;bottom:1rem;right:1rem;background:#1a2332;color:#e8eef7;padding:0.75rem 1rem;border-radius:8px;font-size:0.8rem;border:1px solid #e60000;max-width:280px;z-index:9999;";
document.body.appendChild(banner);
setTimeout(() => banner.remove(), 6000);
