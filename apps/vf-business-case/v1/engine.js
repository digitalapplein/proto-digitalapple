/* ===================================================================
   Business case engine. Pure: compute(state) -> numbers.
   Nothing here touches the page, and nothing here knows the client:
   every name and default comes from the config file.
   =================================================================== */

const num = v => (typeof v === "number" && isFinite(v)) ? v : 0;
const pct = v => num(v) / 100;

/* The value of a To-be assumption by its key. Lines without a key are
   notes for the session and do not enter the sums. */
function lever(state, key){
  for (const g of state.tobe.groups) for (const l of g.lines) if (l.key === key) return num(l.value);
  return 0;
}

/* A step's phase, and whose time it is. A step with a fee is bought
   outside and costed by its fee; otherwise its hours belong to the market
   teams when "Market" is in who does it, and to the Vodafone team if not. */
const phaseOf = s => s.phase || "create";
const isOut   = s => num(s.fee) > 0;
const teamOf  = s => /market/i.test(s.who || "") ? "market" : "central";
const teamRate = (state, s) => s.rate != null ? num(s.rate)
  : teamOf(s) === "market" ? (lever(state, "marketRate") || lever(state, "rate")) : lever(state, "rate");
function stepCost(state, s){ return isOut(s) ? num(s.fee) : num(s.hours) * teamRate(state, s); }

/* How an asset is made with AI, and what one run costs on that route.
   A run is one go in Amy; an asset takes several while it is steered.
   The run price follows the asset's size unless one is typed for it. */
function routeOf(state, a){
  return (state.routes || []).find(r => r.key === a.route) || (state.routes || [])[0] || {key: "self", label: "Amy self-service", kind: "self"};
}
const SIZES = {small: "Small", medium: "Medium", large: "Large"};
/* With Amy an asset is one step: Vodafone's review hours and the days it takes, typed on the asset (1 and 1 by default) */
const amyBlock = (state, a) => { const k = routeOf(state, a).kind; return k === "self" || k === "dfy"; };
const amyHours = a => a.amy && a.amy.hours != null && a.amy.hours !== "" ? num(+a.amy.hours) : 1;
const amyDays  = a => a.amy && a.amy.days  != null && a.amy.days  !== "" ? num(+a.amy.days)  : 1;
function runsOf(state, a){ return a.runs != null ? num(a.runs) : lever(state, "runs"); }
function runPriceOf(state, a){
  const r = routeOf(state, a);
  if (a.runPrice != null) return num(a.runPrice);
  if (r.kind !== "self" && r.kind !== "dfy") return 0;
  return lever(state, r.kind + (SIZES[a.size] || "Medium"));
}

/* When Amy makes an asset, it drafts, designs and adapts in minutes: each of
   those steps takes 15 minutes of team time and no waiting. The rest is in the brief and
   the reviews, which keep their own AI saving. Agency-made assets keep
   every step; AI saves Vodafone's hours on them only. */
const isReview = s => phaseOf(s) === "approve" || /review|approv|sign[- ]?off|brief/i.test(s.label || "");
const AMY_H = 0.25;
const amyMakes = (state, a, s, ai) => { if (!ai || isReview(s)) return false; const k = routeOf(state, a).kind; return k === "self" || k === "dfy"; };

/* The timeline of one asset, today or with AI. It starts once its inputs
   have arrived (they come in together; AI does not make them come sooner).
   Each step lasts its days: idle first, then the work. A step begins when
   the one before it ends, or with the one before it when it runs alongside.
   from = the day the asset may start (in a launch, when what it builds on
   is approved); its inputs are asked for on day 0 of the launch. */
function schedule(state, a, ai, from = 0){
  const hpd = lever(state, "hoursPerDay") || 7;
  const dep = (a.inputs || []).reduce((t, i) => Math.max(t, num(i.days)), 0);
  const go = from;   /* the process starts once its inputs are in, so waiting for them is not part of the cycle */
  let end = go, prevBegin = go;
  const work = {create: 0, approve: 0, market: 0};
  const blockAmy = ai && amyBlock(state, a); let amyDone = false;
  const rows = a.steps.map((s, i) => {
    if (blockAmy && phaseOf(s) !== "market"){
      const first = !amyDone; amyDone = true; const begin = end, stop = begin + (first ? amyDays(a) : 0);
      end = stop; prevBegin = begin; if (first) work.create += amyDays(a);
      return {id: s.id, phase: phaseOf(s), hours: first ? amyHours(a) : 0, begin, workStart: begin, stop};
    }
    const w0 = num(s.hours) / hpd, idle0 = Math.max(0, num(s.days) - w0);
    const amy = amyMakes(state, a, s, ai);
    const h = amy ? AMY_H : num(s.hours) * (ai ? 1 - pct(s.ai) : 1), idle = amy ? 0 : idle0 * (ai ? 1 - pct(s.aiWait) : 1);
    const par = s.parallel && i > 0;
    const begin = par ? prevBegin : end, workStart = begin + idle, stop = workStart + h / hpd;
    end = Math.max(end, stop); prevBegin = begin;
    if (!par) work[phaseOf(s)] += h / hpd;
    return {id: s.id, phase: phaseOf(s), hours: h, begin, workStart, stop};
  });
  const span = end - go, making = Math.min(span, work.create + work.market), approving = Math.min(span - making, work.approve);
  return {steps: rows, dep, held: go - from, start: from, end, elapsed: end - from, making, approving, idle: Math.max(0, span - making - approving)};
}

