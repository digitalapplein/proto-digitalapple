/* ===================================================================
   Vodafone Business: the starting point for the working session.
   Assets and sections come from the FY27 catalogue shown in the
   27 Oct workshop deck. Agency fees come from the FY27 rate card
   (DA_FY27_Quote.xlsx), converted from GBP at 1.15. Every input,
   step, hour and day below is a starting estimate, to be replaced
   with Vodafone's numbers in the session.
   A new client is a new config file; the engine and screens stay.
   =================================================================== */

let _id = 0;
const uid = p => p + (++_id).toString(36) + Date.now().toString(36).slice(-3);

/* Starting guesses for each step: its phase, and how much less work and
   idle time it takes with AI. Every one can be changed on the step. */
function phaseFor(label){
  const l = label.toLowerCase();
  if (/market|local|translat/.test(l)) return "market";
  if (/approv|review|sign[- ]?off/.test(l)) return "approve";
  return "create";
}
function aiFor(label){
  const l = label.toLowerCase();
  if (/stock|licen|animat|film|shoot|record/.test(l)) return [0, 0];
  if (/approv|review|sign[- ]?off/.test(l)) return [30, 50];
  if (/market|local|translat|design/.test(l)) return [80, 50];
  if (/copy|script|story|draft|write/.test(l)) return [70, 50];
  if (/brief/.test(l)) return [50, 0];
  return [50, 30];
}
/* A step: hours of work, and days from start to finish. The estimates
   below are written as idle days plus the work, so days = idle + work. */
const step = (label, who, hours, idle, extra = {}) => {
  const [ai, aiWait] = aiFor(label);
  return {id: uid("s"), label, who, hours, days: idle + Math.ceil(hours / 7), rate: null, fee: 0, parallel: false, phase: phaseFor(label), ai, aiWait, comment: "", files: [], ...extra};
};
/* An input the asset cannot start without, and how long it takes to arrive. */
const input = (label, from, days) => ({id: uid("i"), label, from, days, example: "", files: []});
const usualInputs = size => [input("Product specs", "Product", SIZE[size].inWait), input("Positioning and messaging", "PMM", 0)];

/* FY27 rate card (DA_FY27_Quote.xlsx), standard rate before discount, in GBP:
   new, update, market version. Converted to euros at GBP. */
const GBP = 1.15;
const CARD = {
  "Pitch deck": [3500, 1750, 1200], "Product catalogue pages": [400, 200, 160], "Product brochure": [700, 350, 320],
  "Product factsheet": [350, 175, 160], "Customer FAQ": [525, 262.5, 240], "Explainer video": [3810, 1905, 600],
  "Social pack": [600, 300, 300], "Infographic": [525, 262.5, 0], "Blog or article": [900, 450, 0], "eBook": [3500, 1750, 0],
  "Recorded webinar": [1800, 900, 0], "Market or analyst report": [1750, 875, 0], "Threat report": [1050, 525, 0],
  "Security and compliance card": [350, 175, 0], "Portfolio catalogue": [3500, 1750, 0], "Excite video": [3810, 1905, 600],
  "Interactive product tour": [10000, 5000, 0], "Interactive calculator": [17500, 8750, 0], "Use cases, interactive or video": [17500, 8750, 0],
  "Interactive demo video": [15000, 7500, 0]
};
/* AEO pages have no rate-card line: the old way is priced like a blog. */
const AEO_LIKE = "Blog or article";

/* Starting estimates by size, so every asset opens with a working map. */
const SIZE = {
  small:  {inWait: 3, brief: 1, draft: 4,  rev: 1, revWait: 3, app: 1, appWait: 3, mkt: 2, mktWait: 2},
  medium: {inWait: 5, brief: 2, draft: 10, rev: 2, revWait: 4, app: 1, appWait: 4, mkt: 3, mktWait: 3},
  large:  {inWait: 7, brief: 3, draft: 24, rev: 4, revWait: 5, app: 2, appWait: 5, mkt: 6, mktWait: 4}
};
function estimateSteps(name, size = "medium", cardName = name){
  const z = SIZE[size], c = CARD[cardName], fee = c ? Math.round(c[0] * GBP) : 0, loc = c ? Math.round(c[2] * GBP) : 0;
  const out = [
    step("Brief", "PMM", z.brief, 0),
    fee ? step("Draft", "Agency", z.draft, 5, {fee}) : step("Draft", "PMM", z.draft, 1),
    step("Product review", "Product", z.rev, z.revWait),
    step("Brand and legal approval", "Brand, Legal", z.app, z.appWait)
  ];
  if (loc) out.push(step("Market version", "Agency", 0, 3, {fee: loc}));
  out.push(step(loc ? "Market review" : "Market version", "Market", z.mkt, z.mktWait, {phase: "market"}));
  return out;
}

