/* Discussion page: one card per asset, filled live in the meeting.
   Kept apart from the business case model: answers live in D, saved to
   the server (/api/discuss) when the tool is hosted, and to this browser
   as a backup. Empty boxes are tinted red so gaps are visible; after the
   call the answers are sorted into the detailed As-is page. */

const DSTORE = STORE + "discuss";
const ONLINE = location.protocol.startsWith("http");
let D = {}, DCUR = null, DWHO = "";
try { D = JSON.parse(localStorage.getItem(DSTORE) || "{}"); } catch(_){}
try { DWHO = localStorage.getItem(DSTORE + ":who") || ""; } catch(_){}

/* the fields asked on every asset, in the order they are discussed */
const DF = [
  {g: "What it is", k: "what", l: "What it is, and who it is for", t: "text", ph: "One or two lines"},
  {g: "What it is", k: "made", l: "Who makes it today", t: "pick", o: ["In-house", "External", "Not done"]},
  {g: "What it is", k: "maker", l: "Team or agency", t: "line", ph: "e.g. Portfolio marketing, Digital Apple"},
  {g: "What it is", k: "template", l: "Template", t: "pick", o: ["Yes", "Partly", "No"]},
  {g: "How it is made", k: "inputs", l: "Inputs, and from whom", t: "text", ph: "e.g. One Brief from Product, analyst reports"},
  {g: "How it is made", k: "how", l: "Steps, in order", t: "text", ph: "e.g. Brief, draft, product review, approval"},
  {g: "How it is made", k: "format", l: "Output: format and length", t: "line", ph: "e.g. PowerPoint, 1 page"},
  {g: "Time and cost", k: "brief", l: "Briefing (hours)", t: "num"},
  {g: "Time and cost", k: "make", l: "Making it (hours)", t: "num"},
  {g: "Time and cost", k: "review", l: "Review (hours)", t: "num"},
  {g: "Time and cost", k: "wait", l: "Start to finish (days)", t: "num"},
  {g: "Time and cost", k: "cost", l: "External cost (€): new / update / market", t: "line", ph: "e.g. 403 / 201 / 184"},
  {g: "Approval", k: "approvers", l: "Approvers", t: "line", ph: "e.g. Cluster lead, Brand, Legal"},
  {g: "Approval", k: "approval", l: "Approval or alignment", t: "pick", o: ["Must approve", "Alignment only"]},
  {g: "Versions", k: "mv", l: "Market versions", t: "line", ph: "e.g. 3 of 10 markets"},
  {g: "Versions", k: "upd", l: "Updates", t: "line", ph: "e.g. every 6 months"},
  {g: "Versions", k: "var", l: "Variants", t: "line", ph: "e.g. per ICP group"},
  {g: "Notes", k: "notes", l: "Notes", t: "text", ph: "Anything else worth keeping.", opt: true}
];
const DREQ = DF.filter(f => !f.opt);

/* the asset list is the app's own (S.sections), so both pages always match;
   parts of a block (a.parent) sit indented under it. AEO templates are left out. */
const DSKIP = /AEO/;
const PH = () => S.sections.filter(sec => !DSKIP.test(sec.name)).map(sec => ({id: sec.id, name: sec.name}));

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
  "Meet the Customer videos": {made: "In-house", maker: "Portfolio marketing, in Synthesia", what: "Role videos, 3 per market", how: "3 videos; each is a script (1 hour), then build and tweak (2 hours)", make: 9, approvers: "Cluster lead"},
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
const ALIAS = {"Product exec summary": "One-page summary", "Buying group": "Buying group and personas", "Buyer personas": "Buying group and personas",
  "Buyer journey": "Buyer journey and discovery questions", "Discovery questions": "Buyer journey and discovery questions"};
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