/* What one piece costs, by who is paid.
   mode: n = a new piece, u = an update, m = a market version.
   Today an update is a share of a new piece (the rate card's 50%).
   With AI, a priced route pays runs × the run price in place of the
   outside fees; Vodafone's own hours take each step's AI saving, and on
   updates and market versions their review and approval is a share of a
   new piece's. Agency fees stay as they are: AI saves Vodafone time only. */
const BUCKETS = ["central", "market", "agency", "other", "dfy", "self", "hCentral", "hMarket"];
const zero = () => Object.fromEntries(BUCKETS.map(k => [k, 0]));
function unitCost(state, a, steps, ai, mode){
  const r = routeOf(state, a), priced = ai && (r.kind === "self" || r.kind === "dfy");
  const upd = pct(a.updatePct ?? 50), appr = pct(lever(state, "approvalShare") || 50);
  const c = zero();
  if (priced && mode !== "m"){
    const sh = mode === "n" ? 1 : appr, h = amyHours(a) * sh;
    c.central += h * lever(state, "rate"); c.hCentral += h; c[r.kind] += runsOf(state, a) * runPriceOf(state, a); return c;
  }
  for (const s of steps){
    const review = phaseOf(s) === "approve" || mode === "m";
    const share = mode === "n" ? 1 : !ai ? (mode === "u" ? upd : 1) : review ? appr : upd;
    if (isOut(s)){ if (!priced) c[/agency/i.test(s.who || "") ? "agency" : "other"] += num(s.fee) * (mode === "u" ? upd : 1); continue; }
    const h = amyMakes(state, a, s, ai) ? AMY_H * share : num(s.hours) * share * (ai ? 1 - pct(s.ai) : 1), rr = teamRate(state, s);
    if (teamOf(s) === "market"){ c.market += h * rr; c.hMarket += h; } else { c.central += h * rr; c.hCentral += h; }
  }
  if (priced) c[r.kind] += runsOf(state, a) * runPriceOf(state, a);
  return c;
}
const money = c => c.central + c.market + c.agency + c.other + c.dfy + c.self;
function addTo(t, c, n){ for (const k of BUCKETS) t[k] += c[k] * n; return t; }

/* An asset's plan volumes from the roadmap, for the tiers it is made for.
   New pieces follow launches. Updates are C1 and C2; C3 updates roll out
   into cluster markets at the market version rate, so they count as
   market versions with the L3 expansions. */
function planVolumes(P, a){
  const t = a.tiers || [], on = k => (a.rows || "num").includes(k);
  const sum = (row, ks) => ks.reduce((s, k) => s + num(P[row] && P[row][k]), 0);
  return {n: on("n") ? sum("launch", t) : 0,
          u: on("u") ? sum("update", t.filter(k => k !== "L3")) : 0,
          m: on("m") ? sum("expand", t) + (t.includes("L3") ? sum("update", ["L3"]) : 0) : 0};
}

/* One asset: its cost per piece and its year, three ways.
   today = today's volumes, made as today
   old   = the plan's volumes, made as today
   ai    = the plan's volumes, made with AI */
function assetCase(state, a){
  const make = a.steps.filter(s => phaseOf(s) !== "market"), mkt = a.steps.filter(s => phaseOf(s) === "market");
  const units = ai => ({n: unitCost(state, a, make, ai, "n"), u: unitCost(state, a, make, ai, "u"), m: unitCost(state, a, mkt, ai, "m")});
  const v = o => ({n: num(o && o.n), u: num(o && o.u), m: num(o && o.m)});
  const today = v(a.today), want = a.tiers && state.plan ? planVolumes(state.plan, a) : v(a.want);
  const planned = want;
  const U = {old: units(false), ai: units(true)};
  const year = (Uv, vv) => addTo(addTo(addTo(zero(), Uv.n, vv.n), Uv.u, vv.u), Uv.m, vv.m);
  return {runs: runsOf(state, a), runPrice: runPriceOf(state, a), today, want, planned, unit: U,
    year: {today: year(U.old, today), old: year(U.old, planned), ai: year(U.ai, planned)},
    made: today.n + today.u + today.m > 0,
    pieces: {today: today.n + today.u + today.m, plan: planned.n + planned.u + planned.m},
    sched: {old: schedule(state, a, false), ai: schedule(state, a, true)}};
}