/* Volumes a year: new assets, updates, market versions. An asset in
   the FY27 plan takes its plan volumes from the tiers it is made for
   (tiers) and which kinds of work it gets (rows: n new, u update,
   m market version); others keep their own volumes in want. */
const vol = v => Array.isArray(v) ? {n: v[0], u: v[1], m: v[2]} : {n: v || 0, u: 0, m: 0};
const ALL = ["L1", "L2", "L3"];
const asset = (name, o = {}) => ({
  id: uid("a"), name, size: o.size || "medium",
  inputs: o.inputs || usualInputs(o.size || "medium"), steps: o.steps || estimateSteps(name, o.size, o.card),
  desc: o.desc || "", output: o.output || "", route: o.route || "self", runs: o.runs ?? null, runPrice: o.runPrice ?? null, updatePct: 50,
  today: vol(o.today), want: vol(o.want ?? o.today), tiers: o.tiers || null, rows: o.rows || "num",
  buildsOn: o.buildsOn || "", ledBy: o.ledBy || "", variants: o.variants || "", nuances: "", optional: !!o.optional
});

/* How each asset is made with AI. kind decides what is paid:
   self = Vodafone's team in Amy, paying Amy per asset; dfy = Amy managed
   by DA, paying per asset (Navattic demos are managed, at their own price);
   agency = the agency fee as today, AI saves Vodafone's hours only. */
const ROUTES = [
  {key: "self",   label: "Amy self-service", kind: "self"},
  {key: "dfy",    label: "Amy managed",      kind: "dfy"},
  {key: "agency", label: "Agency",           kind: "agency"}
];

/* Benefits that are not cash: own lines and a strategic checklist.
   They sit under the business case and never enter its totals. */
function benefitsDefaults(){
  return {
    lines: [],
    strategic: [
      "Every asset on brand, made from approved templates",
      "Faster reply when a competitor moves or a product changes",
      "Found in AI answers in every market",
      "One place for approved content across markets",
      "The team spends its time on strategy, not production"
    ].map(text => ({id: uid("k"), text, on: true}))
  };
}

