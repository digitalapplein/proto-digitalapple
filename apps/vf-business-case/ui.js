/* ===================================================================
   Screens. engine.js does the sums; this file only paints them and
   writes what is typed back into the state.
   =================================================================== */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const STORE = "bctool:";

let S = load() || (typeof SEED_STATE !== "undefined" ? JSON.parse(JSON.stringify(SEED_STATE)) : vodafoneDefaults());
let TAB = "discuss";
const NOTE = new Set();       // lines whose comment box is open
const SHUT = new Set();       // To-be groups folded away

/* ---------- number formats ---------- */
const eur = n => "€" + Math.round(n).toLocaleString("en-GB");
const neg = (n, f = eur) => n < 0 ? `<span class="neg">(${f(-n)})</span>` : f(n);
function big(n){
  const a = Math.abs(n), s = a >= 1e6 ? "€" + (a / 1e6).toFixed(2) + "M" : a >= 1e4 ? "€" + Math.round(a / 1e3) + "K" : eur(a);
  return s;
}
const bigNeg = n => n < 0 ? `<span class="neg">(${big(n)})</span>` : big(n);
const d1 = n => (Math.round(n * 10) / 10).toLocaleString("en-GB");
const h1 = n => (Math.round(n * 10) / 10).toLocaleString("en-GB");
const val = v => v == null || v === "" ? "" : String(v);

/* ---------- persistence ---------- */
function load(){
  try {
    const raw = localStorage.getItem(STORE + "vodafone-business"); if (!raw) return null;
    const st = JSON.parse(raw);
    /* versions 5 to 11 changed the model (per-step AI, routes, volumes;
       inputs, days, runs; the L1-L3 plan; To-be cards and setup; the business case views;
       the toolkit order, with market trends, customer research and messaging split, publish and update apart, optional assets in their sections, and each asset's purpose): an older
       copy is kept aside and the tool starts again from the FY27 plan */
    if ((st.version || 1) < 16){ localStorage.setItem(STORE + "vodafone-business-v" + (st.version || 1), raw); return null; }
    return st;
  }
  catch(_){ return null; }
}
let saveT;
function save(){
  clearTimeout(saveT);
  saveT = setTimeout(() => {
    S.savedAt = Date.now();
    try { localStorage.setItem(STORE + S.client.id, JSON.stringify(S)); $("#saved").textContent = ""; }
    catch(_){ $("#saved").textContent = "Not saved: use Export, Save a copy"; }
    if (SHARED) fetch("api/state", {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify(S)})
      .then(r => { if (!r.ok) throw 0; }).catch(() => { $("#saved").textContent = "Not saved online, kept in this browser"; });
  }, 250);
}
/* tidy typed notes in a saved copy (exact old text -> tidy text from the seed file) */
function cleanState(st){
  if (typeof CLEAN_TEXT === "undefined" || !st || !st.assets) return false;
  let n = 0; const fx = (o, k) => { const v = o[k]; if (typeof v === "string" && CLEAN_TEXT[v] !== undefined){ o[k] = CLEAN_TEXT[v]; n++; } };
  for (const a of Object.values(st.assets)){
    ["desc", "output", "nuances"].forEach(k => fx(a, k));
    (a.inputs || []).forEach(it => { fx(it, "label"); fx(it, "example"); });
    (a.steps || []).forEach(x => { fx(x, "comment"); fx(x, "label"); });
  }
  return n > 0;
}
/* Batch 1 (agreed 4 Nov): work hours quoted by Sally and Rik on the 2 Nov call.
   The quoted total goes into the Draft step as confirmed; the Brief hours are not
   known separately, so they are set to 0 and stay red until someone fills them in.
   A value somebody has already confirmed is never overwritten. */
const BATCH1 = {"One Brief": 5, "One-page summary": 2, "Product spotlight": 3, "Market trends": 20, "Ideal customer profiles": 7,
  "Market Opportunity": 6, "Meet the customer": 9, "Customer research": 3, "Product name": 6};
function applyBatch1(st){
  if (!st || !st.assets || (st.applied || []).includes("batch1")) return false;
  for (const a of Object.values(st.assets)){
    const n = BATCH1[(a.name || "").trim()]; if (n == null) continue;
    const draft = (a.steps || []).find(x => x.label === "Draft"), brief = (a.steps || []).find(x => x.label === "Brief"), conf = a.conf = a.conf || {};
    if (draft && !conf["h" + draft.id]){ draft.hours = n; conf["h" + draft.id] = 1; }
    if (brief && !conf["h" + brief.id]) brief.hours = 0;
    if ((a.name || "").trim() === "Product name"){ const ap = (a.steps || []).find(x => /approval/i.test(x.label)); if (ap && !conf["d" + ap.id]) ap.days = 50; }
  }
  (st.applied = st.applied || []).push("batch1"); return true;
}
/* Batch 2 (agreed 4 Nov): positioning, messaging and enablement hours from the 2 Nov call, same rules as batch 1.
   The paid Social pack goes back to Buyer-facing: in the copy kit the social posts are just text. */
const BATCH2 = {"Positioning Statement": 3, "Messaging House": 15, "Copy kit": 4, "Portfolio marketing toolkit": 8, "Marketing Hub page": 2, "Comms": 1};
function applyBatch2(st){
  if (!st || !st.assets || (st.applied || []).includes("batch2")) return false;
  for (const a of Object.values(st.assets)){
    const nm = (a.name || "").trim(), n = BATCH2[nm]; if (n == null) continue;
    const draft = (a.steps || []).find(x => x.label === "Draft"), brief = (a.steps || []).find(x => x.label === "Brief"), conf = a.conf = a.conf || {};
    if (draft && !conf["h" + draft.id]){ draft.hours = n; conf["h" + draft.id] = 1; }
    if (brief && !conf["h" + brief.id]) brief.hours = 0;
    if (nm === "Messaging House"){ const pr = (a.steps || []).find(x => x.label === "Product review"); if (pr) pr.who = "Product (group and local), local GTM, cluster lead"; }
  }
  const sp = Object.values(st.assets).find(x => (x.name || "").trim() === "Social pack");
  const from = sp && (st.sections || []).find(x => x.assets.includes(sp.id)), to = (st.sections || []).find(x => x.name === "Buyer-facing");
  if (from && to && from !== to){
    from.assets = from.assets.filter(id => id !== sp.id);
    const em = Object.values(st.assets).find(x => (x.name || "").trim() === "Sales to customer email"), at = em ? to.assets.indexOf(em.id) : -1;
    to.assets.splice(at >= 0 ? at + 1 : to.assets.length, 0, sp.id);
  }
  (st.applied = st.applied || []).push("batch2"); return true;
}
/* Batch 3 (9 Nov): what Sally said on the 4 Nov call. Hours are her team's time, quoted by her; the quote
   goes into the first step the team works on and is marked confirmed. Anything she did not give is left alone. */
function applyBatch3(st){
  if (!st || !st.assets || (st.applied || []).includes("batch3")) return false;
  const by = n => Object.values(st.assets).find(x => (x.name || "").trim() === n);
  const step = (a, re) => (a.steps || []).find(x => re.test(x.label));
  const hrs = (a, re, v, who, fee) => { const x = step(a, re); if (!x) return; const conf = a.conf = a.conf || {};
    if (!conf["h" + x.id]){ x.hours = v; conf["h" + x.id] = 1; } if (who) x.who = who; if (fee != null) x.fee = fee; };
  const zero = (a, re) => { const x = step(a, re); if (x && !(a.conf || {})["h" + x.id]) x.hours = 0; };
  const note = (a, t) => { a.nuances = (a.nuances ? a.nuances + " " : "") + t; };
  let a;
  if ((a = by("Product catalogue pages"))){ hrs(a, /^brief$/i, 3); note(a, "3 hours of team time for 2 pages (one product family), Sally, 4 Nov. How many families per portfolio: Sally to confirm."); }
  if ((a = by("Product brochure"))){ hrs(a, /^brief$/i, 4); zero(a, /^copy$/i); note(a, "4 hours of team time for briefing, writing and approval, plus the agency design (Sally, 4 Nov). 4 pages, PDF."); }
  if ((a = by("Product factsheet"))){ hrs(a, /^copy$/i, 3); note(a, "3 hours of team time for the 2-page factsheet (Sally, 4 Nov). Template exists."); }
  if ((a = by("Customer FAQ"))){ note(a, "New. About 20 questions, generic for now. Feeds AEO and Highspot (Sally, 4 Nov). Hours not given yet."); }
  if ((a = by("Interactive demo video"))){ hrs(a, /^brief$/i, 15); note(a, "15 hours of team time per video (Sally, 4 Nov). Navattic approval is close; one demo per product with a portal, volume to come from Sally."); }
  if ((a = by("Explainer video"))){ zero(a, /script brief/i); hrs(a, /^script$/i, 15); note(a, "15 hours of team time today, mostly scripting and feedback loops (Sally, 4 Nov). Social cutdowns go in the same price. 60 seconds is the length wanted."); }
  if ((a = by("Sales to customer email"))){ zero(a, /^brief$/i); hrs(a, /^draft$/i, 2); note(a, "2 hours an email, one email today. Should be one per ICP cohort (3). Known customers only, sent through Highspot (Sally, 4 Nov)."); }
  if ((a = by("Social pack"))){ zero(a, /^brief$/i); hrs(a, /^draft$/i, 1, "PMM", 0); const mv = step(a, /market version/i); if (mv) mv.fee = 0;
    note(a, "3 static posts, about 1 hour for all three, done in-house only (Sally, 4 Nov)."); }
  if ((a = by(".com presence"))){ zero(a, /^brief$/i); hrs(a, /^draft$/i, 1); note(a, "A couple of sentences for the portfolio page, about 1 hour (Sally, 4 Nov). Anything longer is bespoke per market."); }
  if ((a = by("Video cutdowns"))){ note(a, "New: not done today. 3 or 4 cutdowns per long video for LinkedIn and YouTube Shorts (Sally, 4 Nov)."); }
  if ((a = by("Blog or article"))){ zero(a, /^brief$/i); hrs(a, /^draft$/i, 2, "PMM", 0); hrs(a, /product review/i, 3, "Subject matter expert");
    note(a, "2 hours for Sally's team and 3 for the subject matter expert who authors it. Written in-house now, the agency budget was cut. Wanted: at least one a month, ideally every two weeks (Sally, 4 Nov)."); }
  if ((a = by("eBook"))){ a.optional = false; a.tiers = null; a.today = {n: 4, u: 0, m: 0}; a.want = {n: 12, u: 0, m: 0}; hrs(a, /^brief$/i, 12);
    note(a, "12 hours of team time today, the target is 4. One a quarter today, 12 a year is Sally's very optimistic target. Design is the heavy part (Sally, 4 Nov)."); }
  if ((a = by("Pitch deck"))){ a.optional = true; a.tiers = []; a.today = {n: 0, u: 0, m: 0}; a.want = {n: 0, u: 0, m: 0};
    note(a, "Out of the case for now (Sally and Mohit, 4 Nov): too bespoke. A second stage, if products can be grouped into 4 or 5 cohorts. A standard look and feel can come first."); }
  const TECH = ["Solution architecture pack", "Technical factsheet", "Security and compliance pack", "API and integration factsheet", "Service guide", "Migration guide", "Implementation guide", "Customer welcome email", "Welcome FAQ", "How-to guide, PDF", "How-to guides, interactive"];
  for (const n of TECH) if ((a = by(n))){ a.optional = true; a.tiers = []; a.today = {n: 0, u: 0, m: 0}; a.want = {n: 0, u: 0, m: 0};
    note(a, "Paused (Sally, 4 Nov): not made by her team today; pre-sales and solution architects hold the raw content. Sally will give an illustrative agency cost, so it shows as new work AI makes possible."); }
  for (const n of ["Demo video", "Customer guide", "Educational videos"]){ const x = by(n); if (!x) continue;
    st.sections.forEach(s => s.assets = s.assets.filter(id => id !== x.id)); delete st.assets[x.id]; }
  const sp = by("Social pack"), to = (st.sections || []).find(x => x.name === "Positioning and messaging"), from = sp && (st.sections || []).find(x => x.assets.includes(sp.id));
  if (sp && to && from && from !== to){ from.assets = from.assets.filter(id => id !== sp.id); const ck = by("Copy kit"), at = ck ? to.assets.indexOf(ck.id) : -1; to.assets.splice(at >= 0 ? at + 1 : to.assets.length, 0, sp.id); }
  const B = st.benefits = st.benefits || {lines: [], strategic: []};
  if (!(B.lines || []).some(l => /Navattic/.test(l.label))) (B.lines = B.lines || []).push({id: "bnav" + Date.now().toString(36), label: "Interactive demo licence (Navattic)", now: "€15,000 a year for the whole team, due end of March", ai: "Not needed if the platform makes the MP4 demos", how: "Sally's figure, 4 Nov. Not in the totals."});
  if (!st.assets[st.current]) st.current = st.sections.flatMap(x => x.assets)[0];
  (st.applied = st.applied || []).push("batch3"); return true;
}
/* Batch 4 (9 Nov): defaults agreed with Mohit where Sally gave no number. Everything else is left as it was. */
function applyBatch4(st){
  if (!st || !st.assets || (st.applied || []).includes("batch4")) return false;
  const by = n => Object.values(st.assets).find(x => (x.name || "").trim() === n);
  let a;
  if ((a = by("Sales to customer email")) && a.want && a.want.n === a.today.n){ a.want = {...a.want, n: a.today.n * 3}; a.nuances = (a.nuances || "") + " Volume planned at 3 a launch, one per ICP cohort (default, to confirm)."; }
  if ((a = by("Video cutdowns")) && a.want && !a.want.n){ a.tiers = null; a.want = {n: 51, u: 0, m: 0}; a.nuances = (a.nuances || "") + " Volume: 3 cutdowns for each of the 17 explainer videos (default, to confirm)."; }
  (st.applied = st.applied || []).push("batch4"); return true;
}
/* Batch 5 (9 Nov): an asset has one adaptation row. Market steps are merged: hours, days and agency fees add up. */
function applyBatch5(st){
  if (!st || !st.assets || (st.applied || []).includes("batch5")) return false;
  for (const a of Object.values(st.assets)){
    const mk = (a.steps || []).filter(x => x.phase === "market"); if (mk.length < 2) continue;
    const [f, ...rest] = mk, conf = a.conf = a.conf || {};
    const sum = k => mk.reduce((t, x) => t + (+x[k] || 0), 0);
    const whos = [...new Set(mk.map(x => (x.who || "").trim()).filter(Boolean))];
    f.hours = sum("hours"); f.days = sum("days"); f.fee = sum("fee"); f.parallel = false; f.who = whos.length === 1 ? whos[0] : whos.join(", ");
    f.comment = [f.comment, ...rest.map(x => x.comment)].filter(Boolean).join(" ") || "";
    if (mk.some(x => conf["h" + x.id])) conf["h" + f.id] = 1; if (mk.some(x => conf["d" + x.id])) conf["d" + f.id] = 1;
    a.steps = a.steps.filter(x => !rest.includes(x));
  }
  (st.applied = st.applied || []).push("batch5"); return true;
}
/* hosted: one shared copy of the whole tool; the newest save wins */
const SHARED = location.protocol.startsWith("http");
function pullState(){
  if (!SHARED) return;
  const act = document.activeElement; if (act && /INPUT|TEXTAREA|SELECT/.test(act.tagName)) return;
  fetch("api/state").then(r => r.json()).then(R => {
    if (!R || !R.assets || (R.version || 0) < 16) return;
    if ((R.savedAt || 0) > (S.savedAt || 0)){
      S = R; cleanState(S); applyBatch1(S); applyBatch2(S); applyBatch3(S); applyBatch4(S); applyBatch5(S); try { localStorage.setItem(STORE + S.client.id, JSON.stringify(S)); } catch(_){}
      const y = scrollY; render(); scrollTo(0, y);
    }
  }).catch(() => {});
}
const levLine = key => { for (const g of S.tobe.groups) for (const l of g.lines) if (l.key === key) return l; };

