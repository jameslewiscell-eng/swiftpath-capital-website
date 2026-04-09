// netlify/functions/campaign-blueprint-background.js
// Phase 3 of the Campaign Builder — BACKGROUND function.
//
// Netlify background functions (*.js with -background suffix) return 202
// immediately and run for up to 15 minutes. We use that to bypass the 30s
// synchronous gateway timeout that was killing Opus generation calls.
//
// Flow:
//   Client POSTs { analysis, jobId } — gets 202 immediately
//   This function pulls live house style, calls Claude, validates result,
//   and stores { status, blueprint?, error?, validation?, usage? } in
//   Netlify Blobs under key `blueprint:<jobId>`
//   Client polls /campaign-blueprint-status?jobId=<jobId> for the result
//
// Auth: shares GOOGLE_ADS_AGENT_SECRET with the rest of the agent.
//
// Env vars required:
//   ANTHROPIC_API_KEY      — Claude API key
//   (inherits all google-ads-client env vars for the house-style pull)

const Anthropic = require('@anthropic-ai/sdk');
const { getStore } = require('@netlify/blobs');
const {
  getCustomer,
  handleOptions,
  errorResponse,
  requireAuth
} = require('./lib/google-ads-client');

const BLUEPRINT_STORE = 'campaign-blueprints';

// ── Hardcoded house rules ────────────────────────────────────────
//
// These never change — they reflect SwiftPath's business constraints
// (COP currency, 19-state geo set, phrase/exact only, business-purpose
// loans, etc). They are BOTH injected into Claude's system prompt AND
// validated against the generated output.

const ALLOWED_STATE_IDS = [
  21133, // Alabama
  21136, // Arizona
  21137, // California
  21138, // Colorado
  21142, // Florida
  21143, // Georgia
  21155, // Michigan
  21160, // North Carolina
  21164, // New Jersey
  21166, // Nevada
  21167, // New York
  21168, // Ohio
  21169, // Oklahoma
  21171, // Pennsylvania
  21173, // South Carolina
  21176, // Texas
  21178, // Virginia
  21180, // Washington
  21182  // Wisconsin
];

const STATE_ID_TO_NAME = {
  21133: 'Alabama', 21136: 'Arizona', 21137: 'California', 21138: 'Colorado',
  21142: 'Florida', 21143: 'Georgia', 21155: 'Michigan', 21160: 'North Carolina',
  21164: 'New Jersey', 21166: 'Nevada', 21167: 'New York', 21168: 'Ohio',
  21169: 'Oklahoma', 21171: 'Pennsylvania', 21173: 'South Carolina', 21176: 'Texas',
  21178: 'Virginia', 21180: 'Washington', 21182: 'Wisconsin'
};

const DEFAULT_BUDGET_COP = 40000;
const MAX_BUDGET_COP = 40000; // hard ceiling; user can override in UI later
const CURRENCY = 'COP';
const LANGUAGE_CONSTANT = 'languageConstants/1000'; // English

// ── House-style fetchers ─────────────────────────────────────────
//
// Pull live data from the existing "Leads-by Search 1" campaign so
// Claude has ground truth about negatives, top performers, and
// naming conventions.