function vodafoneDefaults(){
  const A = {};
  const sec = (name, list, toolkit = true) => ({id: uid("g"), name, toolkit, assets: list.map(a => (A[a.id] = a, a.id))});

  /* Volumes a year start from the FY27 core plan (DA_FY27_Quote.xlsx,
     Core sheet): new launches, product enhancements, market expansions.
     Assets outside the quote start at one per launch (22), to be brought
     down in the session. New AI assets start at zero. */
  const L = 22, CORE = [22, 172, 287], VIDEO = [17, 161, 19];
  const inhouse = (name, size, buildsOn, extra = {}) => asset(name, {size, today: L, buildsOn, tiers: ALL, rows: "n", ...extra});
  const fresh = (name, size, route) => asset(name, {size, today: 0, want: 0, route});
  const aeo = name => asset(name, {size: "small", card: AEO_LIKE, today: 0, want: L, route: "self", buildsOn: "Messaging"});

  const sections = [
    sec("Marketing enablement", [
      inhouse("Market trends", "large", "", {inputs: [input("Analyst reports and desk research", "Portfolio marketing", 5), input("Social listening", "Agency", 5)]}),
      inhouse("Customer research", "large", "", {ledBy: "Research agency", inputs: [input("Qual and quant studies", "Research agency", 10)]}),
      inhouse("Buying group and personas", "medium", "Customer research"),
      inhouse("Buyer journey and discovery questions", "medium", "Buying group"),
      inhouse("Product spotlight", "medium", "Market trends"),
      inhouse("Product name", "small", "Product spotlight", {ledBy: "Brand", inputs: [input("Naming rules", "Brand", 0), input("Name testing", "Brand", 10)]}),
      inhouse("Ideal customer profiles", "medium", "Market trends, Customer research", {inputs: [input("Research", "PMM", 0), input("Sales input", "Sales", 5)]}),
      inhouse("Positioning and messaging", "medium", "Ideal customer profiles", {inputs: [input("Insights and ICPs", "PMM", 0), input("Product specs", "Product", 5)]}),
      inhouse("Segment messaging", "medium", "Positioning"),
      asset("Vertical messaging", {size: "medium", today: 0, want: L, route: "self", buildsOn: "Positioning"}),
      inhouse("Elevator pitches", "small", "Positioning"),
      inhouse("Boilerplate", "small", "Positioning"),
      inhouse("Product feature blocks", "medium", "Positioning"),
      inhouse("SEO keywords", "small", "Positioning"),
      inhouse("Battlecard", "medium", "Positioning"),
      inhouse("Useful stats", "small", "Customer research"),
      inhouse("One-page summary", "small", "Positioning"),
      inhouse("Portfolio marketing toolkit", "large", "Battlecard, One-page")
    ]),
    sec("Buyer-facing", [
      asset("Pitch deck", {size: "large", today: CORE, tiers: ALL, route: "dfy", buildsOn: "Messaging", ledBy: "Creative", variants: "Under 20 pages",
        output: "Customer-facing deck, under 20 pages, PowerPoint", inputs: [input("Product specs", "Product", 5), input("Positioning and messaging", "PMM", 0)], steps: [
        step("Brief", "PMM", 3, 0),
        step("Storyline and copy", "PMM", 10, 2),
        step("Design", "Agency", 24, 5, {fee: 4025}),
        step("Product review", "Product", 3, 4),
        step("Brand and legal approval", "Brand, Legal", 2, 5),
        step("Market version", "Agency", 0, 3, {fee: 1380}),
        step("Market review", "Market", 3, 3, {phase: "market"})
      ]}),
      asset("Product catalogue pages", {size: "small", today: CORE, tiers: ALL, route: "self", buildsOn: "Factsheet", ledBy: "Portfolio marketing"}),
      asset("Product brochure", {today: CORE, tiers: ALL, route: "dfy", buildsOn: "Messaging", ledBy: "Creative", variants: "2 pp, 4 pp",
        output: "Brochure, 2 or 4 pages, PDF", inputs: [input("Product specs", "Product", 5), input("Approved images", "Brand", 0)], steps: [
        step("Brief", "PMM", 2, 0),
        step("Copy", "PMM", 6, 2),
        step("Design", "Agency", 8, 5, {fee: 805}),
        step("Stock images", "External", 0, 0, {fee: 60, parallel: true}),
        step("Product review", "Product", 2, 3),
        step("Brand and legal approval", "Brand, Legal", 2, 4),
        step("Market version", "Agency", 0, 3, {fee: 368}),
        step("Market review", "Market", 2, 3, {phase: "market"})
      ]}),
      asset("Product factsheet", {size: "small", today: CORE, tiers: ALL, route: "dfy", buildsOn: "Positioning", ledBy: "Portfolio marketing", variants: "2 pp",
        output: "Factsheet, 2 pages, PDF", inputs: [input("Product specs", "Product", 5)], steps: [
        step("Copy", "PMM", 3, 0),
        step("Design", "Agency", 4, 3, {fee: 403}),
        step("Product review", "Product", 1, 3),
        step("Approval", "Brand, Legal", 1, 3),
        step("Market version", "Agency", 0, 3, {fee: 184}),
        step("Market review", "Market", 1, 2, {phase: "market"})
      ]}),
      asset("Customer FAQ", {size: "small", today: CORE, tiers: ALL, route: "self", buildsOn: "Factsheet", ledBy: "Portfolio marketing"}),
      asset("Interactive demo video", {size: "large", today: 0, want: 4, route: "dfy", runs: 1, runPrice: 4000, buildsOn: "Pitch deck"}),
      asset("Explainer video", {size: "large", today: VIDEO, tiers: ["L1"], route: "agency", buildsOn: "Messaging", ledBy: "Creative", variants: "Under 60 sec",
        output: "Animated video, under 60 seconds", inputs: [input("Approved messaging", "PMM", 0), input("Product screens", "Product", 3)], steps: [
        step("Script brief", "PMM", 3, 0),
        step("Script", "PMM", 6, 2),
        step("Script approval", "Product, Brand", 2, 4),
        step("Animation", "Agency", 30, 10, {fee: 4382}),
        step("Review rounds", "PMM, Product", 3, 5),
        step("Final approval", "Brand, Legal", 1, 3),
        step("Market version", "Agency", 0, 5, {fee: 690}),
        step("Market review", "Market", 1, 2, {phase: "market"})
      ]}),
      inhouse("Sales to customer email", "small", "Messaging"),
      asset("Social pack", {size: "small", today: VIDEO, tiers: ["L1"], route: "self", buildsOn: "Messaging", ledBy: "Portfolio marketing", variants: "3 posts"}),
      inhouse(".com presence", "small", "Messaging"),
      fresh("Video cutdowns", "small", "self"),
      asset("Demo video", {size: "large", today: L, tiers: ALL, rows: "n", route: "dfy", buildsOn: "Product spotlight"}),
      inhouse("Customer guide", "medium", "Product spotlight"),
      inhouse("Educational videos", "medium", "Product spotlight"),
      asset("Bite-size content", {size: "small", today: 0, tiers: [], rows: "n", optional: true, route: "self"}),
      asset("Infographic", {size: "small", today: 4, route: "self"}),
      asset("Blog or article", {size: "small", today: 0, want: 12, route: "self"}),
      asset("eBook", {size: "large", today: 0, tiers: [], rows: "n", optional: true, route: "self"}),
      asset("Recorded webinar", {today: 0, tiers: [], rows: "n", optional: true, route: "agency"}),
      asset("Portfolio catalogue", {size: "large", today: 0, tiers: [], rows: "n", optional: true, route: "dfy"}),
      asset("Excite video", {today: 0, tiers: [], rows: "n", optional: true, route: "agency"}),
      asset("Interactive product tour", {size: "large", today: 0, tiers: [], rows: "n", optional: true, route: "dfy", runs: 1, runPrice: 3000}),
      asset("Decision and ROI tool", {size: "large", today: 0, want: 1, route: "dfy"}),
      asset("Interactive use cases", {size: "large", today: 0, tiers: [], rows: "n", optional: true, route: "dfy"}),
      asset("Use case videos", {size: "large", today: 0, tiers: [], rows: "n", optional: true, route: "dfy"})
    ]),
    sec("Buyer technical", [
      inhouse("Customer presentation", "medium", "Pitch deck", {ledBy: "Product teams"}),
      inhouse("Solution architecture pack", "large", "Positioning", {ledBy: "Product teams"}),
      inhouse("Technical factsheet", "medium", "Positioning", {ledBy: "Product teams"}),
      inhouse("Security and compliance pack", "medium", "Positioning", {ledBy: "Product teams"}),
      inhouse("API and integration factsheet", "medium", "Technical factsheet", {ledBy: "Product teams"}),
      inhouse("Service guide", "large", "Technical factsheet", {ledBy: "Product teams"}),
      inhouse("Migration guide", "large", "Service guide", {ledBy: "Product teams"}),
      inhouse("Implementation guide", "large", "Service guide", {ledBy: "Product teams"})
    ]),
    sec("Onboarding", [
      inhouse("Customer welcome email", "small", "Messaging"),
      inhouse("Welcome FAQ", "small", "Customer FAQ"),
      inhouse("How-to guide, PDF", "medium", "Service guide"),
      inhouse("How-to guides, interactive", "medium", "How-to guide, PDF")
    ]),
    sec("Publish and update", [
      inhouse("Marketing Hub update", "small", "Portfolio marketing toolkit"),
      fresh("Monthly competitor updates", "small", "self")
    ]),
    sec("AEO templates", ["Comparison guide", "Buying guide", "How-to answer page", "Checklist", "FAQ answer page",
      "Glossary", "Use-case page", "Pricing explainer", "Best-for list", "Troubleshooting answer"].map(aeo)),

  ];

  /* What each asset is for, and what it produces: FY27 plan explainers and the toolkit timeline */
  const ABOUT = {
    "Market trends": ["Where the market is heading for this product: trends, competitors and buyer demand.", "Report, 5 to 6 pages"],
    "Customer research": ["What customers need and how they buy, from interviews and surveys.", "Key insights by market, deck"],
    "Ideal customer profiles": ["Who to sell to: the buying group, their roles, journey and opening questions.", "ICPs and personas, with the buying process"],
    "Positioning and messaging": ["Who the product is for, the problem it solves, why Vodafone, and the core messages for each audience.", "One document: positioning statement and message house"],
    "Segment messaging": ["The core messages adapted for each customer segment, such as small, mid-size and regulated businesses.", "Messaging by segment"],
    "Vertical messaging": ["The core messages adapted for each industry buyers search by.", "Messaging by industry"],
    "Boilerplate": ["The standard approved text about the product, reused in every asset.", "Short and long versions"],
    "Elevator pitches": ["Short pitches that sales and markets can say out loud.", "Elevator pitches, 12, 60 and 120 seconds"],
    "Product feature blocks": ["Approved copy for each product feature, ready for decks, web, email and social.", "Copy blocks by feature"],
    "Battlecard": ["Helps sales win against competitors.", "Why we win, comparisons, objection handling and qualifying questions"],
    "Product name": ["The approved name and logo for the product in every market.", "Approved product name and logo"],
    "One-page summary": ["The product on one page for internal teams, with use cases.", "One page, with use cases"],
    "Portfolio marketing toolkit": ["Everything market and sales teams need to launch the product, in one pack.", "Toolkit, strategic and tactical, 100+ pages"],
    "Marketing Hub update": ["Puts the toolkit and its content on the Marketing Hub for every team.", "Hub pages and assets, tagged"],
    "Monthly competitor updates": ["What competitors launched or changed this month, and how to respond.", "Monthly update, 1 to 2 pages"],
    "Buying group and personas": ["Who decides and who influences: the technology, finance and operations leaders and their daily challenges.", "Buying group and persona pages"],
    "Buyer journey and discovery questions": ["How buyers move to a decision, the questions to open with and the objections to expect.", "Buyer journey, discovery questions and objection handling"],
    "Product spotlight": ["What the product is, how it works across its lifecycle and how it compares, with an example customer journey.", "Product spotlight pages"],
    "SEO keywords": ["The search terms buyers use for this product, for web and AI answers.", "Keyword list"],
    "Useful stats": ["Sourced statistics that sales and content can quote.", "Stats sheet"],
    "Demo video": ["Shows the product working, for supplier selection and getting everyone on board.", "Demo video"],
    "Customer guide": ["A practical guide that helps buyers understand the problem and their options.", "Guide, PDF"],
    "Educational videos": ["Short videos that teach buyers about the problem and the solution.", "Short videos"],
    "Bite-size content": ["Short pieces cut from long reports and insight, for social and sales.", "Social posts, infographics and short videos"],
    "Decision and ROI tool": ["Helps buyers choose the right option and see the cost or saving for their case.", "Web tool"],
    "Interactive use cases": ["Clickable stories of customers using the product.", "Interactive page"],
    "Use case videos": ["Short videos of customers using the product.", "Video"],
    "Pitch deck": ["Presents the product to business customers in a selling meeting.", ""],
    "Product catalogue pages": ["The product's pages in the portfolio catalogue.", "Catalogue pages, under 2 pages"],
    "Product brochure": ["Shows the product's benefits and why Vodafone Business; a cut-down of the pitch deck.", ""],
    "Product factsheet": ["Key features and technical specifications for buyers.", ""],
    "Customer FAQ": ["Answers the questions buyers ask before they buy.", "FAQ, under 3 pages, PDF"],
    "Interactive demo video": ["A self-service tour of the product for buyers.", "Interactive demo, up to 7 features or journeys"],
    "Explainer video": ["What the product is, its benefits and why buy it from Vodafone Business.", ""],
    "Sales to customer email": ["Tells customer contacts that the product is now available or updated.", "Email, Word document"],
    "Social pack": ["Social posts that promote the launch.", "3 posts"],
    ".com presence": ["The product on the Vodafone Business website, where relevant.", "Web page copy and images"],
    "Video cutdowns": ["Short clips cut from longer videos for social and sales.", "Short clips, social formats"],
    "Customer presentation": ["The product explained for customers' technical teams.", "Deck"],
    "Solution architecture pack": ["How the solution is built and fits the customer's environment.", "Architecture diagrams and document"],
    "Technical factsheet": ["Technical specifications on one sheet.", "Factsheet, 2 pages"],
    "Security and compliance pack": ["How the product meets security and compliance needs.", "Word document"],
    "API and integration factsheet": ["How the product connects to other systems.", "Factsheet"],
    "Service guide": ["What the service includes and how support works.", "Word guide"],
    "Migration guide": ["How customers move from their current setup.", "Word guide"],
    "Implementation guide": ["How the product is set up and rolled out.", "Word guide"],
    "Customer welcome email": ["The first message after purchase: set-up steps and contacts.", "Email, Word document"],
    "Welcome FAQ": ["Answers new customers' likely questions in the first days.", "FAQ, under 3 pages"],
    "How-to guide, PDF": ["Helps customers use the product, with guided steps and tips.", "Guide, under 30 pages, Word template"],
    "How-to guides, interactive": ["Interactive guides for the main tasks in the product.", "3 guides, up to 7 features or journeys each"],
    "Comparison guide": ["Compares Vodafone with the alternatives buyers consider.", "Web page"],
    "Buying guide": ["Helps buyers choose, step by step.", "Web page"],
    "How-to answer page": ["Answers one 'how do I' question clearly.", "Web page"],
    "Checklist": ["What buyers should check before they decide.", "Web page"],
    "FAQ answer page": ["Short answers to common buyer questions.", "Web page"],
    "Glossary": ["Explains the terms buyers search for.", "Web page"],
    "Use-case page": ["Shows the product solving one buyer problem.", "Web page"],
    "Pricing explainer": ["Explains what drives the cost, so buyers can compare.", "Web page"],
    "Best-for list": ["Which option suits which buyer.", "Web page"],
    "Troubleshooting answer": ["Solves one common problem, step by step.", "Web page"],
    "Infographic": ["One visual that explains a fact or a process.", "Single image"],
    "Blog or article": ["An article on a topic buyers search for.", "Article"],
    "eBook": ["A long guide on one topic.", "eBook, over 20 pages"],
    "Recorded webinar": ["A recorded expert session for buyers.", "Video"],
    "Portfolio catalogue": ["All products and services in one document.", "Interactive PDF, over 20 pages"],
    "Excite video": ["A short video that builds interest in the launch.", "Video"],
    "Interactive product tour": ["An animated tour of the product.", "Interactive tour"],
  };
  Object.values(A).forEach(a => { const d = ABOUT[a.name]; if (d){ a.desc = d[0]; if (d[1] && !a.output) a.output = d[1]; } });

  const line = (label, value, unit, key) => ({id: uid("l"), label, value, unit, key: key || null, comment: ""});

  return {
    version: 16,
    view: "cash",
    client: {id: "vodafone-business", name: "Vodafone Business", project: "Content at scale with AI"},
    currency: "EUR",
    term: 3,
    sections,
    assets: A,
    routes: ROUTES,
    current: "toolkit",
    /* FY27 roadmap volumes (FY27 Portfolio Marketing Plan and
       DA_FY27_Quote.xlsx): L1 strategic, L2 non-strategic, L3 cluster.
       Updates are the quote's C1, C2 and C3. */
    plan: {
      launch: {L1: 17, L2: 2, L3: 3},
      expand: {L1: 19, L2: 1, L3: 104},
      update: {L1: 161, L2: 11, L3: 163},
      markets: 3
    },
    tobe: {
      groups: [
        {id: uid("t"), name: "People cost", lines: [
          line("Vodafone team", 100, "€ an hour", "rate"),
          line("Market teams", 100, "€ an hour", "marketRate")
        ]},
        {id: uid("t"), name: "Reviews", lines: [
          line("Updates and market versions", 50, "% of new", "approvalShare")
        ]},
        {id: uid("t"), name: "Amy platform", lines: [
          line("Seats", 60, "seats", "seats"),
          line("Price a seat", 95, "€ a month", "seatPrice")
        ]},
        {id: uid("t"), name: "Setup, one-off", lines: [
          line("Digital toolkit setup", 75000, "€", "setup"),
          line("Templates", null, "templates", "templates"),
          line("Price a template", 5000, "€", "templatePrice")
        ]},
        /* Amy's price for one asset, steering included (about three goes
           at €10/20/40 self-service and €60/120/240 managed) */
        {id: uid("t"), name: "Amy self-service, an asset", lines: [
          line("Small asset", 30, "€", "selfSmall"),
          line("Medium asset", 60, "€", "selfMedium"),
          line("Large asset", 120, "€", "selfLarge")
        ]},
        {id: uid("t"), name: "Amy managed, an asset", lines: [
          line("Small asset", 180, "€", "dfySmall"),
          line("Medium asset", 360, "€", "dfyMedium"),
          line("Large asset", 720, "€", "dfyLarge")
        ]},
        {id: uid("t"), name: "Fixed", hidden: true, lines: [
          line("Hours in a day", 7, "hours", "hoursPerDay"),
          line("Hours a year", 1600, "a person", "hoursYear"),
          line("Goes in Amy per asset", 1, "runs", "runs")
        ]}
      ]
    },
    bc: {
      lines: [],
      oneOff: []
    },
    benefits: benefitsDefaults()
  };
}