/* ===================================================================
   Paint
   =================================================================== */
const ICON = {
  x:'<path d="M18 6 6 18M6 6l12 12"/>', check:'<path d="M20 6 9 17l-5-5"/>', plus:'<path d="M12 5v14M5 12h14"/>', chev:'<path d="m6 9 6 6 6-6"/>',
  clip:'<path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/>',
  note:'<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  par:'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 3v18"/>',
  side:'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/>',
  grip:'<circle cx="9" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="18" r="1"/>'
};
const ic = (k, s = 14) => `<svg class="i" viewBox="0 0 24 24" style="width:${s}px;height:${s}px" aria-hidden="true">${ICON[k]}</svg>`;

/* what each figure is, how it is worked out */
const TIPS = {
  plan:   {t:"FY27 plan", what:"Vodafone's FY27 roadmap: new launches, market versions and updates, by tier. Each asset's volume follows the tiers it is made for."},
  kit:    {t:"One launch", what:"Every toolkit asset for one launch. Each asset starts when its inputs are in and what it builds on is approved."},
  cost:   {t:"Cost per asset", what:"One new asset. Today: team hours at the hourly rate, plus agency fees. With AI: the brief and review hours, plus Amy's price where Amy makes it.", how:"hours × € an hour + agency fees + Amy's price"},
  withai: {t:"With AI", what:"AI saves part of the team's hours and waiting on each step. The agency fee stays."},
  withamy:{t:"With Amy", what:"Amy drafts, designs and makes market versions; each of those steps takes about 15 minutes of team time. The rest is the brief and the reviews."},
  reviews:{t:"Reviews", what:"With AI the team's time goes into review. An update or a market version needs about half the review of a new asset."},
  price:  {t:"Amy price per asset", what:"What Amy charges for one asset, by size. Self-service: Vodafone's team works in Amy. Managed: Digital Apple runs Amy for Vodafone. Updates and market versions cost the same."},
  today:  {t:"Today", what:"Who makes the asset now: an agency, the in-house team, or no one yet."},
  saved:  {t:"Saved", what:"How much less the asset costs a year with AI, at its plan volume.", how:"1 − with AI a year ÷ old way a year"},
  saving: {t:"Cash saved", what:"What Vodafone would pay for the FY27 plan the old way, less what it pays with AI over the same years. The one-off is included.", how:"old way × years − (with AI × years + one-off)"},
  cash:   {t:"Cash", what:"What Vodafone pays out: agency and outside fees, Amy and the Amy platform. This is the budget."},
  time:   {t:"Team time", what:"Hours Vodafone's own people and the market teams spend, at the hourly rate. Kept apart from cash: freed time is capacity, not a budget line."},
  allcost:{t:"All costs saved", what:"Cash saved plus the Vodafone and market team time freed, at the hourly rate, over the same years. The full cost of making the content.", how:"(cash + team time) old way − (cash + team time) with AI"},
  freed:  {t:"People freed", what:"Team hours no longer spent in a year, shown as people. Darker squares: the Vodafone team. Lighter squares: the market teams.", how:"(hours old way − hours with AI) ÷ hours a person works a year"},
  old:    {t:"Old way", what:"The FY27 plan, at its volumes, made the way it is made today."},
  ret:    {t:"Return", what:"What comes back for each euro spent on Amy and the setup.", how:"(saving + that spend) ÷ that spend"},
  pay:    {t:"Payback", what:"Months until the saving pays back the one-off setup.", how:"one-off ÷ saving a month"},
  tco:    {t:"Budget with AI", what:"What Vodafone would budget, year by year: the one-off in year one, then the same each year. Amy is charged on use, so its line is an estimate, trued up each quarter."},
};
const info = k => `<button type="button" class="info" data-tip="${k}" aria-label="About ${TIPS[k].t}">i</button>`;

function render(){
  $("#client").textContent = S.client.project; $("#clientName").textContent = S.client.name;
  document.querySelectorAll("[data-tab]").forEach(b => b.setAttribute("aria-selected", b.dataset.tab === TAB));
  const m = compute(S);
  $("#main").innerHTML = TAB === "discuss" ? (typeof discussHTML === "function" ? discussHTML() : "") : TAB === "asis" ? asIsHTML(m) : TAB === "tobe" ? toBeHTML(m) : bcHTML(m);
  document.querySelectorAll("[data-count]").forEach(countTo);
  if (TAB === "asis") markUnconfirmed();
}

/* Values still at a starting guess are tinted red until someone confirms
   them: typing in a cell confirms it (a.conf). Real data stays plain: what
   was typed on 2 Nov, rate-card agency fees. */
const DEFAULT_INPUTS = ["Product specs", "Positioning and messaging"];
function uncKeys(a){
  const conf = a.conf || {}, out = new Set(), add = k => { if (!conf[k]) out.add(k); };
  if (!(a.desc || "").trim()) add("desc");
  outsOf(a).forEach(o => { if (!(o.label || "").trim()) add("ol" + o.id); if (!(o.format || "").trim()) add("of" + o.id); });
  for (const it of a.inputs || []){
    if (DEFAULT_INPUTS.includes(it.label)){ add("il" + it.id); add("if" + it.id); }
    add("id" + it.id);
  }
  for (const st of a.steps || []){
    add("h" + st.id); add("d" + st.id);
    if (/agency|external/i.test(st.who || "") && !(+st.fee > 0)) add("f" + st.id);
  }
  return out;
}
function markUnconfirmed(){
  const a = S.assets[S.current]; if (!a) return;
  const keys = uncKeys(a);
  document.querySelectorAll("#main [data-k]").forEach(el => {
    const on = keys.has(el.dataset.k); el.classList.toggle("unc", on);
    if (on && !(el.parentElement && el.parentElement.classList.contains("cfw"))){
      const w = document.createElement("span"); w.className = "cfw" + (el.classList.contains("cell") ? " blk" : "");
      el.parentNode.insertBefore(w, el); w.appendChild(el);
      w.insertAdjacentHTML("beforeend", `<button class="cfm" data-cfm="${el.dataset.k}" title="Confirm this value" aria-label="Confirm this value">${ic("check", 8)}</button>`);
    }
  });
  tocfCount(a, keys.size);
}
function tocfCount(a, n){
  const el = $("#tocf"); if (el) el.innerHTML = n ? `<button class="cfall" data-cfall>Confirm all</button>` : "";
}
function confirmKey(a, k){ (a.conf = a.conf || {})[k] = 1; }

/* count-up: the one authored motion moment */
const LAST = {};
function countTo(node){
  const key = node.dataset.count, to = +node.dataset.to, fmt = node.dataset.fmt;
  const show = v => node.textContent = fmt === "big" ? big(v) : fmt === "d" ? Math.round(v) : eur(v);
  const from = LAST[key] ?? to; LAST[key] = to;
  if (from === to || matchMedia("(prefers-reduced-motion: reduce)").matches){ show(to); return; }
  const t0 = performance.now(), dur = 520;
  (function f(t){ const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3); show(from + (to - from) * e); if (p < 1) requestAnimationFrame(f); })(t0);
}

const n0 = v => Math.round(v).toLocaleString("en-GB");
/* Required: made today and kept; New: not made today, added with AI; Optional: Sally picks per tier */
const statusOf = a => a.status || (a.optional ? "optional" : madeToday(a) ? "required" : "new");
function setStatus(a, v){
  a.status = v; a.optional = v === "optional";
  if (v === "required"){
    if (a._todayWas){ a.today = a._todayWas; delete a._todayWas; }
    else if (!madeToday(a)){ a.today = {n: 22, u: 0, m: 0}; a.tiers = ["L1", "L2", "L3"]; a.rows = a.rows || "n"; }
  }
  if (v !== "required" && madeToday(a)){ a._todayWas = a.today; a.today = {n: 0, u: 0, m: 0}; }
}
/* an asset can have several outputs, each with a format and templates attached;
   a.output keeps them joined as text for the exports. Older copies hold plain text and are converted. */
function outsOf(a){
  if (!Array.isArray(a.outputs) || !a.outputs.length || a.outputs.some(o => typeof o === "string")){
    const src = Array.isArray(a.outputs) && a.outputs.length ? a.outputs : (a.output ? [a.output] : [""]);
    a.outputs = src.map(o => {
      if (typeof o !== "string") return o;
      const i = o.indexOf(","), many = src.length > 1;
      return {id: uid("o"), label: many || i < 0 ? o : o.slice(0, i), format: many || i < 0 ? "" : o.slice(i + 1).trim(), example: "", files: []};
    });
  }
  return a.outputs;
}
const syncOut = a => { a.output = outsOf(a).map(o => [o.label, o.format].map(x => (x || "").trim()).filter(Boolean).join(", ")).filter(Boolean).join("; "); };
const madeToday = a => { const t = a.today || {}; return (+t.n || 0) + (+t.u || 0) + (+t.m || 0) > 0; };
const SIZE_OPTS = (cur, attrs) => `<select class="cell sel sz" ${attrs}>${Object.entries(SIZES).map(([k, l]) => `<option value="${k}" ${k === cur ? "selected" : ""}>${l}</option>`).join("")}</select>`;
const ROUTE_OPTS = a => `<select class="cell sel" data-route="${a.id}" aria-label="Made by, with AI">${(S.routes || []).map(r => `<option value="${r.key}" ${r.key === a.route ? "selected" : ""}>${esc(r.label)}</option>`).join("")}</select>`;

/* who is paid, in the joint case's colours: the old way in greys,
   what is paid to Amy (managed, self-service, platform) in Amy's coral */
const PAY = [["central", "Vodafone team", "k-team"], ["market", "Market team", "k-market"], ["agency", "Agency", "k-agency"], ["other", "Other outside costs", "k-other"],
  ["dfy", "Amy managed", "k-dfy"], ["self", "Amy self-service", "k-self"], ["platform", "Amy platform", "k-platform"]];
const KCLASS = Object.fromEntries(PAY.map(p => [p[0], p[2]]));
/* one stacked bar; parts = [[class, label, value]], width relative to scale */
const bar = (parts, scale, fmt = eur) => `<div class="stack">${parts.filter(p => p[2] > 0.01).map(([c, l, v]) =>
  `<i class="${c}" style="width:${(v / (scale || 1) * 100).toFixed(2)}%" data-hover="${esc(l)}: ${fmt(v)}"></i>`).join("")}</div>`;
const payParts = c => PAY.filter(p => p[0] in c).map(([k, l, cl]) => [cl, l, c[k]]);

/* ---------- As-is ---------- */
function isMapped(a){ return a.steps.some(s => +s.hours > 0 || +s.fee > 0 || +s.days > 0); }