async function fetchHouseStyle(customer) {
  // Existing negatives — campaign level + ad group level + shared sets
  const campaignNegatives = await customer.query(`
    SELECT
      campaign_criterion.keyword.text,
      campaign_criterion.keyword.match_type
    FROM campaign_criterion
    WHERE campaign_criterion.type = 'KEYWORD'
      AND campaign_criterion.negative = TRUE
      AND campaign.status != 'REMOVED'
  `);

  const topKeywords = await customer.query(`
    SELECT
      ad_group_criterion.keyword.text,
      ad_group_criterion.keyword.match_type,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.average_cpc
    FROM keyword_view
    WHERE segments.date DURING LAST_30_DAYS
      AND campaign.status != 'REMOVED'
      AND ad_group_criterion.negative = FALSE
    ORDER BY metrics.clicks DESC
    LIMIT 20
  `);

  const matchTypeName = n => ({ 2: 'EXACT', 3: 'PHRASE', 4: 'BROAD' })[n] || 'UNKNOWN';

  return {
    negatives: dedupeKeywords(
      campaignNegatives.map(r => ({
        text: r.campaign_criterion.keyword && r.campaign_criterion.keyword.text,
        matchType: matchTypeName(r.campaign_criterion.keyword && r.campaign_criterion.keyword.match_type)
      })).filter(k => k.text)
    ),
    topPerformers: topKeywords.map(r => ({
      text: r.ad_group_criterion.keyword.text,
      matchType: matchTypeName(r.ad_group_criterion.keyword.match_type),
      impressions: Number(r.metrics.impressions || 0),
      clicks: Number(r.metrics.clicks || 0),
      costCOP: Number(r.metrics.cost_micros || 0) / 1_000_000,
      cpcCOP: Number(r.metrics.average_cpc || 0) / 1_000_000
    }))
  };
}

