// netlify/functions/funnel-analyzer.js
// Phase 2 of the Campaign Builder: crawls a funnel page on the SwiftPath
// website and extracts the structured signals the blueprint generator needs
// (title, H1, hero copy, benefit bullets, cities mentioned, CTAs, form fields).
//
// Modes:
//   GET /funnel-analyzer?list=1              → list all known funnel pages
//   GET /funnel-analyzer?url=loans/foo.html  → analyze a single page
//
// Auth: shares GOOGLE_ADS_AGENT_SECRET with the rest of the agent.

const cheerio = require('cheerio');
const {
  handleOptions,
  errorResponse,
  jsonResponse,
  requireAuth
} = require('./lib/google-ads-client');

const SITE_BASE = 'https://swiftpathcapital.com';

// Hardcoded list of funnel pages discovered during the site audit.
// These are intentionally NOT linked from the homepage and are meant to be
// campaign landing pages. The builder will only analyze pages on this list.
const FUNNEL_PAGES = [
  {
    path: 'loans/arizona.html',
    theme: 'geo',
    label: 'Hard Money Loans in Arizona',
    focus: 'Phoenix, Tucson, Scottsdale, Mesa, Chandler'
  },
  {
    path: 'loans/texas.html',
    theme: 'geo',
    label: 'Hard Money Loans in Texas',
    focus: 'Dallas, Houston, Austin, San Antonio, Fort Worth'
  },
  {
    path: 'loans/florida.html',
    theme: 'geo',
    label: 'Hard Money Loans in Florida',
    focus: 'Miami, Tampa, Orlando, Jacksonville, Fort Lauderdale'
  },
  {
    path: 'loans/dscr.html',
    theme: 'product',
    label: 'DSCR Rental Loans',
    focus: 'Qualify on property cash flow, 30-year fixed'
  },
  {
    path: 'loans/fix-and-flip.html',
    theme: 'product',
    label: 'Fund Your Next Flip in Days',
    focus: 'Purchase + rehab, close in <7 days'
  },
  {
    path: 'loans/bridge.html',
    theme: 'product',
    label: 'Bridge the Gap',
    focus: 'Same-week funding, courthouse auctions'
  },
  {
    path: 'loans/new-construction.html',
    theme: 'product',
    label: 'Build From the Ground Up',
    focus: 'Lot + vertical, milestone draws'
  }
];

// Known US city/state mentions we care about. Case-insensitive match.
const KNOWN_CITIES = [
  // Arizona
  'Phoenix', 'Tucson', 'Scottsdale', 'Mesa', 'Chandler', 'Glendale', 'Gilbert', 'Tempe',
  // Texas
  'Dallas', 'Houston', 'Austin', 'San Antonio', 'Fort Worth', 'El Paso', 'Arlington', 'Plano',
  // Florida
  'Miami', 'Tampa', 'Orlando', 'Jacksonville', 'Fort Lauderdale', 'St. Petersburg', 'Hialeah', 'Tallahassee',
  // Other top investor markets that might show up in copy
  'Atlanta', 'Charlotte', 'Raleigh', 'Nashville', 'Las Vegas', 'Denver', 'Columbus', 'Indianapolis'
];

const KNOWN_STATES = [
  'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut',
  'Delaware', 'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa',
  'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan',
  'Minnesota', 'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire',
  'New Jersey', 'New Mexico', 'New York', 'North Carolina', 'North Dakota', 'Ohio',
  'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota',
  'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington', 'West Virginia',
  'Wisconsin', 'Wyoming'
];

// Loan product vocabulary we scan for — lets the blueprint generator know
// which products to emphasize for this funnel.
const PRODUCT_TERMS = [
  'fix-and-flip', 'fix and flip', 'fix & flip',
  'dscr', 'rental', 'brrrr',
  'bridge', 'new construction', 'ground up', 'ground-up',
  'hard money', 'private money', 'asset-based', 'asset based',
  'commercial', 'multifamily', 'multi-family', 'investment property'
];

async function fetchPage(path) {
  const url = `${SITE_BASE}/${path.replace(/^\/+/, '')}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'SwiftPath-CampaignBuilder/1.0 (+funnel-analyzer)'
    }
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url} — HTTP ${res.status}`);
  }
  const html = await res.text();
  return { url, html };
}

function extractCities(text) {
  const found = new Set();
  const lower = text.toLowerCase();
  for (const city of KNOWN_CITIES) {
    // Word-boundary match to avoid 'Mesa' matching 'mesas'.
    const re = new RegExp(`\\b${city.toLowerCase().replace(/\./g, '\\.')}\\b`);
    if (re.test(lower)) found.add(city);
  }
  return Array.from(found);
}

function extractStates(text) {
  const found = new Set();
  const lower = text.toLowerCase();
  for (const state of KNOWN_STATES) {
    const re = new RegExp(`\\b${state.toLowerCase()}\\b`);
    if (re.test(lower)) found.add(state);
  }
  return Array.from(found);
}

function extractProducts(text) {
  const found = new Set();
  const lower = text.toLowerCase();
  for (const term of PRODUCT_TERMS) {
    if (lower.includes(term)) found.add(term);
  }
  return Array.from(found);
}

