/* Discussion page: one card per asset, filled live in the meeting.
   Kept apart from the business case model: answers live in D, saved to
   the server (/api/discuss) when the tool is hosted, and to this browser
   as a backup. Empty fields show a red outline so gaps are visible. */

const DSTORE = STORE + "discuss";
const ONLINE = location.protocol.startsWith("http");
let D = {}, DCUR = null, DWHO = "";
try { D = JSON.parse(localStorage.getItem(DSTORE) || "{}"); } catch(_){}
try { DWHO = localStorage.getItem(DSTORE + ":who") || ""; } catch(_){}

/* the fields asked on every asset, in the order they are discussed */
const DF = [
  {k: "made", l: "Who makes it today", t: "pick", o: ["In-house", "External", "Not done"]},
  {k: "maker", l: "Team or agency", t: "line", ph: "e.g. Portfolio marketing, agency name"},
  {k: "what", l: "What is it", t: "text", ph: "One or two lines: what it is and who it is for"},
  {k: "how", l: "How it is produced", t: "text", ph: "The steps, in order"},
  {k: "inputs", l: "Inputs, and from whom", t: "text", ph: "e.g. One Brief from Product, analyst reports"},
  {k: "format", l: "Output format and length", t: "line", ph: "e.g. PowerPoint, 1 page"},
  {k: "template", l: "Template", t: "pick", o: ["Yes", "Partly", "No"]},
  {k: "brief", l: "Briefing (hours)", t: "num"},
  {k: "make", l: "Making it (hours)", t: "num"},
  {k: "review", l: "Review time (hours)", t: "num"},
  {k: "wait", l: "Start to finish (days)", t: "num"},
  {k: "cost", l: "External cost (€): new, update, market version", t: "line", ph: "e.g. 403 / 201 / 184"},
  {k: "mv", l: "Market versions", t: "line", ph: "How many markets adapt it, e.g. 1 to 3 of 10"},
  {k: "upd", l: "Updates", t: "line", ph: "How often it is refreshed, e.g. every 6 months"},
  {k: "var", l: "Variants", t: "line", ph: "e.g. per ICP group, per segment, sizes"},
  {k: "approvers", l: "Approvers", t: "line", ph: "e.g. Cluster lead, Brand, Legal"},
  {k: "approval", l: "Approval", t: "pick", o: ["Must approve", "Alignment only"]},
  {k: "notes", l: "Notes", t: "text", ph: "Anything else said", opt: true}
];
const DREQ = DF.filter(f => !f.opt);

/* the asset list is the app's own (S.sections), so both pages always match;
   parts of a block (a.parent) sit indented under it. AEO templates are left out. */
const DSKIP = /AEO/;
const PHNOTE = {"Market and customer research": "One research pack, approved by the cluster lead at the end"};
const PH = () => S.sections.filter(sec => !DSKIP.test(sec.name)).map(sec => ({id: sec.id, name: sec.name, note: PHNOTE[sec.name]}));