/* The joint case. Cash is what Vodafone pays out; team time is what its
   people spend. They are kept apart: cash is the budget, time is freed. */
function compute(state){
  const assets = [];
  for (const sec of state.sections) for (const id of sec.assets){
    const a = state.assets[id]; if (!a) continue;
    assets.push({id, name: a.name, section: sec.name, sectionId: sec.id, inKit: sec.toolkit !== false && !a.optional, route: routeOf(state, a), ...assetCase(state, a)});
  }
  const total = view => assets.reduce((t, x) => addTo(t, x.year[view], 1), zero());
  const T = {today: total("today"), old: total("old"), ai: total("ai")};
  const platform = lever(state, "seats") * lever(state, "seatPrice") * 12;
  const row = (key, label, cash) => ({key, label, cash, today: T.today[key], old: T.old[key], ai: T.ai[key]});
  const lines = [
    row("agency", "Agency fees", true),
    row("other", "Other outside costs", true),
    row("dfy", "Amy done-for-you", true),
    row("self", "Amy self-service", true),
    {key: "platform", label: "Amy platform", cash: true, today: 0, old: 0, ai: platform},
    ...state.bc.lines.map(l => ({key: "c:" + l.id, label: l.label, cash: true, today: num(l.today), old: num(l.old), ai: num(l.ai), custom: true})),
    row("central", "Vodafone team time", false),
    row("market", "Market team time", false)
  ];
  const hours = {central: {today: T.today.hCentral, old: T.old.hCentral, ai: T.ai.hCentral},
                 market:  {today: T.today.hMarket,  old: T.old.hMarket,  ai: T.ai.hMarket}};
  const sum = (k, cash) => lines.filter(l => l.cash === cash).reduce((t, l) => t + l[k], 0);
  const cash = {today: sum("today", true), old: sum("old", true), ai: sum("ai", true)};
  const time = {today: sum("today", false), old: sum("old", false), ai: sum("ai", false)};

  /* The one-off: the toolkit setup (solutioning, shadowing, process
     mapping, the business case, AEO research) and one template for each
     asset Amy makes in the plan, unless a number of templates is typed. */
  const amyAssets = assets.filter(x => (x.route.kind === "self" || x.route.kind === "dfy") && x.pieces.plan > 0);
  const autoTemplates = amyAssets.length;
  const tplTyped = state.tobe.groups.flatMap(g => g.lines).find(l => l.key === "templates");
  const typed = tplTyped && tplTyped.value != null && tplTyped.value !== "";
  const tplOf = x => lever(state, "template" + (SIZES[(state.assets[x.id] || {}).size] || "Medium")) || lever(state, "templatePrice");
  const templates = typed ? num(tplTyped.value) : autoTemplates;
  const templatesCost = typed ? templates * (lever(state, "templateMedium") || lever(state, "templatePrice")) : amyAssets.reduce((t, x) => t + tplOf(x), 0);
  const oneOffLines = [
    {key: "setup",     label: "Digital toolkit setup", ai: lever(state, "setup")},
    {key: "templates", label: "Templates",             ai: templatesCost, count: templates},
    ...state.bc.oneOff.map(l => ({key: "o:" + l.id, label: l.label, ai: num(l.ai), custom: true}))
  ];
  const oneOff = oneOffLines.reduce((t, l) => t + l.ai, 0);

  const Y = state.term;
  const cashTerm = {today: cash.today * Y, old: cash.old * Y, ai: cash.ai * Y + oneOff};
  const timeTerm = {today: time.today * Y, old: time.old * Y, ai: time.ai * Y};
  const saving = cashTerm.old - cashTerm.ai, timeSaving = timeTerm.old - timeTerm.ai;
  const ourCost = (T.ai.dfy + T.ai.self + platform) * Y + oneOff;
  const monthly = (cash.old - cash.ai) / 12;

  /* The budget with AI, year by year: one-off in year one, then the same
     each year. Amy is charged on use: an estimate, trued up each quarter. */
  const budgetLines = lines.filter(l => l.cash && l.ai).map(l => ({label: l.label, key: l.key, year: l.ai}));
  const budget = {lines: budgetLines, oneOff, years: Array.from({length: Y}, (_, i) => cash.ai + (i ? 0 : oneOff)), old: cash.old};

  const count = k => assets.reduce((t, x) => t + x.pieces[k], 0);
  return {assets, lines, hours, cash, time, oneOffLines, oneOff, templates, autoTemplates, years: Y, cashTerm, timeTerm,
          saving, savingPct: cashTerm.old ? saving / cashTerm.old : 0, timeSaving,
          roi: ourCost ? (saving + ourCost) / ourCost : 0,
          payback: monthly > 0 ? oneOff / monthly : null, budget,
          pieces: {today: count("today"), plan: count("plan")}};
}