function analyzePage(html, path) {
  const $ = cheerio.load(html);

  // Meta
  const title = ($('title').first().text() || '').trim();
  const metaDescription = $('meta[name="description"]').attr('content') || '';
  const canonical = $('link[rel="canonical"]').attr('href') || '';
  const ogTitle = $('meta[property="og:title"]').attr('content') || '';
  const ogDescription = $('meta[property="og:description"]').attr('content') || '';

  // Headings
  const h1s = $('h1').map((_, el) => $(el).text().trim()).get().filter(Boolean);
  const h2s = $('h2').map((_, el) => $(el).text().trim()).get().filter(Boolean);
  const h3s = $('h3').map((_, el) => $(el).text().trim()).get().filter(Boolean);

  // Hero copy — first section or top-of-page prose
  const heroSection = $('section').first();
  const heroText = heroSection.text().replace(/\s+/g, ' ').trim();
  const heroParagraphs = heroSection.find('p').map((_, el) => $(el).text().trim()).get().filter(Boolean);

  // Benefit bullets — cards typically use h3 + p pattern inside a grid
  const benefits = [];
  $('.grid > div, [class*="grid"] > div').each((_, el) => {
    const heading = $(el).find('h3, h4, strong').first().text().trim();
    const body = $(el).find('p').first().text().trim();
    if (heading && body) benefits.push({ heading, body });
  });

  // CTAs — buttons and prominent anchors
  const ctas = [];
  $('a[href], button').each((_, el) => {
    const $el = $(el);
    const text = $el.text().replace(/\s+/g, ' ').trim();
    const href = $el.attr('href') || '';
    const classAttr = $el.attr('class') || '';
    // Heuristic: CTA if text is short, looks like an action, and has a prominent class
    if (
      text.length > 0 &&
      text.length < 60 &&
      /bg-brand|btn|rounded-lg|font-bold/.test(classAttr) &&
      !/nav|header|footer|privacy|terms/i.test(classAttr)
    ) {
      ctas.push({ text, href });
    }
  });

  // Lead form fields
  const formFields = [];
  $('form input, form select, form textarea').each((_, el) => {
    const $el = $(el);
    const type = $el.attr('type') || $el.prop('tagName').toLowerCase();
    const name = $el.attr('name') || $el.attr('id') || '';
    const placeholder = $el.attr('placeholder') || '';
    // Skip honeypots
    if (/website|honey/i.test(name)) return;
    if (type === 'hidden') return;
    formFields.push({ type, name, placeholder });
  });

  // Select options (product types the user can pick) — hints at which
  // products this page actually funnels to
  const selectOptions = [];
  $('form select option').each((_, el) => {
    const val = $(el).text().trim();
    if (val && !/loan type|select/i.test(val)) selectOptions.push(val);
  });

  // Testimonials — italic quotes or .italic classes
  const testimonials = [];
  $('.italic, [class*="italic"]').each((_, el) => {
    const text = $(el).text().replace(/\s+/g, ' ').trim();
    if (text.length > 20 && text.length < 400) testimonials.push(text);
  });

  // Compliance / legal footer text
  const legal = [];
  $('footer, .footer-enhanced, [class*="footer"]').find('p').each((_, el) => {
    const t = $(el).text().replace(/\s+/g, ' ').trim();
    if (t && /loan|purpose|lend|housing|equal/i.test(t)) legal.push(t);
  });

  // Strip all script/style before getting full visible text
  $('script, style, noscript').remove();
  const fullText = $('body').text().replace(/\s+/g, ' ').trim();

  // Pattern extraction across the full visible text
  const citiesMentioned = extractCities(fullText);
  const statesMentioned = extractStates(fullText);
  const productsMentioned = extractProducts(fullText);

  // Resolve a theme from our hardcoded inventory
  const inventory = FUNNEL_PAGES.find(p => p.path === path) || null;

  return {
    path,
    url: canonical || `${SITE_BASE}/${path}`,
    inventory,
    meta: {
      title,
      metaDescription,
      canonical,
      ogTitle,
      ogDescription
    },
    headings: { h1: h1s, h2: h2s, h3: h3s },
    hero: {
      text: heroText.slice(0, 1000),
      paragraphs: heroParagraphs
    },
    benefits,
    ctas: dedupeBy(ctas, c => c.text).slice(0, 10),
    form: {
      fields: formFields,
      productOptions: selectOptions
    },
    testimonials: testimonials.slice(0, 5),
    legal,
    signals: {
      cities: citiesMentioned,
      states: statesMentioned,
      products: productsMentioned
    },
    fullTextLength: fullText.length
  };
}

function dedupeBy(arr, keyFn) {
  const seen = new Set();
  const out = [];
  for (const item of arr) {
    const k = keyFn(item);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return handleOptions();
  if (event.httpMethod !== 'GET') return errorResponse(405, 'Method Not Allowed');

  try {
    if (!requireAuth(event)) return errorResponse(401, 'Unauthorized');
  } catch (err) {
    return errorResponse(500, err.message);
  }

  try {
    const params = event.queryStringParameters || {};

    if (params.list === '1' || params.list === 'true') {
      return jsonResponse({ pages: FUNNEL_PAGES });
    }

    const rawPath = (params.url || params.path || '').trim();
    if (!rawPath) {
      return errorResponse(400, 'Missing required parameter: url (e.g. url=loans/arizona.html)');
    }

    // Security: only allow pages on the whitelist — no arbitrary URL fetching
    const normalized = rawPath.replace(/^\/+/, '');
    const allowed = FUNNEL_PAGES.some(p => p.path === normalized);
    if (!allowed) {
      return errorResponse(
        400,
        `Page not in funnel whitelist. Allowed: ${FUNNEL_PAGES.map(p => p.path).join(', ')}`
      );
    }

    const { html } = await fetchPage(normalized);
    const analysis = analyzePage(html, normalized);
    return jsonResponse({ analysis });
  } catch (err) {
    const msg = err.message || String(err) || 'Internal server error';
    console.error('funnel-analyzer error:', msg, err);
    return errorResponse(500, msg);
  }
};