/* what was said on 2 Nov, so the cards open with it (Granola summary of the call) */
const SEED = {
  "One Brief": {made: "In-house", maker: "Product, with the portfolio lead", what: "Word document handed from the product team to portfolio marketing: what the product is, who it is for, why it exists, commercial approval summary", make: 5, template: "Yes"},
  "One-page summary": {made: "In-house", what: "Short version of the One Brief at the front of the toolkit", how: "Cut and paste from the One Brief", inputs: "One Brief", make: 2, template: "Yes"},
  "Product spotlight": {made: "In-house", what: "What the product is and its features, for market-facing teams", inputs: "One Brief, technical documents from Product (sometimes from the partner, e.g. RingCentral)", make: 3, template: "No"},
  "Market trends": {made: "In-house", inputs: "Desk research (UC Today, Spiceworks, Cavell), analyst reports (Gartner, IDC, Omdia, Forrester), primary research, business and product strategy decks, Vodafone Insights Centre reports (downloaded by hand)", make: 20, notes: "Market nuances, e.g. UK vs Germany on cloud adoption. Sources differ by portfolio."},
  "Customer research": {inputs: "Agency surveys, government data (e.g. UK Office for National Statistics), desk research, market data, analyst insight, sales input. Debrief recordings and transcripts.", notes: "Agency fee for primary research is left out of the business case; PMM time to sum it up is in."},
  "Ideal customer profile": {made: "In-house", make: 7, template: "Yes", approvers: "Cluster lead", approval: "Must approve"},
  "Market opportunity and vertical matrix": {made: "In-house", inputs: "Government data, market sizing", make: 6, approvers: "Cluster lead"},
  "Buying group and personas": {what: "Who is in the buying group, the decision-making unit, the roles involved. A separate section of the toolkit.", approvers: "Cluster lead"},
  "Meet the Customer videos": {made: "In-house", maker: "Portfolio marketing, in Synthesia", what: "Role videos, 3 per market", how: "Script (1 hour), build and tweak (2 hours)", make: 3, approvers: "Cluster lead"},
  "Research summaries": {made: "In-house", make: 3, notes: "Per market", approvers: "Cluster lead"},
  "Buyer journey and discovery questions": {made: "Not done", notes: "Underdeveloped today; AI can make it"},
  "Product naming guide": {made: "In-house", format: "PowerPoint, 1 page", make: 6, wait: 60, inputs: "Competitor names, Vodafone taxonomy, partner naming rules (Microsoft, Cisco), AI usage guidelines", approvers: "Brand, Legal, Compliance, Sustainability, Markets (VPC for partner-named products)", approval: "Must approve", notes: "12 days to 12 weeks start to finish"},
  "Positioning statement": {made: "In-house", format: "1 page", template: "Yes", make: 3, how: "Built as the research comes in"},
  "Messaging house": {made: "In-house", make: 15, approvers: "Product (group and local), local GTM and propositions, cluster lead", approval: "Must approve", notes: "Much of the time is back and forth with stakeholders"},
  "Copy kit": {made: "In-house", what: "The copy library under the messaging house", inputs: "Messaging house", make: 3.5},
  "SEO keywords": {notes: "Not data-led today; no group-level tools"},
  "Segment messaging": {made: "Not done"},
  "Battlecard": {made: "In-house", what: "One overarching card per market", template: "Yes", notes: "Refreshed at least every 6 months for strategic products, or on a big competitor change"},
  "Portfolio marketing toolkit": {made: "In-house", format: "PowerPoint to PDF, with bookmarks and links", make: 8},
  "Marketing Hub page": {made: "In-house", how: "Write the copy into the agreed template", make: 2, template: "Yes"},
  "PRM content (Impartner)": {maker: "Vanessa's team", what: "Partner-facing how-to guides, updated and translated per market", notes: "To be scoped separately"},
  "Viva Engage and market comms email": {notes: "Parked: inputs not defined yet"}
};