/* list sections fold away; the one holding the open asset starts open */
const RAIL_OPEN = new Set(), RAIL_SHUT = new Set();
/* the list can be hidden to give the page room; remembered in this browser */
let RAIL_HIDE = (() => { try { return localStorage.getItem(STORE + "railHidden") === "1"; } catch(_){ return false; } })();
const railOpen = sec => !RAIL_SHUT.has(sec.id) && (RAIL_OPEN.has(sec.id) || sec.assets.includes(S.current));
/* the FY27 plan in Vodafone's own tiers */
const TIER = {L1: "L1 strategic, first market", L2: "L2 non-strategic, first market", L3: "L3 rollout into a cluster"};
const PLAN_ROWS = [["launch", "New launches"], ["expand", "Market versions"], ["update", "Updates"]];
/* the plan grid: new launches, market versions and updates by tier */
function planHTML(){
  const P = S.plan; if (!P) return "";
  return `<div class="plan"><div class="ph-t">Planned launches</div><div class="ph-h"><span></span>${["L1", "L2", "L3"].map(k => `<b data-hover="${TIER[k]}">${k}</b>`).join("")}</div>` +
    PLAN_ROWS.map(([r, l]) => `<div class="ph-r"><span>${l}</span>${["L1", "L2", "L3"].map(k =>
      `<input class="num sm" data-plan="${r}.${k}" data-k="p${r}${k}" inputmode="decimal" value="${val(P[r][k])}" aria-label="${l}, ${TIER[k]}">`).join("")}</div>`).join("") + `</div>`;
}
/* top of the list: hide it, and how many assets and markets there are */
function railTop(){
  const n = S.sections.filter(s => s.toolkit !== false).reduce((t, s) => t + s.assets.filter(id => !S.assets[id].optional && !S.assets[id].parent).length, 0);
  return `<div class="rtop"><button class="railbtn in" data-rail data-hover="Hide the list" aria-label="Hide the asset list">${ic("side", 15)}</button>
    <span><b>${n}</b> assets</span><span data-hover="DE, UK and VBI; cluster markets are in L3"><b>${val(S.plan ? S.plan.markets : "")}</b> lead markets</span></div>`;
}
function railHTML(){
  return railTop() + `<div class="it kit ${S.current === "toolkit" ? "on" : ""}" data-kit><span class="nm">Digital toolkit</span></div>` +
    S.sections.map(sec => { const open = railOpen(sec);
      return `<div class="sec" data-sec="${sec.id}">
      <button class="secbtn" data-rsec="${sec.id}" aria-expanded="${open}"><span class="chev">${ic("chev", 11)}</span><span class="nm" data-ren-sec="${sec.id}">${esc(sec.name)}</span></button>
      <button class="mini hov" data-add-asset="${sec.id}" aria-label="Add an asset to ${esc(sec.name)}" title="Add an asset">${ic("plus", 12)}</button>
      <button class="mini hov" data-del-sec="${sec.id}" aria-label="Remove ${esc(sec.name)}" title="Remove section">${ic("x", 12)}</button>
    </div>` + (open ? sec.assets.map(id => {
      const a = S.assets[id];
      return `<div class="it ${id === S.current ? "on" : ""} ${isMapped(a) ? "" : "blank"} ${a.optional ? "opt" : ""} ${a.parent ? "kid" : ""}" data-asset="${id}" draggable="true"${a.optional ? ` title="Optional"` : a.parent ? ` title="Part of ${esc((S.assets[a.parent] || {}).name || "")}: counted there"` : ""}>
        <span class="grip hov">${ic("grip", 12)}</span>
        <span class="nm" data-ren-asset="${id}">${esc(a.name)}</span><span class="cvt${a.covered ? " y" : ""}" title="${a.covered ? "Covered" : "Not covered yet"}">${a.covered ? ic("check", 9) : ""}</span>
        ${a.parent ? "" : a.optional ? `<span class="dot opt" title="Optional"></span>` : madeToday(a) ? "" : `<span class="dot" title="Not made today"></span>`}
        <button class="mini hov" data-del-asset="${id}" aria-label="Remove ${esc(a.name)}" title="Remove asset">${ic("x", 12)}</button>
      </div>`;
    }).join("") : ""); }).join("") +
    `<div class="rlegend"><span><i class="dot"></i>Not made today</span><span><i class="dot opt"></i>Optional</span></div><div class="addrow"><button data-new="asset">${ic("plus", 11)} Asset</button><button data-new="section">${ic("plus", 11)} Section</button></div>`;
}

let VIEW = "old";            // toolkit timeline: today or with AI
let GSCALE = 10;             // days across the step timeline, for dragging a step
const KIT_OPEN = new Set();  // toolkit sections opened to show their assets

const niceScale = d => Math.max(10, Math.ceil(d / 5) * 5);
const PC = {create: "c-make", market: "c-mkt", approve: "c-appr"};
const PHASE = {create: "Creation", approve: "Approvals", market: "Adaptation"};
const NEXT_PHASE = {create: "approve", approve: "create", market: "market"};
const viewPills = () => `<div class="pillrow">${[["old", "Today"], ["ai", "With AI"]].map(([k, l]) =>
  `<button class="pill" data-view="${k}" aria-pressed="${VIEW === k}">${l}</button>`).join("")}</div>`;

/* one step on a timeline: its idle days, then its work in the colour of its phase */
function stepBars(st, w, label, grab){
  const idle = st.workStart - st.begin;
  return (idle > 0.01 ? `<b class="c-wait" style="left:${w(st.begin)}%;width:${w(idle)}%" data-hover="${label}: wait, ${d1(idle)} days"></b>` : "") +
    `<b class="${PC[st.phase]}${grab ? " grab" : ""}" ${grab ? `data-grab="${grab}"` : ""} style="left:${w(st.workStart)}%;width:${Math.max(.5, w(st.stop - st.workStart))}%"
      data-hover="${label}: ${PHASE[st.phase].toLowerCase()}, ${h1(st.hours)} hours${grab ? ". Drag to change its days" : ""}"></b>`;
}
const thinBar = (from, to, w, label) => `<b class="tb" style="left:${w(from)}%;width:${Math.max(.5, w(to - from))}%" data-hover="With AI: ${label}, ${d1(to - from)} days"></b>`;

/* time as a stacked bar: inputs, making, approving, idle */
const TIME = [["c-dep", "Inputs", "dep"], ["c-make", "Creation", "making"], ["c-appr", "Approvals", "approving"], ["c-wait", "Wait", "idle"]];
/* a legend under a bar, for the parts it shows */
const legend = parts => `<div class="legend">${parts.map(([c, l]) => `<span><i class="${c}"></i>${l}</span>`).join("")}</div>`;
const timeBar = (s, scale) => bar(TIME.map(([c, l, k]) => [c, l, s[k]]), scale, v => d1(v) + " days");
const twoBars = (lblA, a, lblB, b, scale, fn, totA, totB) =>
  `<div class="trow"><span>${lblA}</span>${fn(a, scale)}<b>${totA}</b></div><div class="trow ai"><span>${lblB}</span>${fn(b, scale)}<b>${totB}</b></div>`;

/* a step with AI, as plain numbers: hours of work and days start to finish */
const HPD = () => lever(S, "hoursPerDay") || 7;
function aiStep(s, a){
  if (a && amyMakes(S, a, s, true)) return {h: AMY_H, d: AMY_H / HPD(), amy: true};
  const hpd = HPD(), h = +s.hours || 0, idle = Math.max(0, (+s.days || 0) - h / hpd);
  const ha = h * (1 - (+s.ai || 0) / 100);
  return {h: ha, d: ha / hpd + idle * (1 - (+s.aiWait || 0) / 100)};
}
const dd = n => n >= 3 ? n0(n) : d1(n);

function asIsHTML(m){
  const rail = RAIL_HIDE ? `<div class="askcol slim"><button class="railbtn" data-rail data-hover="Show the asset list" aria-label="Show the asset list">${ic("side", 16)}</button></div>`
    : `<div class="askcol"><section class="ask">${railHTML()}</section></div>`;
  const intro = "";
  if (S.current !== "toolkit" && !S.assets[S.current]) S.current = "toolkit";
  if (S.current === "toolkit") return intro + `<div class="grid${RAIL_HIDE ? " slimg" : ""}">${rail}<div class="answers">${toolkitHTML(m)}</div></div>`;

  const a = S.assets[S.current], x = m.assets.find(r => r.id === a.id), O = x.sched.old, A = x.sched.ai;
  const c0 = x.unit.old.n, c1 = x.unit.ai.n, cs = Math.max(money(c0), money(c1));
  const tSc = Math.max(O.elapsed, A.elapsed);
  const acts = (id, files, note, del, extra = "", attachTip = "Attach a sample") => `<td class="acts">${extra}
      <button class="ic ${files && files.length ? "on" : "hov"}" data-attach="${id}" title="${attachTip}" aria-label="${attachTip}">${ic("clip")}</button>
      <button class="ic ${note ? "on" : "hov"}" data-note="${id}" title="Notes" aria-label="Notes">${ic("note")}</button>
      <button class="ic hov" ${del}="${id}" title="Remove" aria-label="Remove">${ic("x")}</button></td>`;
  const noteRow = (id, cols, attr, text, ph, files) => NOTE.has(id) ? `<tr class="note"><td colspan="${cols}"><textarea ${attr} data-k="c${id}" placeholder="${ph}">${esc(text)}</textarea>
      ${files && files.length ? `<div class="files">${ic("clip", 12)} ${files.map(f => f.url ? `<a href="${esc(f.url)}" target="_blank" rel="noopener">${esc(f.name)}</a>` : esc(f.name)).join(" · ")}</div>` : ""}</td></tr>` : "";
  const head = (title, add, sub = "") => `<div class="mhead"><h3>${title}${sub ? `<span>${sub}</span>` : ""}</h3><button class="add-btn" ${add}>${ic("plus", 11)} Add</button></div>`;
  const hd = (k, id, v, lbl) => `<input class="num sm" data-s="${k}" data-k="${k[0]}${id}" inputmode="decimal" value="${val(v)}" aria-label="${lbl}">`;
  const pair = (h, d) => `<span class="pair">${h}<i>h</i>${d}<i>d</i></span>`;

  const ins = (a.inputs || []).map(it => `<tr class="row">
      <td><input class="cell" data-in="label" data-inid="${it.id}" data-k="il${it.id}" value="${esc(it.label)}" placeholder="Input" aria-label="Input"></td>
      <td><input class="cell" data-in="from" data-inid="${it.id}" data-k="if${it.id}" value="${esc(it.from)}" placeholder="From" aria-label="From"></td>
      <td class="n"><span class="pair"><input class="num sm" data-in="days" data-inid="${it.id}" data-k="id${it.id}" inputmode="decimal" value="${val(it.days)}" aria-label="Days to get it"><i>d</i></span></td>
      ${acts(it.id, it.files, it.example || (it.files && it.files.length), "data-del-input")}</tr>` +
      noteRow(it.id, 4, `data-in="example" data-inid="${it.id}"`, it.example, "A sample or notes: what good looks like, where it comes from", it.files)).join("");

  const stepRow = (s, i, market) => { const q = aiStep(s, a), ph = s.phase || "create", has = s.comment || (s.files && s.files.length);
    return `<tr class="row" data-step="${s.id}">
      <td><div class="rowcell"><span class="grip hov" data-drag-step="${s.id}" draggable="true">${ic("grip", 12)}</span>
        ${market ? `<span class="ph c-mkt"></span>` : `<button class="ph ${PC[ph]}" data-phase="${s.id}" data-hover="${PHASE[ph]}" aria-label="${PHASE[ph]}, press to change"></button>`}
        <input class="cell" data-s="label" data-k="l${s.id}" value="${esc(s.label)}" placeholder="Step" aria-label="Step"></div></td>
      <td><input class="cell" data-s="who" data-k="w${s.id}" value="${esc(s.who)}" placeholder="Who" aria-label="Who"></td>
      <td class="n gT">${pair(hd("hours", s.id, s.hours, "Hours today"), hd("days", s.id, s.days, "Days today"))}</td>
      <td class="n ai gA">${q.amy ? pair(`<input class="num sm fixd" value="0.25" disabled data-hover="Amy makes this step" aria-label="Hours with Amy">`, `<input class="num sm fixd" value="0" disabled aria-label="Days with Amy">`) : pair(`<input class="num sm" data-sai="h" data-k="xh${s.id}" inputmode="decimal" value="${+s.hours ? h1(q.h) : ""}" ${+s.hours ? "" : "disabled"} aria-label="Hours with AI">`,
        `<input class="num sm" data-sai="d" data-k="xd${s.id}" inputmode="decimal" value="${d1(q.d)}" aria-label="Days with AI">`)}</td>
      <td class="n gF"><input class="num" data-s="fee" data-k="f${s.id}" inputmode="decimal" placeholder="–" value="${s.fee ? s.fee : ""}" aria-label="Agency fee"></td>
      <td class="n">${eur(stepCost(S, s))}</td>
      ${acts(s.id, s.files, has, "data-del-step", i ? `<button class="ic ${s.parallel ? "on" : "hov"}" data-par="${s.id}" aria-pressed="${!!s.parallel}" title="${s.parallel ? "Runs alongside the step above" : "Run alongside the step above"}">${ic("par")}</button>` : "")}</tr>` +
      noteRow(s.id, 7, `data-s="comment" data-step-id="${s.id}"`, s.comment, "What happens here, who chases, what goes wrong", s.files); };

  const make = a.steps.filter(s => s.phase !== "market"), mkt = a.steps.filter(s => s.phase === "market");
  const tot = (list, cost) => { const h = list.reduce((t, s) => t + (+s.hours || 0), 0), ha = list.reduce((t, s) => t + aiStep(s, a).h, 0), f = list.reduce((t, s) => t + (+s.fee || 0), 0);
    return `<tr class="tot"><td colspan="2">Total</td><td class="n gT">${h1(h)} h</td><td class="n ai gA">${h1(ha)} h</td><td class="n gF">${f ? eur(f) : ""}</td><td class="n">${eur(cost)}</td><td></td></tr>`; };
  const cols = `<colgroup><col style="width:29%"><col style="width:16%"><col style="width:13%"><col style="width:13%"><col style="width:10%"><col style="width:8%"><col style="width:11%"></colgroup>`;
  const byAmy = ["self", "dfy"].includes(routeOf(S, a).kind);
  const thead = (tip, title, add, sub = "") => `<thead><tr><th class="sh">${title}${sub ? `<span>${sub}</span>` : ""}</th><th>Who</th><th class="n gT">Today</th><th class="n gA">${byAmy ? "With Amy" : "With AI"}${tip ? info(byAmy ? "withamy" : "withai") : ""}</th><th class="n gF">Agency fee</th><th class="n">Cost</th><th class="n"><button class="add-btn" ${add}>${ic("plus", 11)} Add</button></th></tr></thead>`;

  return intro + `<div class="grid${RAIL_HIDE ? " slimg" : ""}">${rail}
    <div class="answers">
      <section class="hero">
        <input class="title" data-f="name" data-k="title" value="${esc(a.name)}" aria-label="Asset name">
        <input class="hdesc top" data-f="desc" data-k="desc" value="${esc(a.desc || "")}" placeholder="What this asset is for, in one line" aria-label="What this asset is for">
        <label class="stsel"><span class="tocf" id="tocf"></span>Status <select class="cell sel" data-status="${a.id}" aria-label="Status of this asset">${[["required", "Required"], ["new", "New"], ["optional", "Optional"]].map(([k, l]) =>
          `<option value="${k}" ${statusOf(a) === k ? "selected" : ""}>${l}</option>`).join("")}</select></label>
        <div class="twin">
          <div class="blk">
            <div class="fig"><span data-count="c${a.id}" data-to="${money(c0)}">${eur(money(c0))}</span><span class="to">→</span><span class="ai">${eur(money(c1))}</span><small>per asset</small></div>
            ${twoBars("Today", c0, "With AI", c1, cs, (c, sc) => bar(payParts(c), sc), "", "")}
            ${legend(PAY.filter(([k]) => (c0[k] || 0) + (c1[k] || 0) > 0.01).map(([, l, c]) => [c, l]))}
          </div>
          <div class="blk">
            <div class="fig">${dd(O.elapsed)}<span class="to">→</span><span class="ai">${dd(A.elapsed)}</span><small>days, start to finish</small></div>
            ${twoBars("Today", O, "With AI", A, tSc, (s, sc) => timeBar({...s, dep: s.held}, sc), "", "")}
            ${legend([...TIME, ["c-ai-key", "With AI"]])}
          </div>
        </div>
      </section>
      <section class="detail">
        <div class="tabbar"><h3>How it's made</h3></div>
        <div class="tscroll"><table class="tin"><colgroup><col style="width:48%"><col style="width:28%"><col style="width:12%"><col style="width:12%"></colgroup>
          <thead><tr><th class="sh">Inputs</th><th>From</th><th class="n">Takes</th><th class="n"><button class="add-btn" data-add-input>${ic("plus", 11)} Add</button></th></tr></thead><tbody>${ins}</tbody></table></div>
        <div class="tscroll"><table>${cols}${thead(true, "Steps", "data-add-step")}<tbody>${make.map((s, i) => stepRow(s, i, false)).join("")}
          ${tot(make, money(c0))}

        </tbody></table></div>
        <div class="tscroll"><table class="tin"><colgroup><col style="width:48%"><col style="width:28%"><col style="width:12%"><col style="width:12%"></colgroup>
          <thead><tr><th class="sh">Outputs</th><th>Format and length</th><th class="n">Tag</th><th class="n"><button class="add-btn" data-add-out>${ic("plus", 11)} Add</button></th></tr></thead><tbody>${outsOf(a).map(o => `<tr class="row">
            <td><input class="cell" data-outf="label" data-outid="${o.id}" data-k="ol${o.id}" value="${esc(o.label)}" placeholder="Output" aria-label="Output"></td>
            <td><input class="cell" data-outf="format" data-outid="${o.id}" data-k="of${o.id}" value="${esc(o.format)}" placeholder="Format, pages, variants" aria-label="Format and length"></td>
            <td class="n"><button class="newtag${o.isNew ? " on" : ""}" data-out-new="${o.id}" aria-pressed="${!!o.isNew}" title="Not made today">New</button></td>
            ${acts(o.id, o.files, o.example || (o.files && o.files.length), "data-del-out", "", "Attach a template")}</tr>` +
            noteRow(o.id, 4, `data-outf="example" data-outid="${o.id}"`, o.example, "A template or notes: what good looks like", o.files)).join("")}</tbody></table></div>
        <div class="tscroll"><table class="adapt">${cols}${thead(false, "Adaptations", mkt.length ? `data-none hidden` : `data-add-step="market"`)}<tbody>${mkt.slice(0, 1).map((s, i) => stepRow(s, 0, true)).join("")}
        </tbody></table></div>
        <div class="nuance"><textarea data-f="nuances" data-k="nu" placeholder="Nuances: anything that changes how this asset is made, approved or adapted">${esc(a.nuances)}</textarea></div>
      </section>
    </div></div>`;
}