/* what was said on the 4 Nov call, so a card opens with it; anything typed on the card replaces it */
const CALL4 = {
  "Pitch deck": "Out of the case for now. Too bespoke to template today. Second stage if products group into 4 or 5 cohorts. First win: one standard look and feel (imagery, illustration style), so sales stop mixing slides that do not match.",
  "Product catalogue pages": "New and templated: 2 pages per product family, an opening paragraph, line listings and a picture. Done for mobile, started for UC. Sales use it with customers. 3 hours of team time for 2 pages. Families per portfolio to confirm.",
  "Product brochure": "4-page PDF, made in PowerPoint, no edits outside the markets. 4 hours of team time for briefing, writing and approval, plus the agency design. Template exists.",
  "Product factsheet": "2 pages, same as the brochure with different content. 3 hours of team time. Template exists.",
  "Customer FAQ": "New. About 20 questions, generic for now. Goes to markets and sales, feeds AEO and the web.",
  "Interactive demo video": "Navattic is close to approval with IT. Used for MP4 videos: marketing, sales training, sales in front of customers. 15 hours of team time a video. One per product with a portal, volume to confirm. Licence €15,000 a year, due end of March; the platform could make the MP4s instead.",
  "Explainer video": "15 hours of team time, mostly scripting and feedback loops. Should come down with a proper brief and script. 60 seconds wanted (a 5-minute one was too long). Social cutdowns go in the price.",
  "Sales to customer email": "Copy only, no HTML. 2 hours an email, one today. Should be one per ICP cohort. Known customers, sent from Outlook or Highspot.",
  "Social pack": "3 static posts, about 1 hour for all three, in-house only. Sits with the copy kit and the messaging house, not the cohorts. Image selection with the copy on top is possible.",
  ".com presence": "A couple of sentences for the portfolio page, about 1 hour. Anything longer is bespoke per market.",
  "Video cutdowns": "New. Not done today. 3 or 4 short cuts of each long video for LinkedIn and YouTube Shorts.",
  "Blog or article": "Written in-house (the agency budget was cut), authored by a subject matter expert, then brand and external comms review. 2 hours for the team and 3 for the expert. At least one a month, every two weeks if possible. Later: the tool watches the market and suggests topics.",
  "eBook": "Heavy copy and glossy design. 12 hours today, target 4. One a quarter today; 12 a year is the optimistic target. The tool can help with the copy, design stays heavy.",
  "Solution architecture pack": "Paused. Not made by the team: solution architects and pre-sales hold the raw content. We brand and scale it. An illustrative agency cost is to come.",
  "Messaging House": "3 ICP cohorts give 3 messaging houses; markets pick the closest and adapt. Approved by product, market, brand, sustainability, legal and compliance (varies by product) before any content is made. Needs the new tone of voice and brand guidelines.",
  "Product name": "Rules to come: at most 5 words, starts with Vodafone Business, descriptive. 3 to 5 names go to legal. A naming brief template exists. Kept off any shared platform for now.",
  "SEO keywords": "No keyword tools today (Brand Path exists, no access). We add an AEO audit and search volumes by market, on consumption. The cost model still to agree."
};
/* what to cover on every asset, in the order the call runs */
const COVER = ["Asset overview", "Inputs", "Process", "Cycle time", "Your effort", "External cost", "Asset: retain, enhance or new", "Outputs and formats", "Adaptations (market, industry)", "Approvers and stakeholders"];
/* notes are saved as simple HTML (bold, bullets, a heading); older notes are plain text */
const hesc = t => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function toHtml(t){
  t = String(t || ""); if (/<(p|div|br|ul|li|b|strong|h3)\b/i.test(t)) return t;
  const out = []; let list = false;
  for (const ln of t.split(/\n/)){
    const m = /^\s*[-•]\s+(.*)$/.exec(ln);
    if (m){ if (!list){ out.push("<ul>"); list = true; } out.push(`<li>${hesc(m[1])}</li>`); continue; }
    if (list){ out.push("</ul>"); list = false; }
    out.push(ln.trim() ? `<div>${hesc(ln)}</div>` : "<div><br></div>");
  }
  if (list) out.push("</ul>"); return out.join("");
}
function toPlain(t){
  const el = document.createElement("div"); el.innerHTML = toHtml(t);
  el.querySelectorAll("li").forEach(li => li.prepend("- ")); el.querySelectorAll("li,div,p,h3,br").forEach(n => n.after("\n"));
  return el.textContent.replace(/\n{3,}/g, "\n\n").trim();
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
const dval = (name, k) => { const r = D[name]; if (r && k in r) return r[k]; const s = SEED[name]; if (s && k in s) return s[k]; const al = ALIAS[name]; if (al){ const ra = D[al], sa = SEED[al]; if (ra && k in ra) return ra[k]; if (sa && k in sa) return sa[k]; } const e = dEst(name); return k in e ? e[k] : ""; };
const disEst = (name, k) => { const r = D[name]; if (r && k in r) return false; const s = SEED[name]; if (s && k in s) return false; return k in dEst(name); };
const dgap = (name, f) => { const v = dval(name, f.k); return v === "" || v == null; };
const dcount = name => DREQ.filter(f => !dgap(name, f)).length;

function discussHTML(){
  /* the list on the left is the As-is list itself, so both pages always match */
  const all = dAll();
  if (!S.assets[S.current] || !all.some(x => x.name === S.assets[S.current].name)){
    const first = Object.values(S.assets).find(x => x.name === all[0].name); if (first) S.current = first.id;
  }
  DCUR = S.assets[S.current].name;
  const rail = RAIL_HIDE ? `<div class="askcol slim"><button class="railbtn" data-rail data-hover="Show the asset list" aria-label="Show the asset list">${ic("side", 16)}</button></div>`
    : `<div class="askcol"><section class="ask">${railHTML()}</section></div>`;
  const a = all.find(x => x.name === DCUR), name = DCUR;
  const made = dval(name, "made"), asset = S.assets[S.current], phase = (PH().find(p => p.id === a.phase) || {}).name || "";
  const conv = CONV && CONV.name === name ? convHTML() : "";
  return `<div class="grid${RAIL_HIDE ? " slimg" : ""}">${rail}<div class="answers">
    <section class="dcard">
      <div class="dhead">${a.parent || phase !== name ? `<div class="dcrumb">${esc(a.parent || phase)}</div>` : ""}
        <div class="dtitle"><h2>${esc(name)}</h2>
        <div class="tools">
          <span class="pillrow" role="group" aria-label="Status of this asset">${Object.entries(STLAB).map(([k, l]) => `<button class="pill" data-set-status="${k}" aria-pressed="${statusOf(asset) === k}">${l}</button>`).join("")}</span></div></div></div>
      ${conv}
      <div class="dsplit">
        <aside class="dcover"><div class="dl">Cover</div>
          <ul>${COVER.map(c => `<li>${esc(c)}</li>`).join("")}</ul></aside>
        <div class="dnotes"><div class="rte">
          <div class="rtb">
            <button class="rtbtn" data-rt="bold" data-hover="Bold" aria-label="Bold">${ic("bold", 14)}</button>
            <button class="rtbtn" data-rt="insertUnorderedList" data-hover="Bullets" aria-label="Bullets">${ic("list", 14)}</button>
            <button class="rtbtn" data-rt="h3" data-hover="Heading" aria-label="Heading">${ic("head", 14)}</button>
            <span class="rtsp"></span>
            <button class="rtbtn${REC ? " rec" : ""}" data-voice data-hover="${REC ? "Stop recording" : "Record your voice"}" aria-label="Record your voice">${ic("mic", 15)}${REC ? "<i>Recording</i>" : ""}</button>
            <button class="rtbtn go" data-convert data-hover="Turn the notes into the detailed page" aria-label="Analyze">${ic("spark", 14)}<i>Analyze</i></button>
          </div>
          <div class="rtx" contenteditable="true" data-dfield="free" data-ph="Notes from the call, in your own words" role="textbox" aria-multiline="true">${toHtml(dfree(name))}</div></div></div>
      </div>
      <span class="dsync" id="dsync"></span>
    </section></div></div>`;
}

/* what we will cover on every asset: short prompts for the presenter */
/* what is still open on THIS asset, in the order the call runs; it shrinks as values are confirmed */
function coverList(a, name){
  const keys = uncKeys(a), st = lbl => (a.steps || []).find(x => lbl.test(x.label)), open = id => id && keys.has(id), out = [];
  const draft = st(/^draft$|copy|design/i), brief = st(/brief/i), review = st(/review/i), appr = st(/approv/i);
  const made = dval(name, "made"); if (!made || disEst(name, "made")) out.push("Who makes it today");
  if ((a.inputs || []).some(it => !(it.label || "").trim() || DEFAULT_INPUTS.includes(it.label))) out.push("Inputs, and who gives them");
  if ([draft, brief].some(x => x && open("h" + x.id))) out.push("Hours to brief and make");
  if ((a.steps || []).some(x => open("d" + x.id))) out.push("Days start to finish");
  if ([review, appr].some(x => x && (open("h" + x.id) || open("d" + x.id))) || !dval(name, "approvers") || disEst(name, "approvers")) out.push("Who approves, in what order");
  if ((a.outputs || []).some(o => open("of" + o.id) || open("ol" + o.id)) || !(a.output || "").trim()) out.push("Output, format, template");
  out.push("Markets, updates, variants");
  return out;
}
/* the notes are one free-flow box; notes typed earlier in the six boxes are folded in the first time */
const dfree = name => { const r = D[name] || {}; if (!("free" in r) && ALIAS[name] && D[ALIAS[name]] && "free" in D[ALIAS[name]]) return String(D[ALIAS[name]].free || ""); if ("free" in r) return String(r.free || ""); if (CALL4[name] && !BOX.some(b => (r[b.k] || "").trim())) return CALL4[name]; return BOX.map(b => (r[b.k] || "").trim() ? `${b.l}\n${r[b.k].trim()}` : "").filter(Boolean).join("\n\n"); };

/* ---------- convert the notes to structured data ----------
   A first version without AI: it reads hours, days, fees, who approves and
   who makes it from the text and shows what it would change; nothing is
   applied until you tick and apply. An AI step can replace parse() later. */
let CONV = null, REC = null;
const PARTIES = ["Product (group)", "Product (local)", "Product", "Local GTM", "Propositions team", "Cluster lead", "Brand", "Legal", "Compliance", "Sustainability", "Markets", "VPC"];
function parseNotes(text, a){
  const items = [], used = new Set(), steps = a.steps || [];
  const stepOf = re => steps.find(x => re.test(x.label)), draft = stepOf(/^draft$/i) || stepOf(/copy|design/i), brief = stepOf(/brief/i), review = stepOf(/review/i), appr = stepOf(/approv/i);
  const lines = text.split(/\n+/).map(l => l.trim()).filter(Boolean), num = x => Math.round(parseFloat(x.replace(",", ".")) * 100) / 100;
  const conf = k => { (a.conf = a.conf || {})[k] = 1; };
  const add = (label, from, to, apply, line) => { items.push({label, from, to, apply, on: true}); if (line != null) used.add(line); };
  /* which kind of step a number belongs to: the nearest keyword before it, else one in the line */
  const kind = (low, at) => {
    const cut = Math.max(low.lastIndexOf(". ", at), low.lastIndexOf("; ", at)), pre = low.slice(cut >= 0 ? cut + 1 : 0, at), pos = {brief: pre.lastIndexOf("brief"), review: pre.lastIndexOf("review"), approval: Math.max(pre.lastIndexOf("approv"), pre.lastIndexOf("sign off"), pre.lastIndexOf("sign-off"), pre.lastIndexOf("cluster"))};
    const best = Object.entries(pos).sort((x, y) => y[1] - x[1])[0];
    if (best[1] >= 0) return best[0];
    return /brief/.test(low) ? "brief" : /review/.test(low) ? "review" : /approv|sign.?off/.test(low) ? "approval" : "make";
  };
  const seen = new Set(), once = key => !seen.has(key) && seen.add(key);
  const approvers = [], pushP = ps => ps.forEach(p => { if (!approvers.includes(p)) approvers.push(p); });
  let madeBy = null;
  lines.forEach((ln, li) => {
    const low = ln.toLowerCase(); let m;
    const hre = /(\d+(?:[.,]\d+)?)\s*(?:h\b|hrs?\b|hours?\b)/gi;
    while ((m = hre.exec(ln))){
      const v = num(m[1]), k = kind(low, m.index);
      if (k === "brief" && brief && once("bh")) add("Brief, hours", brief.hours, v, () => { brief.hours = v; conf("h" + brief.id); }, li);
      else if (k === "review" && review && once("rh")) add("Review, hours", review.hours, v, () => { review.hours = v; conf("h" + review.id); }, li);
      else if (k === "approval" && appr && once("ah")) add("Approval, hours", appr.hours, v, () => { appr.hours = v; conf("h" + appr.id); }, li);
      else if (k === "make" && draft && once("mh")) add("Making, hours", draft.hours, v, () => { draft.hours = v; conf("h" + draft.id); }, li);
    }
    const dre = /(\d+(?:[.,]\d+)?)\s*(days?|weeks?|wks?)\b/gi;
    while ((m = dre.exec(ln))){
      const v = num(m[1]) * (/^w/i.test(m[2]) ? 7 : 1), k = kind(low, m.index);
      if (k === "review" && review && once("rd")) add("Review, days", review.days, v, () => { review.days = v; conf("d" + review.id); }, li);
      else if (k === "approval" && appr && once("ad")) add("Approval, days", appr.days, v, () => { appr.days = v; conf("d" + appr.id); }, li);
    }
    if ((m = /([€£])\s?(\d[\d,]*(?:\.\d+)?)/.exec(ln)) && /fee|agency|cost|charge/.test(low) && draft && once("fee")){
      const v = Math.round(num(m[2].replace(/,/g, "")) * (m[1] === "£" ? 1.15 : 1)); add("Agency fee, €", draft.fee || 0, v, () => { draft.fee = v; }, li);
    }
    if (/approv|sign.?off|align|review/.test(low)){
      const ps = PARTIES.filter(p => low.includes(p.toLowerCase())).filter((p, i, all) => !all.some(q => q !== p && q.length > p.length && q.toLowerCase().includes(p.toLowerCase())));
      if (ps.length){ pushP(ps); used.add(li); }
    }
    if (!madeBy){
      if (/(not done|don'?t do|do not do|not made today)/.test(low)) madeBy = "Not done";
      else if (/(in-house|inhouse|by pmm|portfolio marketing|made internally)/.test(low) && !/agency|external/.test(low)) madeBy = "In-house";
      else if (/\b(made|done|produced|created|built|designed)\b.*\b(agency|externally|external|digital apple)\b|\b(agency|externally|external|digital apple)\b.*\b(makes|made|does|produces|designs)\b/.test(low)) madeBy = "External";
      if (madeBy) used.add(li);
    }
  });
  if (approvers.length && review){ const who = approvers.join(", "); add("Who approves", review.who, who, () => { review.who = who; }); }
  if (madeBy) add("Made by", dval(a.name, "made") || "", madeBy, () => dPut(a.name, "made", madeBy));
  const rest = lines.filter((_, i) => !used.has(i));
  if (rest.length){ const txt = rest.join("\n"); add("Notes (everything else)", (a.nuances || "").slice(0, 60), txt.length > 80 ? txt.slice(0, 80) + "…" : txt, () => { a.nuances = ((a.nuances || "") + ((a.nuances || "") ? "\n" : "") + txt).trim(); }); }
  return items.filter(it => String(it.from) !== String(it.to));
}
function convHTML(){
  const done = CONV.done || [], open = CONV.open || [];
  return `<div class="dconv"><div class="dch"><b>${done.length ? `Added ${done.length} to the detailed page` : "Nothing new found in the notes"}</b></div>
    ${done.map(it => `<div class="dci2"><span class="dcl">${esc(it.label)}</span><span class="dct">${esc(String(it.to))}</span></div>`).join("")}
    <div class="dch"><b>${open.length ? "Still open" : "Nothing open"}</b></div>
    ${open.length ? `<ul class="dopen">${open.map(o => `<li>${esc(o)}</li>`).join("")}</ul>` : ""}
    <div class="dcb"><button class="btn lime" data-dnext>Next asset</button><button class="cvbtn" data-conv-x>Close</button></div></div>`;
}
/* Analyze: read the notes, apply what they say to the detailed page, then list what is still open */
function analyze(){
  const as = S.assets[S.current], name = DCUR, ed = document.querySelector(".rtx");
  if (ed){ clearTimeout(dSaveT); dPut(name, "free", ed.innerHTML); }
  const items = parseNotes(toPlain(dfree(name)), as);
  snap("Analyzed " + name);
  items.forEach(x => { if (x.on) x.apply(); });
  CONV = {name, done: items.filter(x => x.on), open: coverList(as, name)}; save(); render();
}
function placeCaretEnd(el){ const r = document.createRange(); r.selectNodeContents(el); r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
function toggleVoice(){
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR){ toast("Voice needs Chrome"); return; }
  if (REC){ REC.stop(); return; }
  const r = new SR(); r.lang = "en-GB"; r.continuous = true; r.interimResults = false;
  r.onresult = ev => { let t = ""; for (let i = ev.resultIndex; i < ev.results.length; i++) if (ev.results[i].isFinal) t += ev.results[i][0].transcript + " ";
    const ed = document.querySelector(".rtx"); if (t && ed){ ed.focus(); placeCaretEnd(ed); document.execCommand("insertText", false, t); } };
  r.onerror = ev => { if (ev.error !== "no-speech") toast("Voice: " + ev.error); };
  r.onend = () => { REC = null; render(); };
  REC = r; r.start(); render();
}

/* six free-text boxes in the order the call runs; each opens with what is
   already known (estimates say so), and is sorted into the detail after the call */
const BOX = [
  {k: "b_what", l: "What it is", ph: "Who uses it. Made in-house, by an agency, or not at all. Template?"},
  {k: "b_how", l: "How it's made", ph: "Inputs and who provides them. The steps. Output format and length."},
  {k: "b_time", l: "Time and cost", ph: "Hours to brief, make and review. Days start to finish. Agency fee."},
  {k: "b_appr", l: "Approval", ph: "Who signs it off. Approval or alignment only?"},
  {k: "b_ver", l: "Adaptations", ph: "Market versions: how many of the 10 markets. Updates: how often. Variants, e.g. per ICP group."},
  {k: "b_notes", l: "Notes", ph: "Anything else.", opt: true}
];
function dboxSeed(name){
  const v = (k, unit = "") => { const x = dval(name, k); return x === "" || x == null ? "" : String(x) + unit + (disEst(name, k) && !(RATE[name] && ["cost", "maker", "made"].includes(k)) ? " (estimate)" : ""); };
  const join = parts => parts.filter(p => p[1]).map(([l, x]) => l ? `${l}: ${x}` : x).join("\n");
  return {
    b_what: join([["", v("what")], ["Made by", v("maker")], ["Template", v("template")]]),
    b_how: join([["Inputs", v("inputs")], ["Steps", v("how")], ["Output", v("format")]]),
    b_time: join([["Brief", v("brief", " h")], ["Make", v("make", " h")], ["Review", v("review", " h")], ["Start to finish", v("wait", " days")], ["Agency fee, € new / update / market", v("cost")]]),
    b_appr: join([["", v("approvers")], ["", v("approval")]]),
    b_ver: join([["Markets", v("mv")], ["Updates", v("upd")], ["Variants", v("var")]]),
    b_notes: v("notes")
  };
}
const dbox = (name, b) => { const r = D[name]; if (r && b.k in r) return String(r[b.k] || ""); return dboxSeed(name)[b.k] || ""; };

/* ---------- saving: this browser always, the server when hosted ---------- */
let dSaveT;
function dLocal(){ try { localStorage.setItem(DSTORE, JSON.stringify(D)); } catch(_){} }
function dPut(name, k, v){
  (D[name] = D[name] || {})[k] = v; dLocal();
  if (!ONLINE) return;
  fetch("api/discuss", {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify({asset: name, field: k, value: v, by: DWHO})})
    .then(r => { if (!r.ok) throw 0; const e = $("#dsync"); if (e) e.textContent = ""; })
    .catch(() => { const e = $("#dsync"); if (e) e.textContent = "Not saved online, kept in this browser"; });
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
  if ((b = q("[data-dset]"))){ const k = b.dataset.dset, v = b.dataset.dv; dPut(DCUR, k, dval(DCUR, k) === v && !disEst(DCUR, k) ? "" : v); render(); return; }
  if ((b = q("[data-convert]"))){ analyze(); return; }
  if ((b = q("[data-voice]"))){ toggleVoice(); return; }
  if ((b = q("[data-rt]"))){ const ed = document.querySelector(".rtx"); if (!ed) return; ed.focus();
    if (b.dataset.rt === "h3"){ const blk = getSelection().anchorNode; const inH = blk && (blk.nodeType === 1 ? blk : blk.parentElement).closest("h3"); document.execCommand("formatBlock", false, inH ? "div" : "h3"); }
    else document.execCommand(b.dataset.rt);
    ed.dispatchEvent(new Event("input", {bubbles: true})); return; }
  if ((b = q("[data-conv-x]"))){ CONV = null; render(); return; }
  if ((b = q("[data-conv-go]"))){ const n = CONV.items.filter(x => x.on); n.forEach(x => x.apply()); CONV = null; save(); render(); const t = $("#saved"); if (t){ t.textContent = `Applied ${n.length} change${n.length === 1 ? "" : "s"}`; setTimeout(() => { t.textContent = ""; }, 3500); } return; }
  if ((b = q("[data-dknown]"))){ const k = BOX.map(x => { const v = dboxSeed(DCUR)[x.k]; return v ? `${x.l}\n${v}` : ""; }).filter(Boolean).join("\n\n"); const cur = dfree(DCUR); dPut(DCUR, "free", (cur ? cur + "\n\n" : "") + "Already known\n" + k); render(); return; }
  if ((b = q("[data-dnext]"))){ const all = dAll(), i = all.findIndex(a => a.name === DCUR), nx = all[(i + 1) % all.length];
    const id = Object.keys(S.assets).find(k => S.assets[k].name === nx.name); if (id) S.current = id; render(); save(); scrollTo(0, 0); return; }
});
document.addEventListener("change", e => { const t = e.target; if (t.dataset && t.dataset.convI != null && CONV){ CONV.items[+t.dataset.convI].on = t.checked; const g = document.querySelector("[data-conv-go]"); if (g) g.textContent = "Apply " + CONV.items.filter(x => x.on).length; } });
document.addEventListener("input", e => {
  const t = e.target;
  if (!t.dataset.dfield) return;
  const k = t.dataset.dfield, v = t.isContentEditable ? t.innerHTML : t.value, name = DCUR;
  const box = t.closest(".df"); if (box){ box.classList.toggle("gap", v.trim() === ""); box.classList.remove("est"); }
  (D[name] = D[name] || {})[k] = v; dLocal();
  clearTimeout(dSaveT); dSaveT = setTimeout(() => dPut(name, k, v), 400);
});

document.addEventListener("mousedown", e => { if (e.target.closest && e.target.closest(".rtbtn[data-rt]")) e.preventDefault(); });
document.addEventListener("keydown", e => {
  const t = e.target; if (!t.isContentEditable || !t.dataset || !t.dataset.dfield || e.key !== " ") return;
  const sel = getSelection(), n = sel.anchorNode;
  if (n && n.nodeType === 3 && /^[-•*]$/.test(n.textContent.slice(0, sel.anchorOffset)) && sel.anchorOffset === n.textContent.length && !n.previousSibling){
    e.preventDefault(); n.textContent = ""; document.execCommand("insertUnorderedList"); }
});
document.addEventListener("paste", e => { const t = e.target; if (t.isContentEditable && t.dataset && t.dataset.dfield){ e.preventDefault(); document.execCommand("insertText", false, (e.clipboardData || window.clipboardData).getData("text/plain")); } });

/* the tool opens on this page, so draw it once this file has loaded */
if (TAB === "discuss") render();
