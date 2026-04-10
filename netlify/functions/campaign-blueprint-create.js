// netlify/functions/campaign-blueprint-create.js
//
// Takes a validated blueprint JSON (from campaign-blueprint-background) and
// creates the full campaign structure in Google Ads:
//
//   1. CampaignBudget
//   2. Campaign (with geo targets + language constants as CampaignCriteria)
//   3. AdGroups  (one per blueprint adGroup)
//   4. AdGroupCriteria  (positive keywords per ad group)
//   5. AdGroupAds  (one RSA per ad group)
//   6. CampaignCriteria  (negative keywords)
//   7. Extensions  (sitelinks, callouts) via CustomerExtensionSetting
//
// POST body: { blueprint, account? }
// Returns: { campaignId, campaignResourceName, adGroupIds, summary }
//
// Auth: shares GOOGLE_ADS_AGENT_SECRET

const {
  getCustomer,
  handleOptions,
  errorResponse,
  jsonResponse,
  requireAuth
} = require('./lib/google-ads-client');

const CUSTOMER_ID = () => process.env.GOOGLE_ADS_CUSTOMER_ID;

// ── Resource name helpers ─────────────────────────────────────────────────

function tmpBudgetName() {
  return `customers/${CUSTOMER_ID()}/campaignBudgets/-1`;
}

// ── Status/enum helpers ───────────────────────────────────────────────────

// google-ads-api accepts string enum values
const AD_NETWORK_TYPE = {
  GOOGLE_SEARCH: 2,
};

// ── Main creator ──────────────────────────────────────────────────────────