/* ---------- Whole toolkit: one launch, sections fold open ---------- */
/* As-is at a glance: today's facts only, one row a section. Spend is the FY27 plan made the way it is made today,
   the same "old way" the business case starts from, so the totals always agree. */
function summaryHTML(m, k0){
  const rows = S.sections.map(sec => {
    const xs = m.assets.filter(x => x.sectionId === sec.id && (x.pieces.today > 0 || x.pieces.plan > 0)); if (!xs.length) return null;
    const sum = f => xs.reduce((t, x) => t + f(x), 0), rs = k0.rows.filter(r => xs.some(x => x.id === r.id));
    return {id: sec.id, name: sec.name, made: xs.filter(x => x.made).length, fresh: xs.filter(x => !x.made).length,
      today: sum(x => x.pieces.today), plan: sum(x => x.pieces.plan), spend: sum(x => x.year.old.agency + x.year.old.other),
      hours: sum(x => x.year.old.hCentral + x.year.old.hMarket), day: rs.length ? Math.max(...rs.map(r => r.end)) : null};
  }).filter(Boolean).sort((a, b) => b.spend - a.spend);
  const T = rows.reduce((t, r) => ({made: t.made + r.made, fresh: t.fresh + r.fresh, today: t.today + r.today, plan: t.plan + r.plan, spend: t.spend + r.spend, hours: t.hours + r.hours}), {made: 0, fresh: 0, today: 0, plan: 0, spend: 0, hours: 0});
  const assets = r => `${r.made}${r.fresh ? ` <span class="na">+ ${r.fresh} new</span>` : ""}`;
  return `<section class="detail sumtab"><div class="tabbar"><h3>At a glance</h3><div class="tools">made the way it is today, FY27 plan</div></div>
    <div class="tscroll"><table class="sm"><thead><tr><th>Section</th><th class="n">Assets</th><th class="n">Pieces a year today</th><th class="n">FY27 plan</th><th class="n">Agency and outside spend</th><th class="n">Team hours</th><th class="n">Ready by day</th></tr></thead><tbody>
    ${rows.map(r => `<tr><td><button class="sectbtn" data-ksec="${r.id}" title="Show its assets below">${esc(r.name)}</button></td><td class="n">${assets(r)}</td><td class="n">${n0(r.today)}</td><td class="n">${n0(r.plan)}</td><td class="n">${r.spend ? eur(r.spend) : "–"}</td><td class="n">${r.hours ? n0(r.hours) : "–"}</td><td class="n">${r.day == null ? "–" : n0(r.day)}</td></tr>`).join("")}
    <tr class="tot"><td>Total</td><td class="n">${assets(T)}</td><td class="n">${n0(T.today)}</td><td class="n">${n0(T.plan)}</td><td class="n">${eur(T.spend)}</td><td class="n">${n0(T.hours)}</td><td class="n">${n0(k0.end)}</td></tr>
    </tbody></table></div><p class="smnote">New assets are not made today; their spend is what an agency would charge. Spend is the agency and outside cost only: team time is in hours.</p></section>`;
}
function toolkitHTML(m){
  const k0 = toolkit(S, m, false), k1 = toolkit(S, m, true);
  const scale = niceScale(Math.max(k0.end, k1.end)), w = d => (d / scale * 100).toFixed(2);
  const faster = k0.end ? Math.round((1 - k1.end / k0.end) * 100) : 0;
  const assetRow = x => {
    const r0 = k0.rows.find(r => r.id === x.id), r1 = k1.rows.find(r => r.id === x.id), a = S.assets[x.id];
    const steps = r => a.steps.map((s, i) => stepBars(r.sc.steps[i], w, esc(a.name + ": " + (s.label || "step")))).join("");
    let bars = "";
    if (VIEW !== "ai" && r0) bars += steps(r0);
    if (VIEW === "ai" && r1) bars += steps(r1);
    if (VIEW === "both" && r1) bars += thinBar(r1.start, r1.end, w, esc(a.name));
    const v = VIEW === "old" ? (r0 ? `${d1(r0.end)} d` : `<span class="na">new</span>`) : VIEW === "ai" ? (r1 ? `${d1(r1.end)} d` : "–")
      : `${r0 ? d1(r0.end) : `<span class="na">new</span>`} <s>→</s> ${r1 ? d1(r1.end) + " d" : "–"}`;
    return `<div class="grow sub"><span class="l"><button class="aname" data-goto="${x.id}" title="${esc(x.name)}">${esc(x.name)}</button></span><span class="t">${bars}</span><span class="v">${v}</span></div>`;
  };
  const secs = S.sections.map(sec => {
    const xs = m.assets.filter(x => x.sectionId === sec.id && (k0.rows.some(r => r.id === x.id) || k1.rows.some(r => r.id === x.id)));
    if (!xs.length) return "";
    const span = rows => { const rs = rows.filter(r => xs.some(x => x.id === r.id)); return rs.length ? [Math.min(...rs.map(r => r.start)), Math.max(...rs.map(r => r.end))] : null; };
    const s0 = span(k0.rows), s1 = span(k1.rows), open = KIT_OPEN.has(sec.id);
    let bars = "";
    if (VIEW !== "ai" && s0) bars += `<b class="c-span" style="left:${w(s0[0])}%;width:${Math.max(.5, w(s0[1] - s0[0]))}%" data-hover="${esc(sec.name)}, today: day ${d1(s0[0])} to ${d1(s0[1])}"></b>`;
    if (VIEW === "ai" && s1) bars += `<b class="c-span" style="left:${w(s1[0])}%;width:${Math.max(.5, w(s1[1] - s1[0]))}%" data-hover="${esc(sec.name)}, with AI: day ${d1(s1[0])} to ${d1(s1[1])}"></b>`;
    if (VIEW === "both" && s1) bars += thinBar(s1[0], s1[1], w, esc(sec.name));
    const v = VIEW === "old" ? (s0 ? `${d1(s0[1])} d` : "–") : VIEW === "ai" ? (s1 ? `${d1(s1[1])} d` : "–") : `${s0 ? d1(s0[1]) : "–"} <s>→</s> ${s1 ? d1(s1[1]) + " d" : "–"}`;
    return `<div class="grow gsec"><span class="l"><button class="sectbtn" data-ksec="${sec.id}" aria-expanded="${open}"><span class="chev">${ic("chev", 12)}</span>${esc(sec.name)}<span class="cnt">${xs.length}</span></button></span><span class="t">${bars}</span><span class="v">${v}</span></div>` +
      (open ? xs.map(assetRow).join("") : "");
  }).join("");
  return summaryHTML(m, k0) + `<section class="hero">
      <div class="headline"><span class="n"><span data-count="kit" data-to="${faster}" data-fmt="d">${faster}</span>%</span><span class="u">faster cycle time: ${Math.round(k1.end)} days to launch a toolkit with AI, against ${Math.round(k0.end)} today${info("kit")}</span></div>
      <div class="kitbars">${twoBars("Today", k0, "With AI", k1, scale, timeBar, Math.round(k0.end) + " d", Math.round(k1.end) + " d")}${legend([...TIME, ["c-ai-key", "With AI"]])}</div>
      <div class="gantt${VIEW === "ai" ? " ai" : ""}"><h3>Section by section${viewPills()}</h3>${secs}</div>
    </section>`;
}

/* ---------- To-be ---------- */
/* who makes it today, read from its process: an agency fee means the
   agency; made today without one means in-house; not made means not done */
function todayBy(a, x){
  if (!x.made) return "Not done";
  return a.steps.some(s => +s.fee > 0 && /agency/i.test(s.who || "")) ? "Agency" : "In-house";
}
/* saved %, shaded: the darker the green, the bigger the saving */
function savedCell(old, ai){
  if (!old) return `<td class="n sv">–</td>`;
  const p = Math.round((1 - ai / old) * 100), k = Math.max(0, Math.min(1, p / 80));
  const bg = p > 0 ? `background:rgba(51,161,0,${(0.1 + k * 0.75).toFixed(2)});color:${k > .55 ? "#fff" : "var(--ink)"}` : "";
  return `<td class="n sv"><span style="${bg}">${p}%</span></td>`;
}
const HINT = {setup: "Solutioning, shadowing, process mapping, the business case and AEO research", templates: "One for each asset Amy makes in the plan"};

