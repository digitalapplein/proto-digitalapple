/* ===================================================================
   UI. The engine in engine.js is untouched from the version that
   reconciles to the study; everything here only paints it.
   =================================================================== */
const $ = s => document.querySelector(s);
const el = (t,c,h)=>{const n=document.createElement(t); if(c)n.className=c; if(h!=null)n.innerHTML=h; return n;};

const money  = n => "$" + Math.round(n).toLocaleString("en-US");
const money2 = n => "$" + n.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
const pct    = n => (n*100).toFixed(3).replace(/0$/,"") + "%";
const rate2  = n => "$" + n.toFixed(2);
function big(n){
  const a = Math.abs(n);
  if (a >= 1e9) return (n<0?"-":"") + "$" + (a/1e9).toFixed(1) + "B";
  if (a >= 1e6) return (n<0?"-":"") + "$" + (a/1e6).toFixed(1) + "M";
  if (a >= 1e3) return (n<0?"-":"") + "$" + Math.round(a/1e3) + "K";
  return money(n);
}

let TERM = 1;          // years
let CMP  = "hyp";      // which competitor the page is arguing against
let TAB  = "neb";      // which provider's detail is on screen
let FS = false;        // full screen

const SHORT = {neb:"Nebius", hyp:"a hyperscaler", sil:"a silver-tier neocloud"};

/* ---- tooltips: what it is, how it is worked out, why it differs, source ---- */
const TIPS = {
  compute:{t:"GPU compute", what:"The headline rental price, after term and volume discounts. This is the only line most quotes contain.",
    how:"compute = $ per GPU-hour x GPUs x 720 hours", src:"Sections 2.1, 3.1 to 3.3"},
  storage:{t:"Storage", what:"Hot storage for active training data and checkpoints, warm or object storage for less frequent access, and cold archival. A silver-tier neocloud often cannot serve hot tier at full performance at scale, so the model prices warm instead.",
    how:"storage = $ per TB-month x TB, summed across tiers", src:"Sections 2.1, 4.1 to 4.3"},
  network:{t:"Network", what:"Egress, data transfer, public addressing, NAT and firewall endpoints. The high-performance interconnect is assumed equal across all three and is not charged here.",
    why:"Nebius and a silver-tier neocloud bundle these. A hyperscaler bills each one.", src:"Section 2.1"},
  ctrl:{t:"Control plane", what:"CPU machines for login, code development and job submission.",
    how:"control plane = $ per VM-hour x machines x 720", src:"Section 2.1"},
  support:{t:"Support", what:"An uplift charged on your whole cloud bill, not a flat fee. A hyperscaler offers three tiers running from 3 to 10 percent of monthly spend.",
    how:"support = tier percentage x (compute + storage + network + control plane)",
    why:"Nebius includes 24x7 support in the cluster price, direct to an engineer, with no ticket queue.", src:"Sections 2.1, 3.1 to 3.3"},
  eng:{t:"Your engineering", what:"Your own engineers, tuning the cluster and then keeping jobs completing. On a hyperscaler this means NCCL and EFA parameters, which users report takes weeks to months across several people.",
    how:"engineering = engineer cost x engineer-months",
    why:"This is payroll, not a vendor invoice, which is exactly why it goes missing from comparisons.", src:"Sections 2.1 and 3.2"},
  failure:{t:"Cost of failure", what:"Compute you paid for that produced nothing, because a node failed and the job stopped. It never appears on an invoice. You pay it in work that did not finish.",
    how:"G_restart = {[(t_id + t_chkpt/2) + t_init] x job size\n             + t_repair x blast radius}\n            x failures x $/GPU-hr",
    why:"Nebius and a hyperscaler are assumed equally reliable, at 25,000 GPU-hours between failures. A silver-tier neocloud is assumed at 15,000, takes an hour to notice a failure rather than fifteen minutes, and an hour to swap a node rather than fifteen. Those four numbers are the entire gap.", src:"Sections 2.3 and 4.1"},
  poc:{t:"Proof of concept", what:"The cluster time you rent to find out whether the cluster works. At this size it is the largest single number on the page.",
    how:"proof of concept = $ per GPU-hour x GPUs x 720 x months",
    why:"Proofs of concept are free on Nebius.", src:"Sections 3.1 to 3.3"},
  mtbf:{t:"Mean time between failures", what:"Hours of service one GPU gives before a hard failure. Every Xid and SXid counts.",
    how:"cluster MTBF = GPU MTBF / GPUs, so failures per month = 720 / cluster MTBF",
    why:"A chip that lasts 25,000 hours sounds reliable. Put 5,184 in one cluster and something breaks every five hours. Scale is what turns reliable chips into an unreliable machine.", src:"Section 2.3"},
  allin:{t:"All-in cost per GPU-hour", what:"Everything on this page divided back by the GPU-hours you bought, so it compares with the number on a quote.",
    how:"all-in = true monthly cost / (GPUs x 720)",
    why:"A quote is a price. This is a cost. The gap between them is the point of the page.", src:"Section 2.2"}
};

