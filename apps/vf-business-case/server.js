/* Small server for the hosted tool: serves the files in this folder and
   keeps the Discussion answers, the shared As-is data and attachments on one disk (DATA_DIR).
   Every change is also appended to a log, so nothing typed is lost.
   ACCESS_KEY, when set, is asked for once and kept in a cookie. */
const http = require("http"), fs = require("fs"), path = require("path"), crypto = require("crypto");
const ROOT = __dirname, DATA = process.env.DATA_DIR || path.join(ROOT, "_data"), FILES = path.join(DATA, "files");
const KEY = process.env.ACCESS_KEY || "", PORT = process.env.PORT || 8866;
fs.mkdirSync(FILES, {recursive: true});
const DB = path.join(DATA, "discuss.json"), LOG = path.join(DATA, "discuss-log.jsonl");
const STATE = path.join(DATA, "state.json"), SNAPS = path.join(DATA, "state-history"); let lastSnap = 0, lastToolkitSnap = 0;
const TOOLKIT = path.join(DATA, "toolkit.json");
fs.mkdirSync(SNAPS, {recursive: true});
let store = {}; try { store = JSON.parse(fs.readFileSync(DB, "utf8")); } catch(_){}
const TYPES = {".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png",
  ".jpg": "image/jpeg", ".json": "application/json", ".woff2": "font/woff2", ".pdf": "application/pdf"};

function saveStore(){ const tmp = DB + ".tmp"; fs.writeFileSync(tmp, JSON.stringify(store)); fs.renameSync(tmp, DB); }
function body(req, limit){ return new Promise((ok, no) => { const c = []; let n = 0;
  req.on("data", d => { n += d.length; if (n > limit){ no(new Error("too big")); req.destroy(); } else c.push(d); });
  req.on("end", () => ok(Buffer.concat(c))); req.on("error", no); }); }
const send = (res, code, data, type = "application/json", extra = {}) => { res.writeHead(code, {"content-type": type, "x-robots-tag": "noindex", ...extra}); res.end(data); };
const authed = req => !KEY || (req.headers.cookie || "").split(/;\s*/).includes("k=" + KEY);

http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://x");
  /* a link with the key sets the cookie and opens the page as it is: the key stays in the address bar,
     so a link copied from the browser keeps working for whoever receives it */
  const cookie = KEY && u.searchParams.get("k") === KEY ? {"set-cookie": `k=${KEY}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=31536000`} : {};
  if (Object.keys(cookie).length) req.headers.cookie = (req.headers.cookie ? req.headers.cookie + "; " : "") + "k=" + KEY;
  if (!authed(req)) return send(res, 401, "<p style='font-family:sans-serif;padding:40px'>Open the link you were sent to use this page.</p>", "text/html");
  /* version 1 of the tool lives under /v1/ and keeps using the same api and files */
  if (u.pathname === "/v1") return send(res, 302, "", "text/plain", {location: "/v1/" + u.search});
  if (/^\/v1\/(api|files)\//.test(u.pathname)) u.pathname = u.pathname.slice(3);
  try {
    if (u.pathname === "/api/toolkit" && req.method === "GET"){
      try { return send(res, 200, fs.readFileSync(TOOLKIT)); } catch(_){ return send(res, 200, "{}"); }
    }
    if (u.pathname === "/api/toolkit" && req.method === "POST"){
      const raw = await body(req, 8e6); JSON.parse(raw);
      const tmp = TOOLKIT + ".tmp"; fs.writeFileSync(tmp, raw); fs.renameSync(tmp, TOOLKIT);
      const now = Date.now(); if (now - lastToolkitSnap > 10 * 60e3){ lastToolkitSnap = now; fs.writeFileSync(path.join(SNAPS, "toolkit-" + new Date(now).toISOString().replace(/[:.]/g, "-") + ".json"), raw); }
      return send(res, 200, '{"ok":true}');
    }
    if (u.pathname === "/api/share"){
      const proto = req.headers["x-forwarded-proto"] || "http", host = req.headers["x-forwarded-host"] || req.headers.host;
      return send(res, 200, JSON.stringify({url: `${proto}://${host}/${KEY ? "?k=" + KEY : ""}`}));
    }
    if (u.pathname === "/api/discuss" && req.method === "GET") return send(res, 200, JSON.stringify(store));
    if (u.pathname === "/api/discuss" && req.method === "POST"){
      const p = JSON.parse(await body(req, 1e6));
      if (!p.asset || !p.field) return send(res, 400, "{}");
      (store[p.asset] = store[p.asset] || {})[p.field] = p.value;
      saveStore(); fs.appendFileSync(LOG, JSON.stringify({t: new Date().toISOString(), ...p}) + "\n");
      return send(res, 200, '{"ok":true}');
    }
    if (u.pathname === "/api/state" && req.method === "GET"){
      try { return send(res, 200, fs.readFileSync(STATE)); } catch(_){ return send(res, 200, "{}"); }
    }
    if (u.pathname === "/api/state" && req.method === "POST"){
      const raw = await body(req, 8e6); JSON.parse(raw);
      const tmp = STATE + ".tmp"; fs.writeFileSync(tmp, raw); fs.renameSync(tmp, STATE);
      /* a dated copy now and then, so any earlier version can be brought back */
      const now = Date.now(); if (now - lastSnap > 10 * 60e3){ lastSnap = now; fs.writeFileSync(path.join(SNAPS, new Date(now).toISOString().replace(/[:.]/g, "-") + ".json"), raw); }
      return send(res, 200, '{"ok":true}');
    }
    if (u.pathname === "/api/upload" && req.method === "POST"){
      const name = (u.searchParams.get("name") || "file").replace(/[^\w.\- ]+/g, "_").slice(-120);
      const id = crypto.randomBytes(6).toString("hex") + "-" + name;
      fs.writeFileSync(path.join(FILES, id), await body(req, 50e6));
      fs.appendFileSync(LOG, JSON.stringify({t: new Date().toISOString(), upload: id}) + "\n");
      return send(res, 200, JSON.stringify({url: "files/" + encodeURIComponent(id)}));
    }
    if (u.pathname === "/api/export") return send(res, 200, JSON.stringify(store, null, 1));
    let f = decodeURIComponent(u.pathname);
    const base = f.startsWith("/files/") ? FILES : ROOT;
    if (f.startsWith("/files/")) f = f.slice(6);
    if (f.endsWith("/")) f += "index.html";
    const full = path.normalize(path.join(base, f));
    if (!full.startsWith(base) || full.includes(`${path.sep}_data`) || /server\.js$|package\.json$/.test(full)) return send(res, 404, "not found", "text/plain");
    fs.readFile(full, (err, d) => err ? send(res, 404, "not found", "text/plain")
      : send(res, 200, d, TYPES[path.extname(full).toLowerCase()] || "application/octet-stream", cookie));
  } catch(e){ send(res, 500, JSON.stringify({error: String(e.message || e)})); }
}).listen(PORT, () => console.log("listening on " + PORT));