/* what Mohit typed into the tool during the call (read back from screen captures) */
const TYPED = {
  "One Brief": {notes: "5 hours to align with product. Things are squared off before research starts."},
  "Market opportunity and vertical matrix": {inputs: "Customer research, market trends, government data, market sizing", make: 6, how: "Research, then create"},
  "Ideal customer profile": {format: "The ICP template Vodafone has"},
  "Buying group and personas": {how: "Customer research synthesis: roles, their questions, which groups and personas"},
  "One-page summary": {format: "One page, with use cases", notes: "Simple 1 page as a template: what it is, who it is for"},
  "Market trends": {format: "Report, 5 to 6 pages", approvers: "Cluster senior managers (Sarah)", inputs: "Analyst reports (Gartner, IDC, Forrester, by topic; licences separate) from PMM. Social listening (what people talk about today). Desk research (Google, usual sources per portfolio). Primary research (research team surveys existing and prospect customers). Business strategy for the business line (Group Strategy). Product strategy (Product).", notes: "With AI: deep research and synthesis, sources and competitors created for it; analyse competitors."},
  "Customer research": {inputs: "Primary research (different from market trends) from the research agency. Government databases: numbers, employees, firmographics. Internet search. Agency debrief in the market: recording, Excel and PowerPoint.", approvers: "Cluster senior managers (Sarah)", approval: "Must approve", notes: "Synthesis only, no research agency fee in the case. Update what exists, market by market. Check against capabilities: what is commercially viable. Brand is not involved here; they come in at the messaging house."},
  "Positioning statement": {inputs: "Everything from the One Brief and research phases"},
  "Copy kit": {format: "3 elevator pitches, product boilerplate, feature blocks (short and long copy each), social posts, SEO keywords (GEO later), useful stats", make: 4, notes: "4 hours per copy kit. Useful stats sit here."},
  "Segment messaging": {notes: "Messaging house and copy kit for each ICP. Additional to what is done today."},
  "SEO keywords": {notes: "SEO not enough today: no tools, no volumes. Draw from Search Console, related words, long-tail searches. AEO and GEO: audit visibility and flag where they are not performing. Business case: like-for-like effort, plus extra capability."},
  "Battlecard": {format: "Why we win, comparisons, objection handling and qualifying questions", notes: "Ideal: a variant per market (1 template), and per cohort. Every 6 months for strategic products."},
  "Portfolio marketing toolkit": {format: "PowerPoint to a set template, then PDF. Strategic and tactical, 100+ pages."},
  "Marketing Hub page": {how: "Writing a page per portfolio or product; copy dropped into the page"},
  "Product factsheet": {format: "Factsheet, 2 pages, PDF", inputs: "Copy kit, product features (from the One Brief)", how: "PMM sends copy; designed externally; reopen and edit the template, which is created and locked", notes: "Not very templated. Chance to update with brand and sustainability teams."},
  "Product brochure": {format: "Brochure, 2 or 4 pages, PDF", inputs: "Product specs from Product, approved images from Brand"}
};
for (const [k, v] of Object.entries(TYPED)) SEED[k] = {...(SEED[k] || {}), ...v};
const RENAME = {"Ideal customer profile": "Ideal customer profiles", "Market opportunity and vertical matrix": "Market Opportunity", "Meet the Customer videos": "Meet the customer",
  "Product naming guide": "Product name", "Positioning statement": "Positioning Statement", "Messaging house": "Messaging House"};
for (const [from, to] of Object.entries(RENAME)) if (SEED[from]){ SEED[to] = {...SEED[from], ...(SEED[to] || {})}; delete SEED[from]; }

/* Digital Apple's FY27 rate card for Vodafone (DA_FY27_Quote.xlsx, standard rate, £ at 1.15):
   new / update / market version, in euros */
const RATE = {"Pitch deck": "4,025 / 2,013 / 1,380", "Product catalogue pages": "460 / 230 / 184", "Product brochure": "805 / 403 / 368",
  "Product factsheet": "403 / 201 / 184", "Customer FAQ": "604 / 302 / 276", "Explainer video": "4,382 / 2,191 / 690", "Social pack": "690 / 345 / 345",
  "Infographic": "604 / 302", "Blog or article": "1,035", "eBook": "4,025", "Recorded webinar": "2,070", "Excite video": "4,382 / 2,191 / 690",
  "Interactive product tour": "11,500", "Interactive demo video": "17,250", "Decision and ROI tool": "20,125", "Portfolio catalogue": "4,025",
  "Interactive use cases": "20,125", "Use case videos": "20,125", "Security and compliance pack": "403"};
/* first guesses, from the factsheet we know: shown as estimates until someone confirms them */
const EST = {};
const FACT = {brief: 1, review: 1, wait: 13, approvers: "Product, Brand, Legal", approval: "Must approve"};
function dEst(name){
  if (EST[name]) return EST[name];
  const e = {...FACT};
  if (RATE[name]) Object.assign(e, {made: "External", maker: "Digital Apple", cost: RATE[name], template: "Yes"});
  return EST[name] = e;
}

