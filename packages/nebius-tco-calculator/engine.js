/* ===================================================================
   Nebius - Total cost of ownership
   Every constant below comes from SemiAnalysis, "Calculating the Total
   Cost of a GPU Cluster", February 2026. Section references are marked.
   The engine is pure: model(inputs) -> numbers. The renderer never
   computes, and nothing here touches the DOM above render().
   =================================================================== */

const HRS = 720;                 // hours per month, the study's convention (s2.2)
const ENG_YEAR = 200000;         // $/engineer-year, derived from s4.1 ($15,384.62/mo)
const ENG_MONTH = ENG_YEAR / 13; // the study runs 13 four-week months

/* Street price $/GPU-hour. Three cards because the study assumes a
   different pricing percentile in each scenario (s3.1-3.3, s4.1-4.3).
   The Nebius card is identical in all three. */
const CARDS = {
  s1: { // s4.1 - hyperscaler at the 50th-75th percentile
    neb:{h100:1.60,h200:1.84,b200:2.80,b300:3.20,gb200:3.50,gb300:4.00},
    hyp:{h100:2.06,h200:2.37,b200:4.27,b300:5.34,gb200:4.87,gb300:4.00},
    sil:{h100:1.56,h200:1.8525,b200:2.60,b300:2.93,gb200:3.50,gb300:4.00}
  },
  s2: { // s4.2 - hyperscaler at the 50th percentile
    neb:{h100:1.60,h200:1.84,b200:2.80,b300:3.20,gb200:3.50,gb300:4.00},
    hyp:{h100:1.72,h200:1.98,b200:3.56,b300:4.45,gb200:4.26,gb300:4.00},
    sil:{h100:1.68,h200:1.995,b200:2.80,b300:3.15,gb200:3.50,gb300:4.00}
  },
  s3: { // s4.3 - after the January 2026 H200 list increase
    neb:{h100:1.60,h200:1.84,b200:2.80,b300:3.20,gb200:3.50,gb300:4.00},
    hyp:{h100:1.97,h200:2.60,b200:4.68,b300:5.85,gb200:5.29,gb300:4.00},
    sil:{h100:1.56,h200:1.85,b200:2.60,b300:2.93,gb200:3.50,gb300:4.00}
  }
};

const GPUS = [
  {id:"h100", label:"H100"},
  {id:"h200", label:"H200"},
  {id:"b200", label:"B200"},
  {id:"b300", label:"B300"},
  {id:"gb200",label:"GB200 NVL72", per:72},
  {id:"gb300",label:"GB300 NVL72", per:72}
];

/* Hyperscaler network and control-plane rates (s4.1). Nebius and the
   silver-tier neocloud include all of these in the cluster price. */
const NET = {
  egress:{rate:0.09,  per:1000, unit:"TB", label:"Egress"},
  xfer:  {rate:0.01,  per:1000, unit:"TB", label:"Data transfer"},
  natp:  {rate:0.045, per:1000, unit:"TB", label:"NAT processing"},
  ip:    {rate:0.005, per:HRS,  unit:"",   label:"Public IP"},
  nat:   {rate:0.045, per:HRS,  unit:"",   label:"NAT gateway"},
  fw:    {rate:0.395, per:HRS,  unit:"",   label:"Firewall endpoint"}
};
const CTRL_RATE = 1.536; // $/vm-hr, hyperscaler only

/* Support is an uplift on the whole cloud bill, 3% to 10% by spend (s2.1).
   These three are back-solved from the study's own published subtotals. */
const SUPPORT = {
  business:  {pct:0.035126, label:"Business Support +"},
  enterprise:{pct:0.049789, label:"Enterprise Support"},
  unified:   {pct:0.055396, label:"Unified Operations"}
};

const RESILIENCE = {
  wait:     {label:"Wait for a repair"},
  restart:  {label:"Restart from a checkpoint"},
  tolerant: {label:"Fault tolerant in code"}
};

/* -------------------------------------------------------------------
   Recipes. The five names are Nebius's own solutions, from the site.
   Three map onto a published scenario. Two are derived and say so.
   Storage subtotals are carried verbatim from the study, because the
   study's own sheet does not hold one GiB-per-TB convention constant.
   ------------------------------------------------------------------- */