/* ===================================================================
   Paint
   =================================================================== */
function render(){
  const m = model();
  paintAsk();
  paintHero(m);
  paintDetail(m);
}

/* ---- left column ---- */
let askBuilt = false;
function paintAsk(){
  if (!askBuilt){
    $("#recipes").innerHTML = RECIPES.map(r=>{
      const g = GPUS.find(x=>x.id===r.gpu);
      const racks = g.per ? Math.round(r.qty/g.per) + " racks, " : "";
      return `<button type="button" class="opt" data-r="${r.key}" aria-pressed="${r.key===S.key}">
        <b>${r.label}</b><span>${racks}${r.qty.toLocaleString()} x ${g.label}</span></button>`;
    }).join("");
    $("#cmp").innerHTML = ["hyp","sil"].map(s=>
      `<button type="button" class="pill" data-cmp="${s}" aria-pressed="${s===CMP}">
        ${SIDE_NAME[s].replace(/^A /,"")}</button>`).join("");
    askBuilt = true;
  }
  document.querySelectorAll("[data-r]").forEach(b=>b.setAttribute("aria-pressed", b.dataset.r===S.key));
  document.querySelectorAll("[data-cmp]").forEach(b=>b.setAttribute("aria-pressed", b.dataset.cmp===CMP));
  document.querySelectorAll("[data-term]").forEach(b=>b.setAttribute("aria-pressed", +b.dataset.term===TERM));
}

/* ---- hero: one figure, three numbers, a waterfall in tints ---- */
function paintHero(m){
  const g = GPUS.find(x=>x.id===S.gpu);
  const racks = g.per ? Math.round(S.qty/g.per) : 0;
  const n = m.side.neb, c = m.side[CMP];
  const months = TERM * 12;

  countTo($("#allin"), n.allIn);
  $("#scale").textContent = racks ? `${racks} racks` : `${S.qty.toLocaleString()} GPUs`;
  $("#says").innerHTML =
    `<b>${S.qty.toLocaleString()} x ${g.label}</b>${racks?` across <b>${racks} racks</b>`:""},
     ${S.equalGpu ? `quoted at <b>${rate2(S.rate.neb)}</b> per GPU-hour` : `on Nebius pricing`},
     ${{wait:"waiting on repairs", restart:"restarting from checkpoints",
        tolerant:"fault tolerant"}[S.good.mode]}.`;

  $("#three").innerHTML = [
    ["Over " + TERM + (TERM>1?" years":" year"), big(n.total*months), "on Nebius"],
    [SIDE_NAME[CMP], big(c.total*months), `${c.ratio.toFixed(2)}x the Nebius total`],
    ["The difference", big((c.total-n.total)*months), `+${((c.ratio-1)*100).toFixed(1)}% you do not have to spend`]
  ].map(([k,v,s])=>`<div><div class="k">${k}</div><div class="v">${v}</div><div class="s">${s}</div></div>`).join("");

  // the walk, in three tints of navy. No hue goes on the gradient.
  const base = n.total*months, target = c.total*months, gap = target-base;
  const steps = [["support","Support"],["eng","Setup and debugging"],["storage","Storage"],
                 ["network","Network"],["ctrl","Control plane"],["compute","Compute"],["failure","Cost of failure"]]
    .map(([k,l])=>({l, v:(c[k]-n[k])*months})).filter(x=>x.v > gap*0.02)
    .sort((a,b)=>b.v-a.v).slice(0,3);
  const rest = gap - steps.reduce((t,x)=>t+x.v,0);
  if (rest > gap*0.01) steps.push({l:"Everything else", v:rest});

  const max = Math.max(base, target);
  const w = v => (v/max*100).toFixed(1);
  const tint = ["var(--t2)","var(--t3)","var(--t2)","var(--t3)"];
  let run = base;

  $("#wfh").textContent = `Where the ${big(gap)} difference comes from`;
  $("#wfrows").innerHTML =
    `<div class="wfrow anchor"><span class="l">Nebius</span>
       <span class="t"><span class="b" style="left:0;width:${w(base)}%;background:var(--t1)"></span></span>
       <span class="v">${big(base)}</span></div>` +
    steps.map((st,i)=>{
      const from = run; run += st.v;
      return `<div class="wfrow"><span class="l">${st.l}</span>
        <span class="t"><span class="b" style="left:${w(from)}%;width:${Math.max(0.8,st.v/max*100).toFixed(1)}%;background:${tint[i%tint.length]}"></span></span>
        <span class="v">+${big(st.v)}</span></div>`;
    }).join("") +
    `<div class="wfrow anchor"><span class="l">${SIDE_NAME[CMP]}</span>
       <span class="t"><span class="b" style="left:0;width:${w(target)}%;background:var(--t1)"></span></span>
       <span class="v">${big(target)}</span></div>`;
}