function dedupeKeywords(arr) {
  const seen = new Set();
  const out = [];
  for (const k of arr) {
    const key = `${(k.text || '').toLowerCase()}|${k.matchType}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(k);
  }
  return out;
}

// ── System prompt ────────────────────────────────────────────────

function buildSystemPrompt(houseStyle) {
  const negList = houseStyle.negatives
    .map(n => `  - "${n.text}" (${n.matchType})`)
    .join('\n');

  const topList = houseStyle.topPerformers
    .slice(0, 15)
    .map(k => `  - "${k.text}" (${k.matchType}) — ${k.clicks} clicks, ${Math.round(k.cpcCOP)} COP CPC`)
    .join('\n');

  return `You are a Google Ads campaign architect for SwiftPath Capital, a private/hard-money lender for real estate investors. You generate restrictive, high-intent search campaigns that only target commercial/investor searchers — never consumer homeowners.

## HARD RULES — violating any of these rejects the blueprint

1. **Match types**: ONLY "PHRASE" or "EXACT". NEVER "BROAD". Broad match floods the account with irrelevant consumer traffic.
2. **Currency**: All monetary values are in Colombian Pesos (COP). Budget amounts in the blueprint must be expressed as integer COP (not micros, not dollars).
3. **Default daily budget**: ${DEFAULT_BUDGET_COP} COP. Do not exceed ${MAX_BUDGET_COP} COP unless explicitly told otherwise.
4. **Geo targeting**: ONLY the 19 approved US state IDs. Never global. Never outside the US.
   Approved state IDs: ${ALLOWED_STATE_IDS.join(', ')}
   For geo-specific funnels (e.g. loans/arizona.html), narrow to the SINGLE matching state.
   For product-theme funnels (e.g. loans/dscr.html), use ALL 19 states.
5. **Language**: English only (${LANGUAGE_CONSTANT}).
6. **Network**: Google Search only. No Search Partners. No Display Network. No YouTube.
7. **Negatives**: The final blueprint MUST inherit every keyword from the "INHERITED NEGATIVES" list below as additionalNegatives the builder will add on top of the existing campaign's set. In addition, you should add 8-15 page-specific negatives tuned to this funnel (e.g. for an Arizona page, add "university of arizona", "phoenix weather", "arizona state", etc.).
8. **Business-purpose only**: SwiftPath only makes business-purpose loans. Every RSA must include at least one headline or description reinforcing "business-purpose" / "investor-only" / "not for primary residence" to filter consumer traffic.
9. **Final URLs**: All ad final URLs must point to swiftpathcapital.com (never external). For a funnel page, use the page's #apply anchor as the primary final URL so the user lands at the lead form.
10. **RSA shape**: Each ad group must have exactly one RSA with 15 headlines (≤30 chars each) and 4 descriptions (≤90 chars each). path1 and path2 are ≤15 chars each.

## HOUSE STYLE — inherited from the existing "Leads-by Search 1" campaign

**Top-performing keywords (last 30 days) — use these as style references:**
${topList || '  (no data)'}

**INHERITED NEGATIVES — copy all of these verbatim into additionalNegatives (${houseStyle.negatives.length} total):**
${negList || '  (none)'}

## OUTPUT SHAPE

Return a single JSON object with this exact shape. No prose. No markdown. No explanation. Just the JSON.

\`\`\`json
{
  "campaign": {
    "name": "Leads — Search — <theme>",
    "status": "PAUSED",
    "advertisingChannelType": "SEARCH",
    "networkSettings": {
      "targetGoogleSearch": true,
      "targetSearchNetwork": false,
      "targetContentNetwork": false,
      "targetPartnerSearchNetwork": false
    },
    "campaignBudget": {
      "name": "<budget name>",
      "amountCOP": 40000,
      "deliveryMethod": "STANDARD"
    },
    "biddingStrategyTypeRef": "inherit_from_account",
    "geoTargetStateIds": [21136],
    "languages": ["languageConstants/1000"],
    "additionalNegatives": [
      { "text": "...", "matchType": "PHRASE" }
    ]
  },
  "adGroups": [
    {
      "name": "<ad group name>",
      "status": "ENABLED",
      "cpcBidCOP": 9500,
      "keywords": [
        { "text": "...", "matchType": "PHRASE" }
      ],
      "rsa": {
        "finalUrls": ["https://swiftpathcapital.com/loans/<page>.html#apply"],
        "path1": "<≤15 chars>",
        "path2": "<≤15 chars>",
        "headlines": ["15 items, each ≤30 chars"],
        "descriptions": ["4 items, each ≤90 chars"]
      }
    }
  ],
  "sitelinks": [
    {
      "text": "<≤25 chars>",
      "description1": "<≤35 chars>",
      "description2": "<≤35 chars>",
      "finalUrls": ["https://swiftpathcapital.com/..."]
    }
  ],
  "callouts": ["<≤25 chars>"],
  "structuredSnippets": [
    { "header": "SERVICE_CATALOG", "values": ["..."] }
  ]
}
\`\`\`

Be terse, specific, and respect every hard rule. Return ONLY the JSON object.`;
}

function buildUserPrompt(analysis) {
  return `Generate a CampaignBlueprint for this funnel page.

## Page analysis

\`\`\`json
${JSON.stringify(analysis, null, 2)}
\`\`\`

Apply the house style. For ad group structure: if this is a geo funnel (inventory.theme === "geo"), create 4-5 ad groups that split by product (Hard Money General, Fix & Flip, DSCR, Bridge, New Construction) — all narrowed to the single target state. If this is a product funnel (inventory.theme === "product"), create 3-5 ad groups that split by intent facet (core product terms, rate-shopping intent, "near me"/geo, specific sub-types) — all targeted to the full 19-state set.

Return ONLY the JSON blueprint. No prose.`;
}

// ── Validator ────────────────────────────────────────────────────

function validateBlueprint(bp, { houseStyleNegatives, expectedTheme }) {
  const errors = [];
  const warnings = [];

  if (!bp || typeof bp !== 'object') {
    return { valid: false, errors: ['Blueprint is not an object'], warnings: [] };
  }

  // Campaign shape
  const c = bp.campaign || {};
  if (!c.name) errors.push('campaign.name missing');
  if (c.advertisingChannelType !== 'SEARCH') errors.push('campaign.advertisingChannelType must be SEARCH');
  const ns = c.networkSettings || {};
  if (ns.targetSearchNetwork !== false) errors.push('networkSettings.targetSearchNetwork must be false');
  if (ns.targetContentNetwork !== false) errors.push('networkSettings.targetContentNetwork must be false');
  if (ns.targetPartnerSearchNetwork !== false) errors.push('networkSettings.targetPartnerSearchNetwork must be false');
  if (ns.targetGoogleSearch !== true) errors.push('networkSettings.targetGoogleSearch must be true');

  // Budget
  const amountCOP = c.campaignBudget && c.campaignBudget.amountCOP;
  if (!(amountCOP > 0)) errors.push('campaignBudget.amountCOP must be > 0');
  if (amountCOP > MAX_BUDGET_COP) errors.push(`campaignBudget.amountCOP ${amountCOP} exceeds MAX_BUDGET_COP ${MAX_BUDGET_COP}`);

  // Geo
  const stateIds = c.geoTargetStateIds || [];
  if (!Array.isArray(stateIds) || stateIds.length === 0) {
    errors.push('geoTargetStateIds must be a non-empty array');
  } else {
    for (const id of stateIds) {
      if (!ALLOWED_STATE_IDS.includes(id)) {
        errors.push(`geoTargetStateIds contains disallowed state ID ${id}`);
      }
    }
    if (expectedTheme === 'geo' && stateIds.length !== 1) {
      warnings.push(`Geo funnel should target exactly 1 state, got ${stateIds.length}`);
    }
    if (expectedTheme === 'product' && stateIds.length !== ALLOWED_STATE_IDS.length) {
      warnings.push(`Product funnel should target all ${ALLOWED_STATE_IDS.length} states, got ${stateIds.length}`);
    }
  }

  // Language
  const langs = c.languages || [];
  if (!langs.includes(LANGUAGE_CONSTANT)) errors.push(`languages must include ${LANGUAGE_CONSTANT}`);

  // Additional negatives must include every inherited negative, verbatim (case-insensitive)
  const addNeg = c.additionalNegatives || [];
  const addNegSet = new Set(addNeg.map(k => (k.text || '').toLowerCase().trim()));
  const missing = [];
  for (const inherited of houseStyleNegatives) {
    const needle = (inherited.text || '').toLowerCase().trim();
    if (needle && !addNegSet.has(needle)) missing.push(inherited.text);
  }
  if (missing.length > 0) {
    warnings.push(`additionalNegatives is missing ${missing.length} inherited negatives (will be auto-merged on create)`);
  }

  // Ad groups + keyword match type enforcement
  const adGroups = bp.adGroups || [];
  if (!Array.isArray(adGroups) || adGroups.length === 0) {
    errors.push('adGroups must be a non-empty array');
  }
  for (const ag of adGroups) {
    if (!ag.name) errors.push('ad group missing name');
    const kws = ag.keywords || [];
    if (kws.length === 0) warnings.push(`ad group "${ag.name}" has zero keywords`);
    for (const kw of kws) {
      if (kw.matchType !== 'PHRASE' && kw.matchType !== 'EXACT') {
        errors.push(`ad group "${ag.name}" keyword "${kw.text}" has disallowed matchType "${kw.matchType}" (must be PHRASE or EXACT)`);
      }
    }
    const rsa = ag.rsa || {};
    const heads = rsa.headlines || [];
    const descs = rsa.descriptions || [];
    if (heads.length !== 15) errors.push(`ad group "${ag.name}" must have exactly 15 headlines, has ${heads.length}`);
    if (descs.length !== 4) errors.push(`ad group "${ag.name}" must have exactly 4 descriptions, has ${descs.length}`);
    heads.forEach((h, i) => {
      if ((h || '').length > 30) errors.push(`ad group "${ag.name}" headline[${i}] "${h}" > 30 chars`);
    });
    descs.forEach((d, i) => {
      if ((d || '').length > 90) errors.push(`ad group "${ag.name}" description[${i}] "${d}" > 90 chars`);
    });
    if ((rsa.path1 || '').length > 15) errors.push(`ad group "${ag.name}" path1 > 15 chars`);
    if ((rsa.path2 || '').length > 15) errors.push(`ad group "${ag.name}" path2 > 15 chars`);
    for (const url of rsa.finalUrls || []) {
      if (!/^https:\/\/swiftpathcapital\.com\//.test(url)) {
        errors.push(`ad group "${ag.name}" final URL "${url}" must be on swiftpathcapital.com`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    counts: {
      adGroups: adGroups.length,
      positiveKeywords: adGroups.reduce((sum, ag) => sum + (ag.keywords || []).length, 0),
      additionalNegatives: addNeg.length,
      inheritedNegativesProvided: houseStyleNegatives.length,
      sitelinks: (bp.sitelinks || []).length,
      callouts: (bp.callouts || []).length
    }
  };
}

// ── Claude call ──────────────────────────────────────────────────

async function callClaude({ systemPrompt, userPrompt }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY env var is not set. Add it to Netlify before generating blueprints.');
  }

  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 8000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }]
  });

  // Extract text from the response
  const textBlocks = (response.content || []).filter(b => b.type === 'text');
  const raw = textBlocks.map(b => b.text).join('\n').trim();

  // Strip code fences if present
  let jsonStr = raw;
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) jsonStr = fenceMatch[1].trim();

  let parsed;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (err) {
    throw new Error(`Claude returned non-JSON output: ${err.message}. First 500 chars: ${raw.slice(0, 500)}`);
  }
  return { parsed, usage: response.usage };
}

