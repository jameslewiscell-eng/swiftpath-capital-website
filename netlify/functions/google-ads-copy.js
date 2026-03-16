// netlify/functions/google-ads-copy.js
// AI-powered ad copy generation using Claude

const {
  handleOptions,
  errorResponse,
  jsonResponse,
  requireAuth
} = require('./lib/google-ads-client');

async function generateAdCopy({ campaignType, loanProduct, targetAudience, tone, existingHeadlines }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

  const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514';

  const systemPrompt = [
    'You are an expert Google Ads copywriter for SwiftPath Capital, a private money lender for real estate investors.',
    'SwiftPath offers DSCR loans, fix-and-flip loans, bridge loans, and new construction loans.',
    'Key selling points: fast funding (days not weeks), no tax returns required for DSCR, transparent pricing, business-purpose only.',
    '',
    'Return strict JSON with this structure:',
    '{',
    '  "responsive_search_ad": {',
    '    "headlines": ["headline1 (max 30 chars)", ... up to 15],',
    '    "descriptions": ["desc1 (max 90 chars)", ... up to 4]',
    '  },',
    '  "display_ad": {',
    '    "short_headline": "max 25 chars",',
    '    "long_headline": "max 90 chars",',
    '    "description": "max 90 chars"',
    '  },',
    '  "sitelink_extensions": [',
    '    { "text": "max 25 chars", "description1": "max 35 chars", "description2": "max 35 chars" }',
    '  ],',
    '  "callout_extensions": ["callout1 (max 25 chars)", ... up to 4]',
    '}',
    '',
    'Rules:',
    '- Never use misleading claims or guarantee approval',
    '- Include strong CTAs: Apply Now, Get Pre-Qualified, Schedule a Call',
    '- Reference speed, simplicity, and investor-focused messaging',
    '- Follow Google Ads editorial policies strictly',
    '- Each headline must be unique and under 30 characters',
    '- Each description must be under 90 characters'
  ].join('\n');

  const userPrompt = JSON.stringify({
    task: 'Generate Google Ads copy variations',
    campaignType: campaignType || 'search',
    loanProduct: loanProduct || 'general',
    targetAudience: targetAudience || 'real estate investors',
    tone: tone || 'professional and urgent',
    existingHeadlines: existingHeadlines || [],
    instructions: 'Generate fresh, high-converting ad copy. Avoid duplicating existing headlines if provided.'
  });

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model,
      max_tokens: 1200,
      temperature: 0.7,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }]
    })
  });

  const payload = await res.json();
  if (!res.ok) {
    throw new Error(`Anthropic API error: ${res.status} ${JSON.stringify(payload)}`);
  }

  const text = (payload.content || []).map(c => c.text || '').join('\n').trim();

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    const jsonStart = text.indexOf('{');
    const jsonEnd = text.lastIndexOf('}');
    if (jsonStart >= 0 && jsonEnd > jsonStart) {
      parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1));
    } else {
      throw new Error('Claude response was not valid JSON');
    }
  }

  return parsed;
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return handleOptions();
  if (event.httpMethod !== 'POST') return errorResponse(405, 'Method Not Allowed');
  if (!requireAuth(event)) return errorResponse(401, 'Unauthorized');

  try {
    const body = JSON.parse(event.body || '{}');
    const { campaignType, loanProduct, targetAudience, tone, existingHeadlines } = body;

    const adCopy = await generateAdCopy({
      campaignType,
      loanProduct,
      targetAudience,
      tone,
      existingHeadlines
    });

    return jsonResponse({ adCopy });
  } catch (err) {
    console.error('google-ads-copy error:', err.message || err);
    return errorResponse(500, err.message || 'Internal server error');
  }
};