/* One launch, the whole toolkit. Each asset starts when the assets it
   builds on are approved. Today counts assets made today; with AI counts
   the plan. The split follows the chain that finishes last. */
function toolkit(state, m, ai){
  const on = x => x.inKit && (ai ? x.planned.n : x.today.n) > 0;
  const list = m.assets.filter(on).map(x => state.assets[x.id]);
  const lc = s => s.toLowerCase();
  const depsOf = a => (a.buildsOn || "").split(/[,;]/).map(t => lc(t.trim())).filter(Boolean)
    .flatMap(t => list.filter(b => b.id !== a.id && (lc(b.name).includes(t) || t.includes(lc(b.name)))));
  const memo = {}, busy = new Set();
  const place = a => {
    if (memo[a.id]) return memo[a.id];
    if (busy.has(a.id)) return {start: 0, end: 0};
    busy.add(a.id);
    const deps = depsOf(a).map(place);
    const after = deps.reduce((b, d) => !b || d.end > b.end ? d : b, null);
    const sc = schedule(state, a, ai, after ? after.end : 0);
    return memo[a.id] = {id: a.id, name: a.name, start: sc.start, end: sc.end, sc, after: after && after.id};
  };
  const rows = list.map(place);
  const end = rows.reduce((t, r) => Math.max(t, r.end), 0);
  let cur = rows.reduce((b, r) => !b || r.end > b.end ? r : b, null);
  let dep = 0, making = 0, approving = 0;
  while (cur){ dep += cur.sc.held; making += cur.sc.making; approving += cur.sc.approving; cur = cur.after ? memo[cur.after] : null; }
  return {rows, end, dep, making, approving, idle: Math.max(0, end - dep - making - approving)};
}

/* Benefits that are counted but are not cash. Kept apart from compute()
   so nothing here can reach the business case totals.
   Today = today's volumes made as today; with AI = the plan, with AI. */
function benefits(state, m){
  const hy = lever(state, "hoursYear") || 1600;
  const k0 = toolkit(state, m, false), k1 = toolkit(state, m, true);
  const H = m.hours;
  const idleYear = (vk, sk) => m.assets.reduce((t, x) => t + (x[vk].n + x[vk].u) * x.sched[sk].idle, 0);
  const sumV = (vk, f) => m.assets.reduce((t, x) => t + f(x[vk], x), 0);
  return [
    {key: "launch", label: "Time to market, one launch", unit: "days", now: k0.end, ai: k1.end, better: "lower",
     how: "whole toolkit, first input to last approval"},
    {key: "wait", label: "Wait days in queues", unit: "days a year", now: idleYear("today", "old"), ai: idleYear("planned", "ai"), better: "lower",
     how: "wait days per asset × assets a year"},
    {key: "hours", label: "Vodafone team hours", unit: "hours a year", now: H.central.today, ai: H.central.ai, better: "lower",
     how: "Vodafone hours per asset × assets a year"},
    {key: "hours", label: "Market team hours", unit: "hours a year", now: H.market.today, ai: H.market.ai, better: "lower",
     how: "market hours per asset × assets a year"},
    {key: "people", label: "Team capacity", unit: "people's time", now: (H.central.today + H.market.today) / hy, ai: (H.central.ai + H.market.ai) / hy, better: "lower",
     how: "all team hours ÷ hours a year"},
    {key: "pieces", label: "Assets made", unit: "a year", now: m.pieces.today, ai: m.pieces.plan, better: "higher",
     how: "new, updates and market versions"},
    {key: "pieces", label: "Market versions", unit: "a year", now: sumV("today", v => v.m), ai: sumV("planned", v => v.m), better: "higher",
     how: "assets adapted for a market"},
    {key: "pieces", label: "New content not made today", unit: "a year", now: 0, ai: sumV("planned", (v, x) => x.made ? 0 : v.n + v.u + v.m), better: "higher",
     how: "assets with no volume today, at their plan volume"}
  ];
}

if (typeof module !== "undefined") module.exports = {compute, toolkit, benefits, schedule, lever};