// ── Blob storage helpers ────────────────────────────────────────

function getBlueprintStore() {
  // Netlify Blobs: scoped to this site automatically when running on Netlify
  return getStore({ name: BLUEPRINT_STORE, consistency: 'strong' });
}

async function writeJob(jobId, payload) {
  const store = getBlueprintStore();
  await store.setJSON(`blueprint:${jobId}`, {
    ...payload,
    updatedAt: new Date().toISOString()
  });
}

// ── Handler ──────────────────────────────────────────────────────
//
// Background functions in Netlify: Netlify returns 202 to the client as
// soon as the handler begins; we can return whatever we like from the
// handler (it's only logged, not sent to the client). So our job is to
// run to completion and write the result to Blob storage.

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return handleOptions();
  if (event.httpMethod !== 'POST') {
    return errorResponse(405, 'Method Not Allowed — use POST with {analysis, jobId} body');
  }

  try {
    if (!requireAuth(event)) return errorResponse(401, 'Unauthorized');
  } catch (err) {
    return errorResponse(500, err.message);
  }

  let jobId;
  try {
    const body = JSON.parse(event.body || '{}');
    jobId = body.jobId;
    const analysis = body.analysis;
    if (!jobId) {
      return errorResponse(400, 'Request body must include { jobId }');
    }
    if (!analysis || !analysis.path) {
      return errorResponse(400, 'Request body must include { analysis: <funnel-analyzer output> }');
    }

    // Mark the job as running ASAP so the client poller sees "pending"
    // instead of "unknown" on the first poll.
    try {
      await writeJob(jobId, {
        status: 'pending',
        path: analysis.path
      });
    } catch (e) {
      console.warn('Could not write initial pending marker:', e.message);
    }

    const account = body.account || 'swiftpath';
    const customer = getCustomer(account);

    // Pull live house style
    const houseStyle = await fetchHouseStyle(customer);

    // Compose prompts
    const systemPrompt = buildSystemPrompt(houseStyle);
    const userPrompt = buildUserPrompt(analysis);

    // Call Claude (may take 30-90s for Opus at this token count)
    const { parsed: blueprint, usage } = await callClaude({ systemPrompt, userPrompt });

    // Validate
    const expectedTheme = (analysis.inventory && analysis.inventory.theme) || null;
    const validation = validateBlueprint(blueprint, {
      houseStyleNegatives: houseStyle.negatives,
      expectedTheme
    });

    // Write the final result
    await writeJob(jobId, {
      status: 'ready',
      path: analysis.path,
      blueprint,
      validation,
      houseStyleStats: {
        inheritedNegativesCount: houseStyle.negatives.length,
        topPerformersCount: houseStyle.topPerformers.length
      },
      usage,
      stateLookup: STATE_ID_TO_NAME
    });

    return { statusCode: 202, body: JSON.stringify({ status: 'ready', jobId }) };
  } catch (err) {
    const msg = err.message || String(err) || 'Internal server error';
    console.error('campaign-blueprint-background error:', msg, err);
    if (jobId) {
      try {
        await writeJob(jobId, { status: 'error', error: msg });
      } catch (e) {
        console.error('Also failed to write error state:', e.message);
      }
    }
    return { statusCode: 202, body: JSON.stringify({ status: 'error', error: msg }) };
  }
};