function toBeHTML(m){
  const fld = l => {
    const auto = l.key === "templates" && (l.value == null || l.value === "");
    return `<label class="af"${HINT[l.key] ? ` data-hover="${HINT[l.key]}"` : ""}><span>${esc(l.label)}</span><input class="num ${l.key === "templates" && !auto ? "ovr" : ""}" data-tl="value" data-line="${l.id}" data-k="tv${l.id}" inputmode="decimal" ${auto ? `placeholder="${m.autoTemplates}"` : ""} value="${val(l.value)}" aria-label="${esc(l.label)}"><em>${esc(l.unit)}</em></label>`;
  };
  const isRate = g => g.lines.some(l => /^(self|dfy)(Small|Medium|Large)$/.test(l.key || ""));
  const CARD_TIP = {"Reviews": "reviews"};
  const card = g => `<div class="tcard"><h4>${esc(g.name)}${CARD_TIP[g.name] ? info(CARD_TIP[g.name]) : ""}</h4>${g.lines.map(fld).join("")}</div>`;
  const cell = key => { const l = levLine(key); return l ? `<input class="num" data-tl="value" data-line="${l.id}" data-k="tv${l.id}" inputmode="decimal" value="${val(l.value)}" aria-label="${esc(key)}">` : ""; };
  const runCard = `<div class="tcard"><h4>Amy price per asset${info("price")}</h4><table class="rc"><thead><tr><th></th><th class="n">Small</th><th class="n">Medium</th><th class="n">Large</th></tr></thead><tbody>
      <tr><td>Self-service</td><td class="n">${cell("selfSmall")}</td><td class="n">${cell("selfMedium")}</td><td class="n">${cell("selfLarge")}</td></tr>
      <tr><td>Managed</td><td class="n">${cell("dfySmall")}</td><td class="n">${cell("dfyMedium")}</td><td class="n">${cell("dfyLarge")}</td></tr></tbody></table></div>`;
  const groups = S.tobe.groups.filter(g => !g.hidden && !isRate(g));
  const setup = groups.find(g => g.lines.some(l => l.key === "setup"));
  const cards = groups.filter(g => g !== setup).map(card).join("") + runCard + (setup ? card(setup) : "");

  const qty = (a, x) => a.tiers
    ? `<span data-hover="${n0(x.planned.n)} new · ${n0(x.planned.u)} updates · ${n0(x.planned.m)} market versions, from the FY27 plan">${n0(x.pieces.plan)}</span>`
    : `<input class="num" data-vol="want" data-i="n" data-asset-id="${a.id}" data-k="vwantn${a.id}" inputmode="decimal" value="${val(a.want.n)}" aria-label="Qty a year">`;
  let tOld = 0, tAI = 0;
  const rows = S.sections.map(sec => {
    const items = sec.assets.map(id => m.assets.find(x => x.id === id)).filter(Boolean);
    const sOld = items.reduce((t, x) => t + money(x.year.old), 0), sAI = items.reduce((t, x) => t + money(x.year.ai), 0);
    tOld += sOld; tAI += sAI;
    const open = !SHUT.has("p" + sec.id);
    return `<tr class="sect"><td colspan="5"><button class="sectbtn" data-sect="p${sec.id}" aria-expanded="${open}"><span class="chev">${ic("chev", 12)}</span>${esc(sec.name)}<span class="cnt">${items.length}</span></button></td>${savedCell(sOld, sAI)}</tr>` +
      (open ? items.map(x => { const a = S.assets[x.id], by = todayBy(a, x);
        return `<tr class="row ${x.pieces.plan ? "" : "blank"}">
          <td><div class="rowcell"><button class="aname" data-goto="${x.id}" title="${esc(x.name)}">${esc(x.name)}</button>${a.optional ? `<span class="optg">Optional</span>` : ""}${SIZE_OPTS(a.size, `data-size="${a.id}" aria-label="Size"`)}</div></td>
          <td><span class="by by-${by[0].toLowerCase()}">${by}</span></td>
          <td>${ROUTE_OPTS(a)}</td>
          <td class="n">${qty(a, x)}</td>
          <td class="n rate" data-hover="A new asset. With AI: ${x.route.kind === "agency" ? "the agency fee, fewer Vodafone hours" : `Amy ${eur(x.runs * x.runPrice)}, plus brief and review hours`}">${eur(money(x.unit.old.n))}<s>→</s><span class="ai">${eur(money(x.unit.ai.n))}</span></td>
          ${savedCell(money(x.year.old), money(x.year.ai))}</tr>`; }).join("") : "");
  }).join("");

  /* what each tier needs: the user ticks the assets made for L1, L2 and L3 */
  const tiered = S.sections.map(sec => ({sec, list: sec.assets.map(id => S.assets[id]).filter(Boolean)})).filter(g => g.list.length);
  const matrix = tiered.map(({sec, list}) => `<tr class="sect"><td colspan="5">${esc(sec.name)}</td></tr>` + list.map(a => {
    const x = m.assets.find(r => r.id === a.id);
    const ticks = a.tiers ? ["L1", "L2", "L3"].map(k => `<td class="c"><input type="checkbox" data-tier="${a.id}:${k}" ${a.tiers.includes(k) ? "checked" : ""} aria-label="${esc(a.name)}, ${TIER[k]}"></td>`).join("")
      : `<td class="c fx" colspan="3">Not tied to launches</td>`;
    return `<tr class="row"><td>${esc(a.name)}${a.optional ? ` <span class="optg">Optional</span>` : ""}</td>${ticks}<td class="n">${n0(x ? x.pieces.plan : 0)}</td></tr>`; }).join("")).join("");

  const planBlock = `<section class="detail planblk"><div class="tabbar"><h3>FY27 plan${info("plan")}</h3><div class="tools">${n0(m.pieces.plan)} assets a year</div></div>
      <div class="pbody">${planHTML()}
        <button class="sectbtn tiersbtn" data-tiers aria-expanded="${TIERS_OPEN}"><span class="chev">${ic("chev", 12)}</span>Which assets each tier gets</button></div>
      ${TIERS_OPEN ? `<div class="tscroll"><table class="tm"><colgroup><col style="width:52%"><col style="width:12%"><col style="width:12%"><col style="width:12%"><col style="width:12%"></colgroup>
        <thead><tr><th>Asset</th>${["L1", "L2", "L3"].map(k => `<th class="c" data-hover="${TIER[k]}">${k}</th>`).join("")}<th class="n">Qty</th></tr></thead>
        <tbody>${matrix}</tbody></table></div>` : ""}</section>`;

  return `
    <div class="pgap"></div>${planBlock}
    <div class="tcards">${cards}</div>
    <section class="detail" style="margin-top:14px"><div class="tabbar"><h3>Assets with AI</h3></div>
      <div class="tscroll"><table class="ta"><colgroup><col style="width:34%"><col style="width:12%"><col style="width:18%"><col style="width:9%"><col style="width:18%"><col style="width:9%"></colgroup>
        <thead><tr><th>Asset</th><th>Today${info("today")}</th><th>With AI</th><th class="n">Qty</th><th class="n" data-hover="One new asset, today → with AI">Rate</th><th class="n">Saved${info("saved")}</th></tr></thead>
        <tbody>${rows}
          <tr class="tot"><td colspan="3">All assets, a year</td><td class="n">${n0(m.pieces.plan)}</td><td class="n">${eur(tOld)}<s>→</s><span class="ai">${eur(tAI)}</span></td>${savedCell(tOld, tAI)}</tr></tbody></table></div></section>`;
}

/* ---------- Business case ---------- */
/* Cash is what Vodafone pays out, the budget. All costs adds the time of
   Vodafone's and the market teams, at the hourly rate: the full cost. */
let BUD_OPEN = false;
let TIERS_OPEN = false;
function bcFigures(m){
  const Y = m.years, all = S.view === "all";
  const L = k => m.lines.find(l => l.key === k) || {old: 0, ai: 0};
  const sum = (keys, v) => keys.reduce((t, k) => t + L(k)[v], 0);
  const custom = m.lines.filter(l => l.custom);
  const outKeys = ["agency", "other", ...custom.map(l => l.key)], amyKeys = ["dfy", "self", "platform"];
  const rows = [
    {key: "agency", label: "Agency and outside spend", cls: "k-agency", old: sum(outKeys, "old") * Y, ai: sum(outKeys, "ai") * Y,
      hover: "Agency fees, stock and other outside costs"},
    {key: "amy", label: "Amy and platform", cls: "k-dfy", old: 0, ai: sum(amyKeys, "ai") * Y,
      hover: `Amy self-service ${big(L("self").ai * Y)}, Amy managed ${big(L("dfy").ai * Y)}, platform ${big(L("platform").ai * Y)}`},
    {key: "setup", label: "Setup, one-off", cls: "k-oneoff", old: 0, ai: m.oneOff, hover: m.oneOffLines.map(l => `${l.label} ${big(l.ai)}`).join(", ")}
  ];
  if (all) rows.push(
    {key: "central", label: "Vodafone team time", cls: "k-team", old: L("central").old * Y, ai: L("central").ai * Y, hover: `${n0(m.hours.central.old)} → ${n0(m.hours.central.ai)} hours a year`},
    {key: "market", label: "Market team time", cls: "k-market", old: L("market").old * Y, ai: L("market").ai * Y, hover: `${n0(m.hours.market.old)} → ${n0(m.hours.market.ai)} hours a year`});
  const old = rows.reduce((t, r) => t + r.old, 0), ai = rows.reduce((t, r) => t + r.ai, 0), saving = old - ai;
  const spend = rows[1].ai + rows[2].ai;                 // what the change costs: Amy and the setup
  const monthly = (old - ai + m.oneOff) / Y / 12;        // saving a month, before the one-off
  return {Y, all, rows, old, ai, saving, pct: old ? saving / old : 0,
    roi: spend ? (saving + spend) / spend : 0, payback: monthly > 0 ? m.oneOff / monthly : null};
}

/* the waterfall: from the old way to the way with AI, step by step */
function waterfall(F){
  const steps = [{label: "Old way", v: F.old, total: true}];
  for (const r of F.rows) { const d = r.ai - r.old; if (Math.abs(d) > 1) steps.push({label: r.label, v: d, cls: r.cls, hover: r.hover}); }
  steps.push({label: "With AI", v: F.ai, total: true, ai: true});
  const top = Math.max(F.old, F.ai) * 1.08 || 1, h = v => (v / top * 100).toFixed(2);
  let run = 0;
  const cols = steps.map(s => {
    let lo, hi;
    if (s.total){ lo = 0; hi = s.v; run = s.v; } else { lo = Math.min(run, run + s.v); hi = Math.max(run, run + s.v); run += s.v; }
    const kind = s.total ? (s.ai ? "wf-ai" : "wf-old") : s.v < 0 ? "wf-down" : "wf-up";
    const amt = s.total ? big(s.v) : (s.v < 0 ? "−" : "+") + big(Math.abs(s.v));
    return `<div class="wcol"><div class="wplot"><b class="${kind}" style="bottom:${h(lo)}%;height:${Math.max(.6, h(hi - lo))}%" data-hover="${esc(s.label)}: ${amt}${s.hover ? ". " + esc(s.hover) : ""}"><em>${amt}</em></b></div><span>${esc(s.label)}</span></div>`;
  }).join("");
  return `<div class="wf2">${cols}</div>
    <div class="legend"><span><i class="wf-old"></i>Old way</span><span><i class="wf-down"></i>Spend removed</span><span><i class="wf-up"></i>Amy and setup</span><span><i class="wf-ai"></i>With AI</span></div>`;
}

/* the treemap: where the FY27 money goes the old way, by kind of work;
   each box says how much of it AI saves */
function treemap(m, F){
  const keys = F.all ? ["agency", "other", "dfy", "self", "central", "market"] : ["agency", "other", "dfy", "self"];
  const K = [["u", "Updates"], ["m", "Market versions"], ["n", "New assets"]].map(([k, l]) => {
    const old = m.assets.reduce((t, x) => t + keys.reduce((s, b) => s + x.unit.old[k][b], 0) * x.planned[k], 0) * F.Y;
    const ai = m.assets.reduce((t, x) => t + keys.reduce((s, b) => s + x.unit.ai[k][b], 0) * x.planned[k], 0) * F.Y;
    return {l, old, ai, pcs: m.assets.reduce((t, x) => t + x.planned[k], 0)};
  }).sort((a, b) => b.old - a.old);
  const tot = K.reduce((t, k) => t + k.old, 0) || 1;
  const box = (k, style, cls) => `<div class="tmb ${cls}" style="${style}" data-hover="${k.l}: ${n0(k.pcs)} a year, ${big(k.old)} the old way, ${big(k.ai)} with AI">
      <b>${k.l}</b><span>${Math.round(k.old / tot * 100)}% · ${big(k.old)}</span><i>${k.old ? Math.round((1 - k.ai / k.old) * 100) : 0}% less with AI</i></div>`;
  const rest = K[1].old + K[2].old || 1;
  return `<div class="tmap"><div class="tmcol" style="flex:${K[0].old / tot}">${box(K[0], "flex:1", "t1")}</div>
    <div class="tmcol" style="flex:${(K[1].old + K[2].old) / tot}">${box(K[1], `flex:${K[1].old / rest}`, "t2")}${box(K[2], `flex:${K[2].old / rest}`, "t3")}</div></div>`;
}

/* people freed, one square a person */
function waffle(m){
  const hy = lever(S, "hoursYear") || 1600;
  const c = Math.max(0, (m.hours.central.old - m.hours.central.ai) / hy), k = Math.max(0, (m.hours.market.old - m.hours.market.ai) / hy);
  const sq = (n, cls) => { let out = ""; for (let i = 0; i < Math.ceil(n - 1e-9); i++){ const f = Math.min(1, n - i); out += `<i class="${cls}" style="--f:${(f * 100).toFixed(0)}%"></i>`; } return out; };
  return {people: c + k, html: `<div class="waffle" data-hover="Vodafone team ${d1(c)}, market teams ${d1(k)} people a year">${sq(c, "k-team")}${sq(k, "k-market")}</div>`};
}