/* ---- the rate card: one table, every provider, always editable ---- */
const OPEN = new Set();   // collapsed by default; a section opens to reveal its editable rates
const GONE = new Set();   // lines the user has removed from the card

/* Reset only earns its place once something has actually changed, so we
   snapshot the pristine state on load and compare against it. */
let PRISTINE = "";
function signature(){
  return JSON.stringify([S.qty, S.gpu, S.rate, S.ctrl, S.net, S.support, S.poc,
    S.engYear, S.setupEng, S.debugEng, S.good,
    ["hot","warm","cold"].map(t=>[S[t].qty, S[t].rate]),
    S.failOv, S.pocOv, RATE_OV, [...GONE], SIDES]);
}
const markClean = () => { PRISTINE = signature(); };
const isDirty  = () => PRISTINE !== "" && signature() !== PRISTINE;

/* Every GPU row carries its own editable rate per provider, not just the
   active one. Overrides live here; anything unset falls back to the study. */
const RATE_OV = {};
const rateOf = (gpuId, side) =>
  (RATE_OV[gpuId] && RATE_OV[gpuId][side] != null)
    ? RATE_OV[gpuId][side]
    : (gpuId === S.gpu ? S.rate[side] : rateFor(S.card, side, gpuId));

function paintDetail(m){
  const cols = SIDES;
  $("#tabs").textContent = "Rate card";

  $("#head").innerHTML = `<tr>
      <th style="width:23%">Item</th><th style="width:15%">Qty</th>` +
    cols.map(s=>`<th class="${s==="neb"?"me":""}"><span class="colhead">${SIDE_NAME[s]}
      ${s==="x"?`<button type="button" class="delcol" data-delcol="1" aria-label="Remove provider">&times;</button>`:""}
      </span></th>`).join("") + `</tr>`;
  $("#addcol").hidden = cols.length >= 4;

  const b = $("#body"); b.innerHTML = "";
  let grp = null;
  const sect = (id,label,unitHint,tip,key) => {
    grp = id;
    const tr = el("tr","sect");
    tr.innerHTML = `<td><span class="sectcell"><button type="button" class="sectbtn" data-sect="${id}" aria-expanded="${OPEN.has(id)}">
        <svg class="chev" width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M3.22 5.72a.75.75 0 0 1 1.06 0L8 9.44l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L3.22 6.78a.75.75 0 0 1 0-1.06Z"/></svg>
        ${label}</button><span class="hintu">${unitHint}</span>${tip?`<button type="button" class="info" data-tip="${tip}" aria-label="About ${label}">i</button>`:""}</span></td><td></td>` +
      cols.map(s=>`<td class="sub">${key?money(m.side[s][key]):""}</td>`).join("");
    b.appendChild(tr);
  };
  const line = (item,qty,cells,id) => {
    const key = id || (grp + ":" + item.replace(/<[^>]+>/g,""));
    if (GONE.has(key)) return;
    const tr = el("tr","row" + (OPEN.has(grp)?"":" hide"));
    tr.dataset.grp = grp; tr.dataset.row = key;
    tr.innerHTML = `<td><span class="rowcell">${item}
        <button type="button" class="delrow" data-del="${key}" title="Remove this line"
          aria-label="Remove ${item.replace(/<[^>]+>/g,"")}">&times;</button></span></td>
      <td class="q">${qty}</td>` +
      cells.map(c=>`<td class="n">${c}</td>`).join("");
    b.appendChild(tr);
  };
  const rateCell = (s,g) =>
    `<input class="num" inputmode="decimal" data-k="rate" data-side="${s}" data-gpu="${g.id}"
       value="${rateOf(g.id,s).toFixed(2)}" aria-label="${SIDE_NAME[s]} ${g.label} rate">`;

  sect("gpu","GPU","$ per GPU-hour","compute","compute");
  GPUS.forEach(g=> line(g.label,
    g.id===S.gpu
      ? `<input class="num" inputmode="decimal" data-k="qty" value="${S.qty}" aria-label="${g.label} quantity">`
      : `<input class="num" inputmode="decimal" data-k="pick" data-gpu="${g.id}" value="0" aria-label="Switch to ${g.label}">`,
    cols.map(s=>rateCell(s,g))));
  line("Orchestration", `<span class="inc">ongoing</span>`,
    cols.map(s=> s==="hyp" ? `<span class="inc">premium instances</span>` : `<span class="inc">included</span>`));

  sect("sto","Storage","$ per TB-month","storage","storage");
  [["hot","Hot"],["warm","Warm"],["cold","Cold"]].forEach(([t,label])=>{
    const tb = toTB(S[t].qty,S[t].unit);
    line(label,
      `<input class="num" inputmode="decimal" data-k="stoq" data-t="${t}" value="${S[t].qty}" aria-label="${label} storage"><span class="unit">${S[t].unit}</span>`,
      cols.map(s=> S[t].rate[s]
        ? `<input class="num" inputmode="decimal" data-k="stor" data-t="${t}" data-side="${s}" value="${S[t].rate[s].toFixed(2)}" aria-label="${SIDE_NAME[s]} ${label} rate"><span class="incl">${money(S[t].rate[s]*tb)}</span>`
        : `<span class="inc">&mdash;</span>`));
  });

  sect("net","Network","$ per month","network","network");
  Object.entries(NET).forEach(([k,cfg])=>{
    const q = S.net[k] ?? 0;
    const amt = cfg.per===HRS ? cfg.rate*q*HRS : cfg.rate*q*cfg.per;
    line(cfg.label,
      `<input class="num" inputmode="decimal" data-k="netq" data-t="${k}" value="${q}" aria-label="${cfg.label}"><span class="unit">${cfg.unit||"qty"}</span>`,
      cols.map(s=> s==="hyp" ? (amt? money2(amt) : "$0.00") : `<span class="inc">included</span>`));
  });

  sect("ctl","Control plane","$ per VM-hour","ctrl","ctrl");
  line("Login and scheduler",
    `<input class="num" inputmode="decimal" data-k="ctrl" value="${S.ctrl}" aria-label="Control plane machines"><span class="unit">vm</span>`,
    cols.map(s=> s==="hyp" ? money2(m.side.hyp.ctrl) : `<span class="inc">included</span>`));

  sect("sup","Support","% uplift on the bill","support","support");
  line("Tier", `<span class="inc">ongoing</span>`,
    cols.map(s=> s==="hyp" ? `${money(m.side.hyp.support)}<span class="incl">${(SUPPORT[S.support].pct*100).toFixed(2)}%</span>` : `<span class="inc">included</span>`));

  sect("eng","Your engineering","$ per engineer-year","eng","eng");
  line("Setup and tuning",
    `<input class="num" inputmode="decimal" data-k="setup" value="${S.setupEng.hyp}" aria-label="Setup engineer-months"><span class="unit">eng-mo</span>`,
    cols.map(s=> s==="neb" ? `<span class="inc">base case</span>` : money(m.side[s].setup)));
  line("Ongoing debugging",
    `<input class="num" inputmode="decimal" data-k="debug" value="${S.debugEng.hyp}" aria-label="Debugging engineers"><span class="unit">eng/mo</span>`,
    cols.map(s=> s==="neb" ? `<span class="inc">base case</span>` : money(m.side[s].debug)));
  line("Engineer cost",
    `<input class="num" inputmode="decimal" data-k="engYear" value="${S.engYear}" aria-label="Engineer cost"><span class="unit">/yr</span>`,
    cols.map(()=>`<span class="inc">your payroll</span>`));

  sect("fail","Cost of failure","never invoiced","failure","failure");
  [["mtbf","GPU-hours between failures","GPU-hr"],["tId","Time to identify","min"],["tRep","Time to repair","min"]]
    .forEach(([k,label,unit])=> line(label,
      `<span class="inc">from the study</span>`,
      cols.map(s=>`<input class="num" inputmode="decimal" data-k="good" data-g="${k}" data-side="${s}" value="${S.good[k][s]}" aria-label="${SIDE_NAME[s]} ${label}"><span class="unit">${unit}</span>`)));
  line("Goodput lost", `<span class="inc">${RESILIENCE[S.good.mode].label.toLowerCase()}</span>`,
    cols.map(s=>`<input class="num" inputmode="decimal" data-k="failOv" data-side="${s}" value="${Math.round(m.side[s].failure)}" aria-label="${SIDE_NAME[s]} cost of failure"><span class="incl">${pct(m.side[s].failurePct)}</span>`));

  const trM = el("tr","tot");
  trM.innerHTML = `<td>True cost per month</td><td></td>` +
    cols.map(s=>`<td class="n">${money(m.side[s].total)}</td>`).join("");
  b.appendChild(trM);
  const trY = el("tr","tot yr");
  trY.innerHTML = `<td>Cost per year</td><td></td>` +
    cols.map(s=>`<td class="n">${money(m.side[s].total*12)}</td>`).join("");
  b.appendChild(trY);

  sect("poc","Before the contract starts","one-off","poc");
  line("Proof of concept",
    `<input class="num" inputmode="decimal" data-k="poc" value="${S.poc}" aria-label="Proof of concept months"><span class="unit">months</span>`,
    cols.map(s=> m.side[s].poc===0 ? `<span class="inc">Free</span>` : money(m.side[s].poc)));

    $("#reset").hidden = !isDirty();
}