const dkey = name => name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
function dAll(){
  const out = [];
  for (const sec of S.sections) if (!DSKIP.test(sec.name)) for (const id of sec.assets){
    const a = S.assets[id]; if (!a) continue;
    out.push({name: a.name, phase: sec.id, depth: a.parent ? 1 : 0, parent: a.parent ? (S.assets[a.parent] || {}).name : "", ai: a.later});
  }
  for (const [name, r] of Object.entries(D)) if (r && r._added && !out.some(x => x.name === name)) out.push({name, phase: r._added, depth: 0, added: true});
  return out;
}
const dval = (name, k) => { const r = D[name]; if (r && k in r) return r[k]; const s = SEED[name]; if (s && k in s) return s[k]; const e = dEst(name); return k in e ? e[k] : ""; };
const disEst = (name, k) => { const r = D[name]; if (r && k in r) return false; const s = SEED[name]; if (s && k in s) return false; return k in dEst(name); };
const dgap = (name, f) => { const v = dval(name, f.k); return v === "" || v == null; };
const dcount = name => DREQ.filter(f => !dgap(name, f)).length;
const dfiles = name => (D[name] && D[name]._files) || [];

function discussHTML(){
  const all = dAll(); if (!DCUR || !all.some(a => a.name === DCUR)) DCUR = all[0].name;
  const rail = PH().map(p => {
    const rows = all.filter(a => a.phase === p.id).map(a => {
      const n = dcount(a.name), done = n === DREQ.length;
      return `<button class="drow d${a.depth}${a.name === DCUR ? " on" : ""}" data-dpick="${esc(a.name)}"><span>${esc(a.name)}${a.ai ? ' <em class="dai">with AI</em>' : ""}</span><span class="dn${done ? " ok" : ""}">${n}/${DREQ.length}</span></button>`;
    }).join("");
    return `<div class="dph"><div class="dphh">${esc(p.name)}</div>${p.note ? `<div class="dphn">${esc(p.note)}</div>` : ""}${rows}
      <button class="dadd" data-dadd="${p.id}">${ic("plus", 11)} Add asset</button></div>`;
  }).join("");
  const a = all.find(x => x.name === DCUR), name = DCUR;
  const field = f => {
    const v = dval(name, f.k), gap = !f.opt && (v === "" || v == null), est = !gap && disEst(name, f.k), cls = `df${gap ? " gap" : ""}${est ? " est" : ""}`;
    let ctl;
    if (f.t === "pick") ctl = `<div class="dpick">${f.o.map(o => `<button class="dchip" data-dset="${f.k}" data-dv="${esc(o)}" aria-pressed="${v === o}">${esc(o)}</button>`).join("")}</div>`;
    else if (f.t === "text") ctl = `<textarea data-dfield="${f.k}" rows="2" placeholder="${esc(f.ph || "")}">${esc(val(v))}</textarea>`;
    else ctl = `<input class="dinp" data-dfield="${f.k}" ${f.t === "num" ? 'inputmode="decimal"' : ""} value="${esc(val(v))}" placeholder="${esc(f.ph || "")}">`;
    return `<label class="${cls} w-${f.t}"><span class="dl">${esc(f.l)}${est ? ' <em class="destt">estimate</em>' : ""}</span>${ctl}</label>`;
  };
  const files = dfiles(name).map((f, i) => `<a class="dfile" href="${esc(f.url)}" target="_blank" rel="noopener">${ic("clip", 12)} ${esc(f.name)}</a><button class="dx" data-dfdel="${i}" aria-label="Remove ${esc(f.name)}">${ic("x", 11)}</button>`).join("");
  const n = dcount(name);
  return `<div class="dwrap">
    <aside class="drail">${rail}</aside>
    <section class="dcard">
      <div class="dhead"><div><div class="dcrumb">${esc((PH().find(p => p.id === a.phase) || {}).name || "")}${a.parent ? " · " + esc(a.parent) : ""}</div>
        <h2>${esc(name)}</h2>${a.note ? `<p class="dsub">${esc(a.note)}</p>` : ""}</div>
        <div class="dstat"><b>${n} of ${DREQ.length}</b> captured<span class="dsync" id="dsync">${ONLINE ? "Live copy" : "Saved in this browser"}</span></div></div>
      <div class="dgrid">${DF.map(field).join("")}</div>
      <div class="dfiles"><span class="dl">Template or sample</span>${files}<button class="add-btn" data-dup>${ic("plus", 11)} Attach</button></div>
      <div class="dfoot"><label class="dwho">Typing as <input class="dinp" id="dwho" value="${esc(DWHO)}" placeholder="Your name"></label>
        <span class="dhint">Red outline: not captured yet. Grey: estimate, please confirm</span>
        <button class="btn" data-dnext>Next asset</button></div>
    </section></div>`;
}