function bcHTML(m){
  const F = bcFigures(m), Y = F.Y, yrs = Y + " year" + (Y > 1 ? "s" : ""), W = waffle(m);
  const pill = (attr, v, cur, l) => `<button class="pill" ${attr}="${v}" aria-pressed="${v === cur}">${l}</button>`;
  const top = `<div class="bctop"><div class="pillrow">${pill("data-view-bc", "cash", F.all ? "all" : "cash", "Cash")}${pill("data-view-bc", "all", F.all ? "all" : "cash", "All costs")}</div>
    <div class="pillrow">${[1, 3, 5].map(y => pill("data-term", String(y), String(Y), y + " year" + (y > 1 ? "s" : ""))).join("")}</div></div>`;
  const tile = (k, tip, v, sub) => `<div class="tile"><div class="k">${k}${tip ? info(tip) : ""}</div><div class="v">${v}</div>${sub ? `<div class="s">${sub}</div>` : ""}</div>`;
  const tiles = `<div class="tiles">
      ${tile(F.all ? "All costs saved" : "Cash saved", F.all ? "allcost" : "saving", `<span data-count="saving${F.all ? "a" : "c"}" data-to="${F.saving}" data-fmt="big">${big(F.saving)}</span>`, `over ${yrs}, ${Math.round(F.pct * 100)}% less`)}
      ${tile("Return", "ret", F.roi ? F.roi.toFixed(1) + "×" : "–", "for each euro on Amy and setup")}
      ${tile("Payback", "pay", F.payback == null ? "–" : F.payback < 1 ? "under a month" : Math.ceil(F.payback) + " months", "for the one-off")}
      <div class="tile"><div class="k">People freed${info("freed")}</div><div class="v">${d1(W.people)}</div>${W.html}</div>
    </div>`;

  const lineRow = r => { const d = r.old - r.ai;
    return `<tr class="row"><td><div class="rowcell"><span class="sw ${r.cls}"></span><span data-hover="${esc(r.hover)}">${esc(r.label)}</span></div></td>
      <td class="n">${r.old ? eur(r.old) : "–"}</td><td class="n">${eur(r.ai)}</td><td class="n ${d >= 0 ? "ai" : ""}">${d >= 0 ? eur(d) : neg(d)}</td><td></td></tr>`; };
  const custom = S.bc.lines.map(l => `<tr class="row sub2"><td><div class="rowcell"><span class="sw" style="background:none"></span><input class="cell" data-bc="label" data-bcid="${l.id}" data-k="blc:${l.id}" value="${esc(l.label)}" placeholder="Other cost, e.g. tools"></div></td>
      <td class="n"><input class="num" data-bc="old" data-bcid="${l.id}" data-k="bold${l.id}" inputmode="decimal" value="${val(l.old)}" style="width:90px" aria-label="Old way, a year"></td>
      <td class="n"><input class="num" data-bc="ai" data-bcid="${l.id}" data-k="bai${l.id}" inputmode="decimal" value="${val(l.ai)}" style="width:90px" aria-label="With AI, a year"></td><td class="n"></td>
      <td class="acts"><button class="ic hov" data-del-bc="${l.id}" title="Remove line" aria-label="Remove line">${ic("x")}</button></td></tr>`).join("");
  const table = `<section class="detail"><div class="tabbar"><h3>Where the saving comes from</h3><div class="tools">over ${yrs}</div></div>
    <div class="tscroll"><table><colgroup><col style="width:46%"><col style="width:17%"><col style="width:17%"><col style="width:16%"><col style="width:4%"></colgroup>
      <thead><tr><th>Line</th><th class="n">Old way${info("old")}</th><th class="n">With AI</th><th class="n">Saving</th><th></th></tr></thead>
      <tbody>${F.rows.map(lineRow).join("")}${custom}
        <tr class="add"><td colspan="5"><button class="add-btn" data-add-bc>${ic("plus", 11)} Add a cost</button></td></tr>
        <tr class="tot"><td>${F.all ? "All costs" : "Cash"}</td><td class="n">${eur(F.old)}</td><td class="n">${eur(F.ai)}</td><td class="n ai">${eur(F.saving)}</td><td></td></tr>
      </tbody></table></div></section>`;

  const B = m.budget, yh = B.years.map((_, i) => `<th class="n">Year ${i + 1}</th>`).join("");
  const sw = l => `<span class="sw ${KCLASS[l.key] || "k-other"}"></span>`;
  const bRows = B.lines.map(l => `<tr class="row"><td><div class="rowcell">${sw(l)}${esc(l.label)}</div></td><td class="n">${eur(l.year / 4)}</td>${B.years.map(() => `<td class="n">${eur(l.year)}</td>`).join("")}</tr>`).join("") +
    (B.oneOff ? `<tr class="row"><td><div class="rowcell"><span class="sw k-oneoff"></span>Setup, one-off</div></td><td></td>${B.years.map((_, i) => `<td class="n">${i ? "" : eur(B.oneOff)}</td>`).join("")}</tr>` : "");
  const budget = `<section class="detail"><div class="tabbar"><h3><button class="sectbtn" data-bud aria-expanded="${BUD_OPEN}"><span class="chev">${ic("chev", 12)}</span>Budget with AI, year by year</button>${info("tco")}</h3><div class="tools">cash, trued up quarterly</div></div>
    ${BUD_OPEN ? `<div class="tscroll"><table>
      <thead><tr><th style="width:30%">Cash</th><th class="n">A quarter</th>${yh}</tr></thead>
      <tbody>${bRows}
        <tr class="tot"><td>Budget</td><td class="n">${eur(m.cash.ai / 4)}</td>${B.years.map(v => `<td class="n">${eur(v)}</td>`).join("")}</tr>
        <tr class="tot yr"><td>Old way</td><td class="n">${eur(B.old / 4)}</td>${B.years.map(() => `<td class="n">${eur(B.old)}</td>`).join("")}</tr>
      </tbody></table></div>` : ""}</section>`;

  return `<div class="pgap"></div>
    <div class="answers">
      ${top}
      <section class="hero">${tiles}
        <div class="bcviz">
          <div><div class="bh">${F.all ? "All costs" : "Cash"}, old way to with AI, over ${yrs}</div>${waterfall(F)}</div>
          <div><div class="bh">Where the FY27 money goes, the old way</div>${treemap(m, F)}</div>
        </div>
      </section>
      ${table}
      ${budget}
      ${benefitsHTML(m)}
    </div>`;
}

/* ---------- Other benefits: under the case, never in its totals ---------- */
const BF = {launch: d1, wait: n0, hours: n0, people: v => (Math.round(v * 10) / 10).toLocaleString("en-GB"), pieces: n0};
const WORDS = {launch: ["days faster", "days slower"], wait: ["fewer wait days", "more wait days"], hours: ["hours freed", "more hours"],
  people: ["people freed", "more people"], pieces: ["more", "fewer"]};
function changeText(r){
  const f = BF[r.key], d = r.ai - r.now;
  if (Math.abs(d) < 1e-9) return `<span class="na">no change</span>`;
  const good = r.better === "lower" ? d < 0 : d > 0;
  return `<span style="color:${good ? "var(--save)" : "var(--red)"}">${f(Math.abs(d))} ${WORDS[r.key][good ? 0 : 1]}</span>`;
}
function benefitsHTML(m){
  const B = S.benefits || {lines: [], strategic: []};
  const rows = benefits(S, m).filter(r => r.key !== "hours" && r.key !== "people").map(r => `<tr class="row"><td><span data-hover="${esc(r.how)}">${esc(r.label)}</span></td>
      <td class="n">${BF[r.key](r.now)} <span class="unit" style="font-weight:400">${esc(r.unit)}</span></td>
      <td class="n">${BF[r.key](r.ai)}</td><td class="n">${changeText(r)}</td><td></td></tr>`).join("");
  const own = B.lines.map(l => `<tr class="row">
      <td><div class="rowcell"><input class="cell" data-bf="label" data-bfid="${l.id}" data-k="bfl${l.id}" value="${esc(l.label)}" placeholder="Benefit"></div></td>
      <td class="n"><input class="cell" data-bf="now" data-bfid="${l.id}" data-k="bfn${l.id}" value="${esc(l.now)}" placeholder="today" style="text-align:right;width:110px"></td>
      <td class="n"><input class="cell" data-bf="ai" data-bfid="${l.id}" data-k="bfa${l.id}" value="${esc(l.ai)}" placeholder="with AI" style="text-align:right;width:110px"></td>
      <td class="n"></td>
      <td class="acts"><button class="ic hov" data-del-bf="${l.id}" title="Remove line">${ic("x")}</button></td></tr>`).join("");
  const sv = B.strategic.map(k => `<tr class="row"><td colspan="4"><div class="rowcell">
      <input class="cell" data-sv="${k.id}" data-k="sv${k.id}" value="${esc(k.text)}" placeholder="Strategic benefit"></div></td>
      <td class="acts"><button class="ic hov" data-del-sv="${k.id}" title="Remove line">${ic("x")}</button></td></tr>`).join("");
  return `<section class="detail" id="benefits">
    <div class="tabbar"><h3>Other benefits</h3><div class="tools">not in the totals</div></div>
    <div class="tscroll"><table>
      <thead><tr><th style="width:40%">Benefit</th><th class="n">Today</th><th class="n">With AI</th><th class="n">Change</th><th></th></tr></thead>
      <tbody>${rows}${own}
        <tr class="add"><td colspan="5"><button class="add-btn" data-add-bf>${ic("plus", 11)} Add line</button></td></tr>
        <tr class="sect"><td colspan="5"><span class="sectbtn">Also</span></td></tr>
        ${sv}
        <tr class="add"><td colspan="5"><button class="add-btn" data-add-sv>${ic("plus", 11)} Add line</button></td></tr>
      </tbody></table></div></section>`;
}

/* ===================================================================
   Write-backs
   =================================================================== */
function findStep(id){ for (const a of Object.values(S.assets)){ const s = a.steps.find(x => x.id === id); if (s) return [a, s]; } return []; }
function findLine(id){ for (const g of S.tobe.groups){ const l = g.lines.find(x => x.id === id); if (l) return [g, l]; } return []; }
const numOrNull = v => { const t = String(v).trim(); if (t === "") return null; const n = parseFloat(t.replace(/,/g, "")); return isNaN(n) || n < 0 ? undefined : n; };

/* re-render without losing the caret in the field being typed in */
function soft(el){
  const k = el.dataset.k, pos = el.selectionStart, scroll = window.scrollY;
  render(); save();
  if (!k) return;
  const back = document.querySelector(`[data-k="${CSS.escape(k)}"]`);
  if (back){ back.focus(); try { back.setSelectionRange(pos, pos); } catch(_){} }
  window.scrollTo(0, scroll);
}

/* typing in a tinted cell confirms it */
document.addEventListener("input", e => {
  const t = e.target; if (TAB !== "asis" || !t.dataset || !t.dataset.k || !t.classList.contains("unc")) return;
  const a = S.assets[S.current]; if (!a) return;
  confirmKey(a, t.dataset.k); t.classList.remove("unc");
  const b = t.nextElementSibling; if (b && b.dataset.cfm) b.remove();
  tocfCount(a, uncKeys(a).size); save();
});
document.addEventListener("click", e => {
  const b = e.target.closest("[data-cfm],[data-cfall]"); if (!b) return;
  const a = S.assets[S.current]; if (!a) return;
  if (b.dataset.cfall != null) uncKeys(a).forEach(k => confirmKey(a, k)); else confirmKey(a, b.dataset.cfm);
  const y = scrollY; render(); save(); scrollTo(0, y);
});
document.addEventListener("input", e => {
  const t = e.target;
  if (t.dataset.s){
    const id = t.dataset.stepId || t.closest("[data-step]")?.dataset.step;
    const [, s] = findStep(id); if (!s) return;
    const f = t.dataset.s;
    if (f === "label" || f === "who" || f === "comment"){ s[f] = t.value; save(); return; }
    if (f === "phase"){ s.phase = t.value; soft(t); return; }
    const v = numOrNull(t.value); if (v === undefined) return;
    if (f === "rate") s.rate = v; else s[f] = v ?? 0;
    soft(t); return;
  }
  if (t.dataset.sai){
    /* with AI typed as plain hours and days; kept as the step's AI saving */
    const [, s] = findStep(t.closest("[data-step]")?.dataset.step); if (!s) return;
    const v = numOrNull(t.value); if (v == null) return;
    const hpd = HPD(), h = +s.hours || 0, idle = Math.max(0, (+s.days || 0) - h / hpd), clamp = x => Math.max(0, Math.min(100, x));
    if (t.dataset.sai === "h"){ if (h) s.ai = clamp((1 - v / h) * 100); }
    else s.aiWait = idle ? clamp((1 - (v - aiStep(s).h / hpd) / idle) * 100) : 0;
    save(); return;
  }
  if (t.dataset.tier){
    const [id, k] = t.dataset.tier.split(":"), a = S.assets[id]; if (!a) return;
    a.tiers = ["L1", "L2", "L3"].filter(x => x === k ? t.checked : a.tiers.includes(x));
    const y = scrollY; render(); save(); scrollTo(0, y); return;
  }
  if (t.dataset.plan){
    const [r, k] = t.dataset.plan.split("."), v = numOrNull(t.value); if (v === undefined) return;
    S.plan[r][k] = v ?? 0; soft(t); return;
  }
  if (t.dataset.outf){ const a = S.assets[S.current], o = a && outsOf(a).find(x => x.id === t.dataset.outid); if (!o) return; o[t.dataset.outf] = t.value; syncOut(a); save(); return; }
  if (t.dataset.f){
    const a = S.assets[S.current], f = t.dataset.f;
    if (f === "size"){ a.size = t.value; soft(t); return; }
    a[f] = t.value;
    if (f === "name"){ const n = document.querySelector(`[data-ren-asset="${a.id}"]`); if (n) n.textContent = t.value; }
    if (t.tagName === "INPUT" && f !== "name") t.size = Math.max(8, t.value.length);
    save(); return;
  }
  if (t.dataset.lever){
    const v = numOrNull(t.value); if (v == null) return;
    levLine(t.dataset.lever).value = v; soft(t); return;
  }
  if (t.dataset.tl){
    const [, l] = findLine(t.dataset.line); if (!l) return;
    if (t.dataset.tl === "value"){
      const v = numOrNull(t.value); if (v === undefined || (v == null && l.key !== "templates")) return;
      l.value = v; soft(t); return;   // templates left empty = one per asset Amy makes
    }
    l[t.dataset.tl] = t.value; save(); return;
  }
  if (t.dataset.vol){
    const a = S.assets[t.dataset.assetId], v = numOrNull(t.value); if (!a || v === undefined) return;
    a[t.dataset.vol][t.dataset.i] = v ?? 0; soft(t); return;
  }
  if (t.dataset.runs || t.dataset.runprice){
    const a = S.assets[t.dataset.runs || t.dataset.runprice], v = numOrNull(t.value); if (!a || v === undefined) return;
    a[t.dataset.runs ? "runs" : "runPrice"] = v; soft(t); return;
  }
  if (t.dataset.size){
    const a = S.assets[t.dataset.size]; if (!a) return;
    a.size = t.value; soft(t); return;
  }
  if (t.dataset.route){
    const a = S.assets[t.dataset.route]; if (!a) return;
    a.route = t.value; a.runPrice = null; render(); save(); return;
  }
  if (t.dataset.in){
    const a = S.assets[S.current], it = a && (a.inputs || []).find(x => x.id === t.dataset.inid); if (!it) return;
    if (t.dataset.in !== "days"){ it[t.dataset.in] = t.value; save(); return; }
    const v = numOrNull(t.value); if (v === undefined) return; it.days = v ?? 0; soft(t); return;
  }
  if (t.dataset.bc){
    const l = S.bc.lines.find(x => x.id === t.dataset.bcid); if (!l) return;
    if (t.dataset.bc === "label"){ l.label = t.value; save(); return; }
    const v = numOrNull(t.value); if (v === undefined) return; l[t.dataset.bc] = v ?? 0; soft(t); return;
  }
  if (t.dataset.bf){
    const l = S.benefits.lines.find(x => x.id === t.dataset.bfid); if (!l) return;
    l[t.dataset.bf] = t.value; save(); return;
  }
  if (t.dataset.sv){
    const k = S.benefits.strategic.find(x => x.id === t.dataset.sv); if (!k) return;
    k.text = t.value; save(); return;
  }
  if (t.dataset.svOn){
    const k = S.benefits.strategic.find(x => x.id === t.dataset.svOn); if (!k) return;
    k.on = t.checked; save(); return;
  }
  if (t.dataset.oo){
    const l = S.bc.oneOff.find(x => x.id === t.dataset.ooid); if (!l) return;
    if (t.dataset.oo === "label"){ l.label = t.value; save(); return; }
    const v = numOrNull(t.value); if (v === undefined) return; l.ai = v ?? 0; soft(t); return;
  }
});
/* labels and notes only redraw the sums once the field is left */
document.addEventListener("change", e => { if (e.target.dataset.status){ const a = S.assets[e.target.dataset.status]; if (a){ setStatus(a, e.target.value); render(); save(); } return; } });
document.addEventListener("change", e => { if (e.target.dataset.s || e.target.dataset.sai || e.target.dataset.tl || e.target.dataset.f === "name") { const y = scrollY; render(); scrollTo(0, y); } });