const RECIPES = [
{
  key:"pre", label:"Pre-training", card:"s1",
  source:"Scenario 1, Large LLM Pretrain (s4.1)", derived:false,
  gpu:"gb300", qty:5184, equalGpu:true,
  hot :{qty:500, unit:"TB", neb:27500, hyp:36250, sil:0},
  warm:{qty:500, unit:"TB", neb:0,     hyp:0,     sil:17500},
  cold:{qty:10,  unit:"PB", neb:73500, hyp:115000,sil:115000},
  net:{egress:100, xfer:500, natp:1, ip:1, nat:2, fw:0}, ctrl:3,
  support:"unified", setupEng:{hyp:4, sil:3}, debugEng:{hyp:1, sil:1}, poc:1,
  good:{mode:"restart", tChk:30, jSize:1024, bRadius:64,
        tInit:{neb:10,hyp:10,sil:15}, tId:{neb:15,hyp:15,sil:60},
        tRep:{neb:15,hyp:15,sil:60}, mtbf:{neb:25000,hyp:25000,sil:15000}}
},
{
  key:"post", label:"Post-training", card:"s2",
  source:"Scenario 2, Multimodal RL Research (s4.2)", derived:false,
  gpu:"b200", qty:2048, equalGpu:false,
  hot :{qty:25, unit:"PB", neb:1375000, hyp:1812500, sil:0},
  warm:{qty:25, unit:"PB", neb:0, hyp:0, sil:1750000},
  cold:{qty:0,  unit:"PB", neb:0, hyp:0, sil:0},
  net:{egress:100, xfer:500, natp:1, ip:1, nat:2, fw:0}, ctrl:3,
  support:"enterprise", setupEng:{hyp:2, sil:2}, debugEng:{hyp:1, sil:1}, poc:1,
  // Figure 7 uses the "job waits to restart" column, not the hot-spare restart
  good:{mode:"wait", tChk:60, jSize:64, bRadius:8,
        tInit:{neb:10,hyp:10,sil:15}, tId:{neb:15,hyp:15,sil:60},
        tRep:{neb:15,hyp:15,sil:60}, mtbf:{neb:25000,hyp:25000,sil:15000}}
},
{
  key:"inf", label:"Inference in production", card:"s3",
  source:"Scenario 3, Inference Endpoints (s4.3)", derived:false,
  gpu:"h200", qty:512, equalGpu:false,
  hot :{qty:1, unit:"PB", neb:27500, hyp:36250, sil:0},
  warm:{qty:1, unit:"PB", neb:0, hyp:0, sil:35000},
  cold:{qty:0, unit:"PB", neb:0, hyp:0, sil:0},
  net:{egress:100, xfer:500, natp:1, ip:1, nat:2, fw:0}, ctrl:3,
  support:"business", setupEng:{hyp:0.5, sil:0.5}, debugEng:{hyp:1, sil:1}, poc:1,
  good:{mode:"tolerant", tChk:0, tFail:5, jSize:8, bRadius:8,
        tInit:{neb:0,hyp:0,sil:0}, tId:{neb:15,hyp:15,sil:60},
        tRep:{neb:15,hyp:15,sil:480}, mtbf:{neb:25000,hyp:25000,sil:15000}}
},
{
  key:"exp", label:"Experimenting", card:"s2",
  source:"Derived from the study's method, not a published scenario", derived:true,
  gpu:"b200", qty:64, equalGpu:false,
  hot :{qty:128, unit:"TB", neb:7040, hyp:9280, sil:0},
  warm:{qty:128, unit:"TB", neb:0, hyp:0, sil:8960},
  cold:{qty:0, unit:"PB", neb:0, hyp:0, sil:0},
  net:{egress:20, xfer:50, natp:1, ip:1, nat:1, fw:0}, ctrl:1,
  support:"business", setupEng:{hyp:0.5, sil:0.5}, debugEng:{hyp:0.25, sil:0.25}, poc:1,
  good:{mode:"tolerant", tChk:0, tFail:5, jSize:8, bRadius:8,
        tInit:{neb:0,hyp:0,sil:0}, tId:{neb:15,hyp:15,sil:60},
        tRep:{neb:15,hyp:15,sil:480}, mtbf:{neb:25000,hyp:25000,sil:15000}}
},
{
  key:"sim", label:"Simulation and Physical AI", card:"s2",
  source:"Derived from the study's method, not a published scenario", derived:true,
  gpu:"b200", qty:512, equalGpu:false,
  hot :{qty:3, unit:"PB", neb:165000, hyp:217500, sil:0},
  warm:{qty:3, unit:"PB", neb:0, hyp:0, sil:210000},
  cold:{qty:0, unit:"PB", neb:0, hyp:0, sil:0},
  net:{egress:100, xfer:500, natp:1, ip:1, nat:2, fw:0}, ctrl:3,
  support:"enterprise", setupEng:{hyp:2, sil:2}, debugEng:{hyp:1, sil:1}, poc:1,
  good:{mode:"restart", tChk:30, jSize:128, bRadius:8,
        tInit:{neb:10,hyp:10,sil:15}, tId:{neb:15,hyp:15,sil:60},
        tRep:{neb:15,hyp:15,sil:60}, mtbf:{neb:25000,hyp:25000,sil:15000}}
}
];