/* ---------- saving: this browser always, the server when hosted ---------- */
let dSaveT;
function dLocal(){ try { localStorage.setItem(DSTORE, JSON.stringify(D)); } catch(_){} }
function dPut(name, k, v){
  (D[name] = D[name] || {})[k] = v; dLocal();
  if (!ONLINE) return;
  const s = $("#dsync"); if (s) s.textContent = "Saving";
  fetch("api/discuss", {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify({asset: name, field: k, value: v, by: DWHO})})
    .then(r => { if (!r.ok) throw 0; const e = $("#dsync"); if (e) e.textContent = "Saved, live copy"; })
    .catch(() => { const e = $("#dsync"); if (e) e.textContent = "Not saved online: kept in this browser"; });
}
function dPull(){
  if (!ONLINE) return Promise.resolve();
  return fetch("api/discuss").then(r => r.json()).then(remote => {
    const act = document.activeElement, editing = act && act.dataset && act.dataset.dfield;
    let changed = false;
    for (const [name, r] of Object.entries(remote || {})) for (const [k, v] of Object.entries(r)){
      if (editing && name === DCUR && k === editing) continue;
      const cur = D[name] && D[name][k];
      if (JSON.stringify(cur) !== JSON.stringify(v)){ (D[name] = D[name] || {})[k] = v; changed = true; }
    }
    if (changed){ dLocal(); if (TAB === "discuss" && !editing) render(); }
  }).catch(() => {});
}
if (ONLINE){ dPull(); setInterval(dPull, 8000); }

/* ---------- events ---------- */
document.addEventListener("click", e => {
  const q = s => e.target.closest(s); let b;
  if ((b = q("[data-dpick]"))){ DCUR = b.dataset.dpick; render(); return; }
  if ((b = q("[data-dset]"))){ const k = b.dataset.dset, v = b.dataset.dv; dPut(DCUR, k, dval(DCUR, k) === v && !disEst(DCUR, k) ? "" : v); render(); return; }
  if ((b = q("[data-dnext]"))){ const all = dAll(), i = all.findIndex(a => a.name === DCUR); DCUR = all[(i + 1) % all.length].name; render(); scrollTo(0, 0); return; }
  if ((b = q("[data-dadd]"))){
    const name = (prompt("Asset name") || "").trim(); if (!name) return;
    dPut(name, "_added", b.dataset.dadd); DCUR = name; render(); return;
  }
  if ((b = q("[data-dfdel]"))){ const list = dfiles(DCUR).slice(); list.splice(+b.dataset.dfdel, 1); dPut(DCUR, "_files", list); render(); return; }
  if ((b = q("[data-dup]"))){ $("#dattach").click(); return; }
});
document.addEventListener("input", e => {
  const t = e.target;
  if (t.id === "dwho"){ DWHO = t.value; try { localStorage.setItem(DSTORE + ":who", DWHO); } catch(_){} return; }
  if (!t.dataset.dfield) return;
  const k = t.dataset.dfield, v = t.value, name = DCUR;
  const box = t.closest(".df"); box.classList.toggle("gap", v.trim() === ""); box.classList.remove("est");
  clearTimeout(dSaveT); dSaveT = setTimeout(() => dPut(name, k, v), 400);
});
document.addEventListener("change", e => {
  const t = e.target; if (t.id !== "dattach" || !t.files.length) return;
  const name = DCUR, list = dfiles(name).slice();
  const done = () => { dPut(name, "_files", list); render(); t.value = ""; };
  if (!ONLINE){
    for (const f of t.files) list.push({name: f.name, url: URL.createObjectURL(f), local: true});
    done(); return;
  }
  Promise.all([...t.files].map(f => fetch("api/upload?name=" + encodeURIComponent(f.name), {method: "POST", body: f})
    .then(r => r.json()).then(j => list.push({name: f.name, url: j.url}))))
    .then(done).catch(() => alert("Upload failed. Try again."));
});