document.addEventListener("click", e => {
  const q = sel => e.target.closest(sel);
  let b;
  if ((b = q("[data-tab]"))){ TAB = b.dataset.tab; render(); scrollTo(0, 0); return; }
  if (!q("#exportWrap")) $("#exportMenu").hidden = true;
  if ((b = q("#exportBtn"))){ const mnu = $("#exportMenu"); mnu.hidden = !mnu.hidden; b.setAttribute("aria-expanded", !mnu.hidden); return; }
  if ((b = q("[data-rail]"))){ RAIL_HIDE = !RAIL_HIDE; try { localStorage.setItem(STORE + "railHidden", RAIL_HIDE ? "1" : "0"); } catch(_){} hideTip(); render(); return; }
  if ((b = q("[data-kit]"))){ S.current = "toolkit"; NOTE.clear(); render(); save(); return; }
  if ((b = q("[data-rsec]"))){ const id = b.dataset.rsec, sec = S.sections.find(x => x.id === id);
    if (railOpen(sec)){ RAIL_SHUT.add(id); RAIL_OPEN.delete(id); } else { RAIL_OPEN.add(id); RAIL_SHUT.delete(id); } render(); return; }
  if ((b = q("[data-ksec]"))){ const id = b.dataset.ksec; KIT_OPEN.has(id) ? KIT_OPEN.delete(id) : KIT_OPEN.add(id); const y = scrollY; render(); scrollTo(0, y); return; }
  if ((b = q("[data-cover]"))){ const a = S.assets[S.current]; if (a){ a.covered = !a.covered; render(); save(); } return; }
  if ((b = q("[data-out-new]"))){ const a = S.assets[S.current], o = a && outsOf(a).find(x => x.id === b.dataset.outNew); if (o){ o.isNew = !o.isNew; render(); save(); } return; }
  if ((b = q("[data-add-out]"))){ const a = S.assets[S.current], o = {id: uid("o"), label: "", format: "", example: "", files: []}; outsOf(a).push(o); syncOut(a); render(); save(); document.querySelector(`[data-k="ol${o.id}"]`)?.focus(); return; }
  if ((b = q("[data-del-out]"))){ snap("Removed an output"); const a = S.assets[S.current]; a.outputs = outsOf(a).filter(x => x.id !== b.dataset.delOut); if (!a.outputs.length) a.outputs = [{id: uid("o"), label: "", format: "", example: "", files: []}]; syncOut(a); render(); save(); return; }
  if ((b = q("[data-add-input]"))){ const a = S.assets[S.current], it = input("", "", 0); (a.inputs = a.inputs || []).push(it); render(); save(); document.querySelector(`[data-k="il${it.id}"]`)?.focus(); return; }
  if ((b = q("[data-del-input]"))){ snap("Removed an input"); const a = S.assets[S.current]; a.inputs = a.inputs.filter(x => x.id !== b.dataset.delInput); render(); save(); return; }
  if ((b = q("[data-view]"))){ VIEW = b.dataset.view; const y = scrollY; render(); scrollTo(0, y); return; }
  if ((b = q("[data-goto]"))){ S.current = b.dataset.goto; TAB = "asis"; render(); save(); scrollTo(0, 0); return; }
  if ((b = q("[data-del-asset]"))){
    const id = b.dataset.delAsset, a = S.assets[id]; snap(`Removed ${a.name}`);
    S.sections.forEach(s => s.assets = s.assets.filter(x => x !== id)); delete S.assets[id];
    if (S.current === id) S.current = S.sections.flatMap(s => s.assets)[0];
    render(); save(); return;
  }
  if ((b = q("[data-del-sec]"))){
    const sec = S.sections.find(s => s.id === b.dataset.delSec); snap(`Removed ${sec.name}`);
    sec.assets.forEach(id => { delete S.assets[id]; });
    S.sections = S.sections.filter(s => s !== sec); render(); save(); return;
  }
  if ((b = q("[data-add-asset]"))){ addAsset(b.dataset.addAsset); return; }
  if ((b = q("[data-new]"))){
    if (b.dataset.new === "asset"){ const sec = S.sections.find(s => s.assets.includes(S.current)) || S.sections.at(-1); addAsset(sec && sec.id); }
    else { const sec = {id: uid("g"), name: "New section", assets: []}; S.sections.push(sec); render(); save(); renameEl(document.querySelector(`[data-ren-sec="${sec.id}"]`)); }
    return;
  }
  if ((b = q("[data-asset]")) && !q("button") && !q("input")){ S.current = b.dataset.asset; NOTE.clear(); render(); save(); return; }
  if ((b = q("[data-add-step]"))){
    const a = S.assets[S.current], mk = b.dataset.addStep === "market";
    const s = step("", mk ? "Market" : "", 0, 0, mk ? {phase: "market"} : {phase: "create"}); a.steps.push(s); render(); save();
    document.querySelector(`[data-k="l${s.id}"]`)?.focus(); return;
  }
  if ((b = q("[data-template]"))){
    const a = S.assets[S.current];
    a.steps = [step("Inputs", "", 0, 3), step("Brief", "PMM", 2, 0), step("Draft", "", 6, 2), step("Review", "Product", 2, 3), step("Approval", "Brand, Legal", 1, 3), step("Market version", "Market", 3, 3)];
    render(); save(); return;
  }
  if ((b = q("[data-del-step]"))){ snap("Removed a line"); const a = S.assets[S.current]; a.steps = a.steps.filter(s => s.id !== b.dataset.delStep); NOTE.delete(b.dataset.delStep); render(); save(); return; }
  if ((b = q("[data-par]"))){ const [, s] = findStep(b.dataset.par); s.parallel = !s.parallel; render(); save(); return; }
  if ((b = q("[data-note]"))){ const id = b.dataset.note; NOTE.has(id) ? NOTE.delete(id) : NOTE.add(id); const y = scrollY; render(); scrollTo(0, y); document.querySelector(`[data-k="c${id}"],[data-k="tc${id}"]`)?.focus({preventScroll: true}); return; }
  if ((b = q("[data-attach]"))){ ATTACH = b.dataset.attach; $("#attach").value = ""; $("#attach").click(); return; }
  if ((b = q("[data-sect]"))){ const id = b.dataset.sect; SHUT.has(id) ? SHUT.delete(id) : SHUT.add(id); render(); return; }
  if ((b = q("[data-phase]"))){ const [, st] = findStep(b.dataset.phase); st.phase = NEXT_PHASE[st.phase || "create"]; render(); save(); return; }
  if (q("#exportMenu button")) $("#exportMenu").hidden = true;
  if (q("#pdf")){ hideTip(); window.print(); return; }
  if ((b = q("#undo"))){ if (UNDO){ S = JSON.parse(UNDO); UNDO = null; toast(); render(); save(); } return; }
  if ((b = q("[data-grp]"))){ const id = b.dataset.grp; SHUT.has(id) ? SHUT.delete(id) : SHUT.add(id); render(); return; }
  if ((b = q("[data-add-line]"))){
    const g = S.tobe.groups.find(x => x.id === b.dataset.addLine); const l = {id: uid("l"), label: "", value: 0, unit: "", key: null, comment: ""};
    g.lines.push(l); render(); save(); document.querySelector(`[data-k="tl${l.id}"]`)?.focus(); return;
  }
  if ((b = q("[data-del-line]"))){ snap("Removed a line"); S.tobe.groups.forEach(g => g.lines = g.lines.filter(l => l.id !== b.dataset.delLine)); render(); save(); return; }
  if ((b = q("[data-view-bc]"))){ S.view = b.dataset.viewBc; render(); save(); return; }
  if ((b = q("[data-tiers]"))){ TIERS_OPEN = !TIERS_OPEN; const y = scrollY; render(); scrollTo(0, y); return; }
  if ((b = q("[data-bud]"))){ BUD_OPEN = !BUD_OPEN; const y = scrollY; render(); scrollTo(0, y); return; }
  if ((b = q("[data-term]"))){ S.term = +b.dataset.term; render(); save(); return; }
  if ((b = q("[data-add-bc]"))){ const l = {id: uid("c"), label: "", today: 0, old: 0, ai: 0, comment: ""}; S.bc.lines.push(l); render(); save(); document.querySelector(`[data-k="blc:${l.id}"]`)?.focus(); return; }
  if ((b = q("[data-del-bc]"))){ snap("Removed a line"); S.bc.lines = S.bc.lines.filter(l => l.id !== b.dataset.delBc); render(); save(); return; }
  if ((b = q("[data-add-bf]"))){ const l = {id: uid("b"), label: "", now: "", ai: "", how: ""}; S.benefits.lines.push(l); render(); save(); document.querySelector(`[data-k="bfl${l.id}"]`)?.focus(); return; }
  if ((b = q("[data-del-bf]"))){ snap("Removed a line"); S.benefits.lines = S.benefits.lines.filter(l => l.id !== b.dataset.delBf); render(); save(); return; }
  if ((b = q("[data-add-sv]"))){ const k = {id: uid("k"), text: "", on: true}; S.benefits.strategic.push(k); render(); save(); document.querySelector(`[data-k="sv${k.id}"]`)?.focus(); return; }
  if ((b = q("[data-del-sv]"))){ snap("Removed a line"); S.benefits.strategic = S.benefits.strategic.filter(k => k.id !== b.dataset.delSv); render(); save(); return; }
  if ((b = q("[data-add-oo]"))){ const l = {id: uid("o"), label: "", ai: 0}; S.bc.oneOff.push(l); render(); save(); document.querySelector(`[data-k="olo:${l.id}"]`)?.focus(); return; }
  if ((b = q("[data-del-oo]"))){ snap("Removed a line"); S.bc.oneOff = S.bc.oneOff.filter(l => l.id !== b.dataset.delOo); render(); save(); return; }
  if (q("#save")){ download(`${S.client.id}-business-case.json`, JSON.stringify(S, null, 1), "application/json"); return; }
  if (q("#open")){ $("#openFile").click(); return; }
  if (q("#share")){ fetch("api/share").then(r => r.json()).then(j => navigator.clipboard.writeText(j.url).then(() => toast("Link copied: anyone with it can open the tool"))).catch(() => toast("Could not copy. Copy the address from the browser bar instead.")); return; }
  if (q("#xls")){ exportExcel(); return; }
});

let UNDO = null, toastT;
function snap(msg){ UNDO = JSON.stringify(S); toast(msg); }
function toast(msg){
  clearTimeout(toastT); const el = $("#toast");
  if (!msg){ el.classList.remove("on"); return; }
  $("#toastMsg").textContent = msg; el.classList.add("on");
  toastT = setTimeout(() => { el.classList.remove("on"); UNDO = null; }, 6000);
}