/* Providers. The three built-ins plus one addable slot, so a salesperson can
   drop a real competing quote in beside the modelled ones. */
let SIDES = ["neb","hyp","sil"];
const ALL_SIDES = ["neb","hyp","sil","x"];
const SIDE_NAME = {
  neb:"Nebius", hyp:"A hyperscaler", sil:"A silver-tier neocloud", x:"Your quote"
};
// SIDE_COLOR paints fills (dots, bars). SIDE_INK paints text, one step darker.
const SIDE_COLOR = {neb:"var(--c-neb)", hyp:"var(--c-over)", sil:"var(--c-over)", x:"var(--c-over)"};
const SIDE_INK   = {neb:"var(--navy)",  hyp:"var(--navy)",  sil:"var(--navy)",  x:"var(--navy)"};
/* Real marks, fetched from the simple-icons set. "A hyperscaler" and
   "a silver-tier neocloud" are composites in the study, so each shows the
   class it is built from rather than claiming to be one named vendor. */
const LOGOS = {
  hyp:`<span class="marks">${["amazonwebservices","googlecloud","microsoftazure"]
        .map(n=>`<img src="logos/${n}.svg" alt="">`).join("")}</span>`,
  // No named marks under "silver-tier". Showing AWS under "a hyperscaler" is
  // neutral; labelling a named company silver-tier asserts lower reliability
  // about that company, which is a different and riskier claim.
  sil:""
};
const SIDE_SHORT = {neb:"Nebius", hyp:"hyperscaler", sil:"silver-tier", x:"your quote"};

/* The table shows Nebius plus the one selected comparator. Six provider
   columns forced 5px padding and 13px type; four affords the brand's own
   16px padding and 14px cells. */
function tableSides(){ return ["neb", SIDES.includes(WF_SIDE) ? WF_SIDE : SIDES[1]]; }

/* ===================================================================
   State
   =================================================================== */
let S = null;
function loadRecipe(key){
  const r = RECIPES.find(x=>x.key===key) || RECIPES[0];
  S = {
    key:r.key,
    gpu:r.gpu, qty:r.qty, equalGpu:r.equalGpu, card:r.card,
    rate:{...CARDS[r.card].neb && {}},           // filled below
    hot:{...r.hot}, warm:{...r.warm}, cold:{...r.cold},
    net:{...r.net}, ctrl:r.ctrl,
    support:r.support,
    setupEng:{...r.setupEng}, debugEng:{...r.debugEng},
    engYear:ENG_YEAR, poc:r.poc, failOv:{}, pocOv:{},
    good:JSON.parse(JSON.stringify(r.good)),
    meta:r
  };
  S.rate = {};
  SIDES.forEach(s=>{ S.rate[s] = rateFor(r.card, s, r.gpu); });
  if (r.equalGpu) SIDES.filter(s=>s!=="neb").forEach(s=>{ S.rate[s] = S.rate.neb; });
  // storage rate per TB, derived from the study's published subtotal
  ["hot","warm","cold"].forEach(t=>{
    const tb = toTB(S[t].qty, S[t].unit);
    S[t].rate = {};
    SIDES.forEach(s=>{ S[t].rate[s] = tb>0 ? (S[t][s==="x"?"sil":s]||0)/tb : 0; });
  });
  ["mtbf","tId","tRep","tInit"].forEach(f=>{
    if (S.good[f] && S.good[f].x == null) S.good[f].x = S.good[f].sil;
  });
  S.setupEng.x = S.setupEng.x ?? S.setupEng.sil;
  S.debugEng.x = S.debugEng.x ?? S.debugEng.sil;
}
// an added provider starts from the silver-tier profile, then is fully editable
const rateFor = (card,s,gpu)=> s==="x" ? CARDS[card].sil[gpu] : CARDS[card][s][gpu];
const toTB = (q,u)=> u==="PB" ? q*1000 : q;