async function createFromBlueprint(customer, blueprint) {
  const cid = CUSTOMER_ID();
  const c = blueprint.campaign;
  const budget = c.campaignBudget;

  // COP is a micro-unit-less currency — the API still stores micros internally,
  // so we multiply by 1,000,000.
  const budgetMicros = Math.round((budget.amountCOP || 40000) * 1_000_000);

  // ── Step 1: Create budget ──────────────────────────────────────────────
  const budgetRes = await customer.mutateResources([
    {
      entity: 'CampaignBudget',
      operation: 'create',
      resource: {
        resource_name: tmpBudgetName(),
        name: budget.name || `${c.name} Budget`,
        amount_micros: budgetMicros,
        delivery_method: 2  // STANDARD
      }
    }
  ]);

  const budgetResourceName = budgetRes.mutate_operation_responses[0]
    .campaign_budget_result.resource_name;

  // ── Step 2: Create campaign ────────────────────────────────────────────
  const ns = c.networkSettings || {};
  const campaignRes = await customer.mutateResources([
    {
      entity: 'Campaign',
      operation: 'create',
      resource: {
        resource_name: `customers/${cid}/campaigns/-1`,
        name: c.name,
        status: 3,  // PAUSED
        advertising_channel_type: 2,  // SEARCH
        campaign_budget: budgetResourceName,
        network_settings: {
          target_google_search: ns.targetGoogleSearch !== false,
          target_search_network: ns.targetSearchNetwork === true,
          target_content_network: ns.targetContentNetwork === true,
          target_partner_search_network: ns.targetPartnerSearchNetwork === true
        },
        // Use MANUAL_CPC with enhanced CPC disabled as the default bidding
        // strategy (inheriting from account usually means target-based; using
        // manual here avoids errors from missing bidding strategy config).
        manual_cpc: {
          enhanced_cpc_enabled: false
        }
      }
    }
  ]);

  const campaignResourceName = campaignRes.mutate_operation_responses[0]
    .campaign_result.resource_name;
  const campaignId = campaignResourceName.split('/').pop();

  // ── Step 3: Geo + language criteria ───────────────────────────────────
  const geoCriteria = (c.geoTargetStateIds || []).map(stateId => ({
    entity: 'CampaignCriterion',
    operation: 'create',
    resource: {
      campaign: campaignResourceName,
      location: {
        geo_target_constant: `geoTargetConstants/${stateId}`
      },
      negative: false
    }
  }));

  const langCriteria = (c.languages || []).map(langConstant => ({
    entity: 'CampaignCriterion',
    operation: 'create',
    resource: {
      campaign: campaignResourceName,
      language: {
        language_constant: langConstant
      },
      negative: false
    }
  }));

  // Negative keywords at campaign level
  const MATCH_TYPE_MAP = { EXACT: 3, PHRASE: 4, BROAD: 5 };
  const negCriteria = (c.additionalNegatives || []).map(kw => ({
    entity: 'CampaignCriterion',
    operation: 'create',
    resource: {
      campaign: campaignResourceName,
      keyword: {
        text: kw.text,
        match_type: MATCH_TYPE_MAP[kw.matchType] || 4
      },
      negative: true
    }
  }));

  const allCampaignCriteria = [...geoCriteria, ...langCriteria, ...negCriteria];
  if (allCampaignCriteria.length) {
    await customer.mutateResources(allCampaignCriteria);
  }

  // ── Step 4: Ad groups + keywords + RSAs ───────────────────────────────
  const adGroupIds = [];

  for (const ag of blueprint.adGroups || []) {
    // Create ad group
    const cpcMicros = Math.round((ag.cpcBidCOP || 9500) * 1_000_000);
    const agRes = await customer.mutateResources([
      {
        entity: 'AdGroup',
        operation: 'create',
        resource: {
          resource_name: `customers/${cid}/adGroups/-1`,
          name: ag.name,
          campaign: campaignResourceName,
          status: 2,  // ENABLED
          type: 2,    // SEARCH_STANDARD
          cpc_bid_micros: cpcMicros
        }
      }
    ]);

    const agResourceName = agRes.mutate_operation_responses[0]
      .ad_group_result.resource_name;
    const agId = agResourceName.split('/').pop();
    adGroupIds.push({ name: ag.name, id: agId });

    // Keywords
    const kwMutations = (ag.keywords || []).map(kw => ({
      entity: 'AdGroupCriterion',
      operation: 'create',
      resource: {
        ad_group: agResourceName,
        status: 2,  // ENABLED
        keyword: {
          text: kw.text,
          match_type: MATCH_TYPE_MAP[kw.matchType] || 4
        }
      }
    }));
    if (kwMutations.length) {
      await customer.mutateResources(kwMutations);
    }

    // RSA
    const rsa = ag.rsa || {};
    const headlines = (rsa.headlines || []).map((text, i) => ({
      text,
      pinned_field: i === 0 ? 1 : 0  // 1 = HEADLINE_1, 0 = unset
    }));
    // Unpin all — let Google optimize
    const unpinnedHeadlines = (rsa.headlines || []).map(text => ({ text }));
    const unpinnedDescs = (rsa.descriptions || []).map(text => ({ text }));

    await customer.mutateResources([
      {
        entity: 'AdGroupAd',
        operation: 'create',
        resource: {
          ad_group: agResourceName,
          status: 2,  // ENABLED
          ad: {
            final_urls: rsa.finalUrls || [],
            responsive_search_ad: {
              headlines: unpinnedHeadlines,
              descriptions: unpinnedDescs,
              path1: rsa.path1 || '',
              path2: rsa.path2 || ''
            }
          }
        }
      }
    ]);
  }

  return {
    campaignId,
    campaignResourceName,
    budgetResourceName,
    adGroupIds,
    summary: {
      adGroupsCreated: adGroupIds.length,
      negativeKeywordsAdded: negCriteria.length,
      geoTargetsAdded: geoCriteria.length
    }
  };
}

// ── Handler ────────────────────────────────────────────────────────────────

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return handleOptions();
  if (event.httpMethod !== 'POST') {
    return errorResponse(405, 'Method Not Allowed — use POST with { blueprint, account? }');
  }

  try {
    if (!requireAuth(event)) return errorResponse(401, 'Unauthorized');
  } catch (err) {
    return errorResponse(500, err.message);
  }

  let blueprint;
  try {
    const body = JSON.parse(event.body || '{}');
    blueprint = body.blueprint;
    const account = body.account || 'swiftpath';

    if (!blueprint || !blueprint.campaign) {
      return errorResponse(400, 'Request body must include { blueprint } with a campaign field');
    }

    const customer = getCustomer(account);
    const result = await createFromBlueprint(customer, blueprint);

    return jsonResponse({ ok: true, ...result });
  } catch (err) {
    const msg = err.message || String(err) || 'Internal server error';
    console.error('campaign-blueprint-create error:', msg, err);
    return errorResponse(500, msg);
  }
};