/* tooltip: hover or focus, clamped to the window */
const tipEl = $("#tip"); let tipOwner = null, tipT;
function showTip(btn){
  const d = TIPS[btn.dataset.tip]; if (!d) return;
  tipEl.innerHTML = `<h4>${d.t}</h4><p>${d.what}</p>${d.how ? `<code>${esc(d.how)}</code>` : ""}`;
  tipEl.classList.add("on");
  const r = btn.getBoundingClientRect(), h = tipEl.offsetHeight, w = tipEl.offsetWidth;
  const top = r.bottom + h + 10 > innerHeight ? r.top - h - 8 : r.bottom + 8;
  tipEl.style.left = Math.max(12, Math.min(r.left - 8, innerWidth - w - 12)) + "px";
  tipEl.style.top = Math.max(12, top) + "px"; tipOwner = btn;
}
const hideTip = () => { tipEl.classList.remove("on"); tipOwner = null; };
document.addEventListener("pointerover", e => {
  const h = e.target.closest("[data-hover]");
  if (h && !BAR){ clearTimeout(tipT); tipEl.innerHTML = `<p>${esc(h.dataset.hover)}</p>`; tipEl.classList.add("on");
    const r = h.getBoundingClientRect(); tipEl.style.left = Math.max(12, Math.min(r.left, innerWidth - tipEl.offsetWidth - 12)) + "px"; tipEl.style.top = (r.bottom + 6) + "px"; return; }
  const b = e.target.closest(".info"); if (b){ clearTimeout(tipT); showTip(b); } else if (e.target.closest("#tip")) clearTimeout(tipT); });
document.addEventListener("pointerout", e => { if (e.target.closest("[data-hover]")){ clearTimeout(tipT); tipT = setTimeout(hideTip, 120); } });
document.addEventListener("pointerout", e => { if (e.target.closest(".info,#tip")){ clearTimeout(tipT); tipT = setTimeout(hideTip, 220); } });
document.addEventListener("focusin", e => { const b = e.target.closest(".info"); if (b) showTip(b); });
addEventListener("scroll", hideTip, {passive: true});

function addAsset(secId){
  let sec = S.sections.find(s => s.id === secId);
  if (!sec){ sec = {id: uid("g"), name: "New section", assets: []}; S.sections.push(sec); }
  const a = asset("New asset", {today: 0, want: 0}); S.assets[a.id] = a; sec.assets.push(a.id); S.current = a.id; render(); save();
  const t = document.querySelector('[data-k="title"]'); if (t){ t.focus(); t.select(); }
}

/* ---------- rename in the list: double-click ---------- */
function renameEl(nm){
  if (!nm) return;
  const isSec = !!nm.dataset.renSec, id = nm.dataset.renSec || nm.dataset.renAsset;
  const obj = isSec ? S.sections.find(s => s.id === id) : S.assets[id];
  const inp = document.createElement("input"); inp.className = "edit"; inp.value = obj.name;
  nm.replaceWith(inp); inp.focus(); inp.select();
  const done = keep => { if (keep && inp.value.trim()) obj.name = inp.value.trim(); render(); save(); };
  inp.addEventListener("keydown", e => { if (e.key === "Enter") done(true); if (e.key === "Escape") done(false); });
  inp.addEventListener("blur", () => done(true), {once: true});
}
document.addEventListener("dblclick", e => { const nm = e.target.closest("[data-ren-sec],[data-ren-asset]"); if (nm) renameEl(nm); });

/* ---------- drag assets between sections, and steps within an asset ---------- */
let DRAG = null;
document.addEventListener("dragstart", e => {
  const it = e.target.closest?.("[data-asset]"); const st = e.target.closest?.("[data-drag-step]");
  if (st){ DRAG = {kind: "step", id: st.dataset.dragStep}; e.dataTransfer.effectAllowed = "move"; return; }
  if (it){ DRAG = {kind: "asset", id: it.dataset.asset}; e.dataTransfer.effectAllowed = "move"; }
});
document.addEventListener("dragover", e => {
  if (!DRAG) return;
  const tgt = DRAG.kind === "asset" ? e.target.closest("[data-asset],[data-sec]") : e.target.closest("[data-step]");
  document.querySelectorAll(".drop-over").forEach(x => x.classList.remove("drop-over"));
  if (tgt){ e.preventDefault(); tgt.classList.add("drop-over"); }
});
document.addEventListener("drop", e => {
  if (!DRAG) return; e.preventDefault();
  if (DRAG.kind === "asset"){
    const tgt = e.target.closest("[data-asset],[data-sec]"); if (!tgt) return;
    S.sections.forEach(s => s.assets = s.assets.filter(x => x !== DRAG.id));
    if (tgt.dataset.sec){ S.sections.find(s => s.id === tgt.dataset.sec).assets.unshift(DRAG.id); }
    else { const sec = S.sections.find(s => s.assets.includes(tgt.dataset.asset)); sec.assets.splice(sec.assets.indexOf(tgt.dataset.asset), 0, DRAG.id); }
  } else {
    const tgt = e.target.closest("[data-step]"); if (!tgt) return;
    const a = S.assets[S.current], from = a.steps.findIndex(s => s.id === DRAG.id);
    const [mv] = a.steps.splice(from, 1); a.steps.splice(a.steps.findIndex(s => s.id === tgt.dataset.step), 0, mv);
  }
  DRAG = null; render(); save();
});
document.addEventListener("dragend", () => { DRAG = null; document.querySelectorAll(".drop-over").forEach(x => x.classList.remove("drop-over")); });

/* ---------- drag a bar on the timeline to change the wait ---------- */
let BAR = null;
document.addEventListener("pointerdown", e => {
  const g = e.target.closest("[data-grab]"); if (!g) return;
  const [, s] = findStep(g.dataset.grab); const tr = g.parentElement.getBoundingClientRect();
  BAR = {s, x0: e.clientX, w0: +s.days || 0, w: tr.width, scale: GSCALE};
  e.preventDefault();
});
document.addEventListener("pointermove", e => {
  if (!BAR) return;
  const nw = Math.max(0, Math.round((BAR.w0 + (e.clientX - BAR.x0) / BAR.w * BAR.scale) * 2) / 2);
  if (nw !== BAR.s.days){ BAR.s.days = nw; const y = scrollY; render(); scrollTo(0, y); }
});
document.addEventListener("pointerup", () => { if (BAR){ BAR = null; save(); } });

/* ---------- attachments: names are kept with the line ---------- */
let ATTACH = null;
$("#attach").addEventListener("change", e => {
  const [, s0] = findStep(ATTACH), pool = Object.values(S.assets).flatMap(a => [...(a.inputs || []), ...(Array.isArray(a.outputs) ? a.outputs.filter(o => typeof o === "object") : [])]);
  const s = s0 || pool.find(i => i.id === ATTACH); if (!s) return;
  const files = [...e.target.files];
  const done = list => { s.files = (s.files || []).concat(list); NOTE.add(s.id); render(); save(); };
  if (!SHARED){ done(files.map(f => ({name: f.name, size: f.size}))); return; }
  /* hosted: the file is stored on the app's disk and opens from the link */
  Promise.all(files.map(f => fetch("api/upload?name=" + encodeURIComponent(f.name), {method: "POST", body: f}).then(r => r.json()).then(j => ({name: f.name, size: f.size, url: j.url}))))
    .then(done).catch(() => { $("#saved").textContent = "Upload failed. Try again."; });
});

/* ---------- open, save, Excel ---------- */
$("#openFile").addEventListener("change", e => {
  const f = e.target.files[0]; if (!f) return;
  f.text().then(t => { try { S = JSON.parse(t); render(); save(); } catch(_){ alert("That file is not a saved business case."); } });
});
function download(name, text, type){
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], {type})); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
function exportExcel(){
  const m = compute(S), x = v => String(v ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  const cell = v => typeof v === "number" ? `<Cell><Data ss:Type="Number">${Math.round(v * 100) / 100}</Data></Cell>` : `<Cell><Data ss:Type="String">${x(v)}</Data></Cell>`;
  const sheet = (name, rows) => `<Worksheet ss:Name="${x(name)}"><Table>${rows.map(r => `<Row>${r.map(cell).join("")}</Row>`).join("")}</Table></Worksheet>`;
  const Y = m.years;
  const ln = (l, cash) => [l.label, l.today, l.old, l.ai, l.old - l.ai, (l.old - l.ai) * Y];
  const bc = [[S.client.name + " · " + S.client.project, "Joint business case"], [],
    ["Over " + Y + " years", "Cash today", "Cash, plan old way", "Cash, plan with AI", "Cash saved", "Team time freed", "Return (x)", "Payback (months)"],
    ["", m.cashTerm.today, m.cashTerm.old, m.cashTerm.ai, m.saving, m.timeSaving, +m.roi.toFixed(2), m.payback == null ? "" : +m.payback.toFixed(1)], [],
    ["Cash", "Today a year", "Plan, old way a year", "Plan, with AI a year", "Saving a year", "Over " + Y + " years"],
    ...m.lines.filter(l => l.cash).map(ln), ["Cash a year", m.cash.today, m.cash.old, m.cash.ai, m.cash.old - m.cash.ai, (m.cash.old - m.cash.ai) * Y], [],
    ["One-off, year one", "", "", "With AI"], ...m.oneOffLines.map(l => [l.label, "", "", l.ai]), [],
    ["Team time", "Today a year", "Plan, old way a year", "Plan, with AI a year", "Saving a year", "Over " + Y + " years"],
    ...m.lines.filter(l => !l.cash).map(ln), ["Team time a year", m.time.today, m.time.old, m.time.ai, m.time.old - m.time.ai, (m.time.old - m.time.ai) * Y],
    ["Vodafone team hours", m.hours.central.today, m.hours.central.old, m.hours.central.ai],
    ["Market team hours", m.hours.market.today, m.hours.market.old, m.hours.market.ai]];
  const tco = [["Budget with AI", "Amy is charged on use: an estimate, trued up each quarter"], [],
    ["Cash line", "A quarter", ...m.budget.years.map((_, i) => "Year " + (i + 1)), "Over " + Y + " years"],
    ...m.budget.lines.map(l => [l.label, l.year / 4, ...m.budget.years.map(() => l.year), l.year * Y]),
    ["One-off", "", ...m.budget.years.map((_, i) => i ? "" : m.budget.oneOff), m.budget.oneOff],
    ["Budget", m.cash.ai / 4, ...m.budget.years, m.cashTerm.ai],
    ["The same plan, the old way", m.budget.old / 4, ...m.budget.years.map(() => m.budget.old), m.cashTerm.old]];
  const bens = [["Other benefits, not counted in the business case"], [], ["Benefit", "Today", "With AI", "Unit", "How it is worked out"],
    ...benefits(S, m).map(r => [r.label, +r.now.toFixed(1), +r.ai.toFixed(1), r.unit, r.how]),
    ...(S.benefits?.lines || []).map(l => [l.label, l.now, l.ai, "", l.how]), [], ["Strategic value", "Applies"],
    ...(S.benefits?.strategic || []).map(k => [k.text, k.on ? "yes" : "no"])];
  const tb = [["Group", "Assumption", "Value", "Unit", "Notes"], ...S.tobe.groups.flatMap(g => g.lines.map(l => [g.name, l.label, +l.value || 0, l.unit, l.comment]))];
  const per = [["Section", "Asset", "Size", "With AI, made by", "Today new", "Today updates", "Today market", "Plan new", "Plan updates", "Plan market",
      "Amy per asset", "Cost one new, today", "Cost one new, with AI", "Old way a year", "With AI a year", "Days today", "Days with AI"],
    ...m.assets.map(a => [a.section, a.name, SIZES[S.assets[a.id].size] || "", a.route.label, a.today.n, a.today.u, a.today.m, a.planned.n, a.planned.u, a.planned.m,
      a.runs * a.runPrice, money(a.unit.old.n), money(a.unit.ai.n), money(a.year.old), money(a.year.ai), a.sched.old.elapsed, a.sched.ai.elapsed])];
  const PH = {create: "Creation", approve: "Approvals", market: "Adaptation"};
  const map = [["Section", "Asset", "Kind", "Step or input", "Who or from", "Phase", "Hours", "Rate", "Fee", "Days", "AI saves work %", "AI saves idle %", "Alongside step above", "Cost", "Notes or example", "Files"]];
  for (const sec of S.sections) for (const id of sec.assets){
    const a = S.assets[id];
    (a.inputs || []).forEach(it => map.push([sec.name, a.name, "Input", it.label, it.from, "", "", "", "", +it.days || 0, "", "", "", "", it.example, ""]));
    a.steps.forEach(s => map.push([sec.name, a.name, "Step", s.label, s.who, PH[s.phase] || "Creation", +s.hours || 0, +s.fee > 0 ? "fee" : (s.rate ?? ""), +s.fee || 0, +s.days || 0,
      +s.ai || 0, +s.aiWait || 0, s.parallel ? "yes" : "", stepCost(S, s), s.comment, (s.files || []).map(f => f.name).join(", ")]));
    if (a.output) map.push([sec.name, a.name, "Output", a.output]);
    if (a.nuances) map.push([sec.name, a.name, "Nuances", a.nuances]);
  }
  const xml = `<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">` +
    sheet("Business case", bc) + sheet("Budget with AI", tco) + sheet("Other benefits", bens) + sheet("To-be", tb) + sheet("Per asset", per) + sheet("As-is map", map) + `</Workbook>`;
  download(`${S.client.id}-business-case.xls`, xml, "application/vnd.ms-excel");
}

render();
window.__bc = {S: () => S, compute, render};

if (SHARED){ pullState(); setInterval(pullState, 15000); }

if (cleanState(S) | applyBatch1(S) | applyBatch2(S) | applyBatch3(S) | applyBatch4(S) | applyBatch5(S)){ save(); render(); }