/* ---- count-up: the one authored motion moment ---- */
function countTo(node, to){
  if (matchMedia("(prefers-reduced-motion: reduce)").matches || node.dataset.at === String(to)){
    node.textContent = "$" + to.toFixed(2); node.dataset.at = String(to); return;
  }
  const from = parseFloat(node.dataset.at || 0), t0 = performance.now(), dur = 620;
  node.dataset.at = String(to);
  const step = t=>{
    const p = Math.min(1,(t-t0)/dur), e = 1-Math.pow(1-p,3);
    node.textContent = "$" + (from + (to-from)*e).toFixed(2);
    if (p<1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/* ===================================================================
   Events
   =================================================================== */
document.addEventListener("click", e=>{
  const r = e.target.closest("[data-r]");
  if (r){ loadRecipe(r.dataset.r); GONE.clear(); for (const k in RATE_OV) delete RATE_OV[k];
    render(); markClean(); render(); return; }

  const c = e.target.closest("[data-cmp]");
  if (c){ CMP = c.dataset.cmp; if (TAB!=="neb") TAB = CMP; render(); return; }

  const t = e.target.closest("[data-term]");
  if (t){ TERM = +t.dataset.term; render(); return; }

  const tab = e.target.closest("[data-tab]");
  if (tab){ TAB = tab.dataset.tab; render(); return; }

  const sb = e.target.closest("[data-sect]");
  if (sb){ const id=sb.dataset.sect; OPEN.has(id)?OPEN.delete(id):OPEN.add(id);
    document.querySelectorAll(`tr.row[data-grp="${id}"]`).forEach(r=>r.classList.toggle("hide",!OPEN.has(id)));
    sb.setAttribute("aria-expanded", OPEN.has(id)); return; }

  if (e.target.closest("#collapseAll")){
    const all = ["gpu","sto","net","ctl","sup","eng","fail","poc"];
    const allOpen = all.every(k=>OPEN.has(k));
    OPEN.clear(); if (!allOpen) all.forEach(k=>OPEN.add(k));
    render(); return;
  }

  const del = e.target.closest("[data-del]");
  if (del){ GONE.add(del.dataset.del); render(); return; }

  if (e.target.closest("#reset")){
    loadRecipe(S.key); GONE.clear(); for (const k in RATE_OV) delete RATE_OV[k];
    render(); markClean(); render(); return;
  }
  if (e.target.closest("#expand")){ toggleFS(); return; }
  if (e.target.closest("#fsback")){ toggleFS(false); return; }
  if (e.target.closest("#addcol")){
    if (!SIDES.includes("x")){
      SIDES = [...SIDES,"x"]; S.rate.x = S.rate.sil;
      ["hot","warm","cold"].forEach(t=>{ S[t].rate.x = S[t].rate.sil; });
      ["mtbf","tId","tRep","tInit"].forEach(f=>{ if (S.good[f]) S.good[f].x = S.good[f].sil; });
      S.setupEng.x = S.setupEng.sil; S.debugEng.x = S.debugEng.sil;
      render();
    }
    return;
  }
  if (e.target.closest("[data-delcol]")){ SIDES = SIDES.filter(s=>s!=="x"); render(); return; }

  if (e.target.closest("#pdf")){ printCard(e.target.closest("#pdf")); return; }

  const info = e.target.closest(".info");
  if (info){ showTip(info); return; }
  if (!e.target.closest("#tip")) hideTip();
});
document.addEventListener("keydown", e=>{
  if (e.key!=="Escape") return;
  if (document.querySelector("#tip.on")) return hideTip();
  if (FS) toggleFS(false);
});

/* Chrome's print dialog has a "Save as PDF" destination, which is the honest
   prototype path. Open every section first or the PDF prints eight subtotals
   and nothing else. A real build would render this server-side. */
function printCard(btn){
  const was = new Set(OPEN);
  ["gpu","sto","net","ctl","sup","eng","fail","poc"].forEach(k=>OPEN.add(k));
  render();
  const label = btn.textContent;
  btn.textContent = "Opening print\u2026";
  setTimeout(()=>{
    window.print();
    OPEN.clear(); was.forEach(k=>OPEN.add(k)); render();
    btn.textContent = label;
  }, 150);
}

function toggleFS(to){
  FS = (to===undefined) ? !FS : to;
  $("#detail").classList.toggle("fs", FS);
  $("#fsback").classList.toggle("on", FS);
  document.body.classList.toggle("locked", FS);
  const b = $("#expand");
  b.title = FS ? "Close full screen" : "Expand to full screen";
  b.setAttribute("aria-label", b.title);
}

document.addEventListener("input", e=>{
  const t = e.target;
  if (!t.classList.contains("num")) return;
  const raw = t.value.trim(), v = parseFloat(raw), k = t.dataset.k;
  const bad = raw !== "" && (isNaN(v) || v < 0);
  t.classList.toggle("bad", bad);
  t.setAttribute("aria-invalid", bad ? "true" : "false");
  if (bad || isNaN(v)) return;

  if (k==="pick"){
    if (v>0){ S.gpu = t.dataset.gpu; S.qty = Math.round(v);
      SIDES.forEach(x=>{ S.rate[x] = rateOf(S.gpu,x); });
      if (S.equalGpu) SIDES.filter(x=>x!=="neb").forEach(x=>{ S.rate[x] = S.rate.neb; });
      render(); }
    return;
  }
  if (k==="qty")           S.qty = Math.max(1, Math.round(v));
  else if (k==="rate"){
    const gpuId = t.dataset.gpu || S.gpu, side = t.dataset.side;
    (RATE_OV[gpuId] = RATE_OV[gpuId] || {})[side] = Math.max(0, v);
    if (gpuId === S.gpu) S.rate[side] = Math.max(0, v);
  }
  else if (k==="stoq")     S[t.dataset.t].qty = Math.max(0, v);
  else if (k==="stor")     S[t.dataset.t].rate[t.dataset.side] = Math.max(0, v);
  else if (k==="netq")     S.net[t.dataset.t] = Math.max(0, v);
  else if (k==="ctrl")     S.ctrl = Math.max(0, Math.round(v));
  else if (k==="setup"){   S.setupEng.hyp = S.setupEng.sil = Math.max(0,v); }
  else if (k==="debug"){   S.debugEng.hyp = S.debugEng.sil = Math.max(0,v); }
  else if (k==="engYear")  S.engYear = Math.max(0, v);
  else if (k==="poc"){     S.poc = Math.max(0, v); S.pocOv = {}; }
  else if (k==="good"){    S.good[t.dataset.g][t.dataset.side] = Math.max(0, v); S.failOv = {}; }
  else if (k==="failOv"){  S.failOv = S.failOv||{}; S.failOv[t.dataset.side] = Math.max(0, v); }
  else if (k==="pocOv"){   S.pocOv  = S.pocOv ||{}; S.pocOv[t.dataset.side]  = Math.max(0, v); }

  softRender(t);
});

/* re-render without stealing the caret from the field being typed in */
function softRender(active){
  const id = [active.dataset.k,active.dataset.t,active.dataset.g,active.dataset.side].join("|");
  const pos = active.selectionStart;
  render();
  const back = [...document.querySelectorAll(".num")]
    .find(n=>[n.dataset.k,n.dataset.t,n.dataset.g,n.dataset.side].join("|")===id);
  if (back){ back.focus(); try{ back.setSelectionRange(pos,pos); }catch(_){} }
}

/* ---- tooltip, portalled to body and clamped to the viewport ---- */
const STUDY_URL = "https://semianalysis.com/ai-cloud-tco-model/";
const tip = $("#tip"); let owner = null; let tipTimer = null;
function showTip(btn, fromHover){
  const d = TIPS[btn.dataset.tip]; if (!d) return;
  if (owner===btn){ if (!fromHover) hideTip(); return; }
  tip.innerHTML =
    `<h4>${d.t}</h4><p>${d.what}</p>${d.how?`<code>${d.how}</code>`:""}` +
    (d.why?`<h4>Why the difference</h4><p>${d.why}</p>`:"") +
    `<div class="src">${d.src} of
       <a href="${STUDY_URL}" target="_blank" rel="noopener">SemiAnalysis, Calculating the Total
       Cost of a GPU Cluster</a>, February 2026.</div>`;
  tip.classList.add("on");
  const r = btn.getBoundingClientRect(), h = tip.offsetHeight, w = tip.offsetWidth;
  const want = (r.bottom + h + 10 > innerHeight) ? r.top - h - 8 : r.bottom + 8;
  tip.style.left = Math.max(12, Math.min(r.left-8, innerWidth-w-12)) + "px";
  tip.style.top  = Math.max(12, Math.min(want, innerHeight-h-12)) + "px";
  btn.setAttribute("aria-describedby","tip"); owner = btn;
}
function hideTip(){ tip.classList.remove("on"); if (owner) owner.removeAttribute("aria-describedby"); owner = null; }
/* hover, not click. The dot is small and clicking to read a footnote is a
   tax; the delay on leave lets the pointer reach the source link inside. */
document.addEventListener("pointerover", e=>{
  const info = e.target.closest(".info");
  if (info){ clearTimeout(tipTimer); showTip(info, true); return; }
  if (e.target.closest("#tip")) clearTimeout(tipTimer);
});
document.addEventListener("pointerout", e=>{
  if (e.target.closest(".info") || e.target.closest("#tip")){
    clearTimeout(tipTimer); tipTimer = setTimeout(hideTip, 260);
  }
});
document.addEventListener("focusin", e=>{
  const info = e.target.closest(".info"); if (info) showTip(info, true);
});

addEventListener("scroll", hideTip, {passive:true});
addEventListener("resize", hideTip);

/* ---- layout stability: reserve the tallest reachable hero ---- */
function lockHero(){
  document.documentElement.style.removeProperty("--h-hero");
  let max = 0;
  const key = S.key, cmp = CMP, term = TERM;
  RECIPES.forEach(r=>{ loadRecipe(r.key);
    ["hyp","sil"].forEach(c=>{ CMP=c; [1,3].forEach(t=>{ TERM=t; render();
      max = Math.max(max, $("#hero").getBoundingClientRect().height); }); }); });
  document.documentElement.style.setProperty("--h-hero", Math.ceil(max)+"px");
  loadRecipe(key); CMP=cmp; TERM=term; render();
}

/* ===================================================================
   Boot
   =================================================================== */
loadRecipe("pre");
render();
lockHero();
markClean();
render();
window.__tco = {model, goodput, S:()=>S, render, RECIPES, loadRecipe};