/* ===================================================================
   Engine - pure
   =================================================================== */
function model(){
  const gpuHrs = S.qty * HRS;
  const out = {gpuHrs, side:{}};

  SIDES.forEach(s=>{
    const isNeb = s==="neb", isHyp = s==="hyp";   // only a hyperscaler unbundles network and support
    const compute = S.rate[s] * gpuHrs;

    const storage = ["hot","warm","cold"].reduce(
      (a,t)=> a + S[t].rate[s] * toTB(S[t].qty, S[t].unit), 0);

    // Nebius and the silver-tier neocloud include network and control plane
    let network = 0, ctrl = 0;
    if (isHyp){
      network = NET.egress.rate*S.net.egress*NET.egress.per
              + NET.xfer.rate  *S.net.xfer  *NET.xfer.per
              + NET.natp.rate  *S.net.natp  *NET.natp.per
              + NET.ip.rate    *S.net.ip    *HRS
              + NET.nat.rate   *S.net.nat   *HRS
              + NET.fw.rate    *S.net.fw    *HRS;
      ctrl = CTRL_RATE * S.ctrl * HRS;
    }

    const bill = compute + storage + network + ctrl;
    const support = isHyp ? bill * SUPPORT[S.support].pct : 0;

    const engMo = S.engYear/13;                                // the study runs 13 four-week months
    const setup = isNeb ? 0 : engMo * (S.setupEng[s]||0);      // engineer-months, total
    const debug = isNeb ? 0 : engMo * (S.debugEng[s]||0);

    let g = goodput(s, gpuHrs);
    if (S.failOv && S.failOv[s] != null) g = {...g, cost:S.failOv[s]};   // user override
    const invoiced = bill + support + setup + debug;

    out.side[s] = {
      compute, storage, network, ctrl, support, setup, debug,
      eng: setup + debug,          // the group total the table shows as one gap
      bill, invoiced,
      failure:g.cost, failurePct:g.pct, failures:g.failures, lostHrs:g.lost,
      poc: (S.pocOv && S.pocOv[s] != null) ? S.pocOv[s] : (isNeb ? 0 : S.rate[s] * gpuHrs * S.poc),
      total: invoiced + g.cost
    };
  });

  const base = out.side.neb.total;
  SIDES.forEach(s=>{
    const o = out.side[s];
    o.allIn = o.total / gpuHrs;
    o.ratio = o.total / base;
    o.deltaMo = o.total - base;
    o.year = o.total*12;
    o.year3 = o.total*36;
  });
  return out;
}

/* Goodput expense, s2.3. Three forms, chosen by what the job does
   when a node fails. All return GPU-hours lost, then dollars. */
function goodput(side, gpuHrs){
  const g = S.good;
  const mtbfGpu = g.mtbf[side];
  const mtbfCluster = mtbfGpu / S.qty;          // a bigger cluster fails more often
  const failures = HRS / mtbfCluster;

  const tId  = g.tId[side]/60;
  const tRep = g.tRep[side]/60;
  const tInit= (g.tInit[side]||0)/60;
  const tChk = (g.tChk||0)/60;
  const tFail= (g.tFail||0)/60;
  const j = g.jSize, b = g.bRadius;

  let perFailure;
  if (g.mode==="wait")          perFailure = ((tId + tChk/2) + tInit + tRep) * j;
  else if (g.mode==="restart")  perFailure = ((tId + tChk/2) + tInit) * j + tRep * b;
  else                          perFailure = (tId + tFail) * j + tRep * b;

  const lost = perFailure * failures;
  return {lost, failures, pct: lost/gpuHrs, cost: lost * S.rate[side]};
}

