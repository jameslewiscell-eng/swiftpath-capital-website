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

function extractErrorDetail(errorObj) {
  if (!errorObj || typeof errorObj !== 'object') return null;

  const detail = {};

  // Extract error code (e.g. { field_error: 'REQUIRED' })
  if (errorObj.error_code && typeof errorObj.error_code === 'object') {
    const codeKey = Object.keys(errorObj.error_code)[0];
    if (codeKey) detail.errorCode = `${codeKey}: ${errorObj.error_code[codeKey]}`;
  }

  // Extract message
  if (typeof errorObj.message === 'string' && errorObj.message.trim()) {
    detail.message = errorObj.message.trim();
  }

  // Extract trigger value
  if (errorObj.trigger && typeof errorObj.trigger === 'object') {
    const triggerValue = errorObj.trigger.string_value || errorObj.trigger.int64_value;
    if (triggerValue != null) detail.trigger = String(triggerValue);
  }

  // Extract field path from location
  if (errorObj.location && errorObj.location.field_path_elements) {
    const parts = errorObj.location.field_path_elements.map(el => {
      const name = el.field_name || el.fieldName || '';
      const idx = el.index != null ? `[${el.index}]` : '';
      return `${name}${idx}`;
    });
    if (parts.length) detail.fieldPath = parts.join('.');
  }

  return Object.keys(detail).length ? detail : null;
}

function normalizeError(err) {
  if (!err) return 'Unknown server error';

  if (typeof err === 'string') {
    const trimmed = err.trim();
    return trimmed || 'Unknown server error';
  }

  const topLevelMessage =
    typeof err.message === 'string' ? err.message.trim() : '';
  const hasInformativeTopLevelMessage =
    topLevelMessage && topLevelMessage !== '[object Object]';

  // Check both err.failure.errors (google-ads-api v14+) and err.errors (direct)
  const errorsList = (err.failure && Array.isArray(err.failure.errors) && err.failure.errors.length)
    ? err.failure.errors
    : (err.errors && Array.isArray(err.errors) && err.errors.length)
      ? err.errors
      : null;

  if (errorsList) {
    const first = errorsList[0];

    if (typeof first === 'string') {
      const trimmed = first.trim();
      if (trimmed) return trimmed;
    }

    if (first && typeof first === 'object') {
      const detail = extractErrorDetail(first);
      const parts = [];
      const firstMessage = detail && detail.message
        ? detail.message
        : (hasInformativeTopLevelMessage ? topLevelMessage : 'Google Ads API operation failed');
      parts.push(firstMessage);
      if (detail && detail.errorCode) parts.push(`[${detail.errorCode}]`);
      if (detail && detail.fieldPath) parts.push(`at field: ${detail.fieldPath}`);
      if (detail && detail.trigger) parts.push(`trigger: "${detail.trigger}"`);
      return parts.join(' — ');
    }

    return hasInformativeTopLevelMessage
      ? topLevelMessage
      : 'Google Ads API operation failed';
  }

  if (hasInformativeTopLevelMessage) {
    return topLevelMessage;
  }

  try {
    const serialized = JSON.stringify(err);
    if (typeof serialized === 'string' && serialized.trim() && serialized !== '[object Object]') {
      return serialized;
    }
  } catch (_) {
    // Fallback handled below.
  }

  const fallbackString = String(err).trim();
  if (fallbackString && fallbackString !== '[object Object]') {
    return fallbackString;
  }

  return 'Google Ads API operation failed';
}

// ── Resource name helpers ─────────────────────────────────────────────────

function tmpBudgetName() {
  return `customers/${CUSTOMER_ID()}/campaignBudgets/-1`;
}


function uniqueBudgetName(baseName, context = '') {
  const MAX_BUDGET_NAME_LENGTH = 255;
  const MAX_SAFE_BASE_LENGTH = 180;
  const MAX_SAFE_CONTEXT_LENGTH = 40;
  const sanitizeNamePart = (value, fallback, maxLength) => {
    const candidate = (typeof value === 'string' && value.trim()) ? value.trim() : fallback;
    const cleaned = candidate
      .replace(/[\r\n[\]]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const normalized = cleaned || fallback;
    return normalized.slice(0, maxLength).trim();
  };
  const safeBase = sanitizeNamePart(baseName, 'Search Campaign Budget', MAX_SAFE_BASE_LENGTH);
  const safeContext = sanitizeNamePart(context, 'campaign', MAX_SAFE_CONTEXT_LENGTH);
  const epoch = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 7);
  const suffix = `[${safeContext}-${epoch}-${rand}]`;
  const separator = ' ';
  const maxBaseLength = Math.max(1, MAX_BUDGET_NAME_LENGTH - suffix.length - separator.length);
  const boundedBase = safeBase.slice(0, maxBaseLength).trim();
  return `${boundedBase}${separator}${suffix}`;
}

function validateBlueprintForCreate(blueprint) {
  const errors = [];
  const hasValue = value => String(value ?? '').trim().length > 0;
  if (!blueprint || typeof blueprint !== 'object') {
    return ['Blueprint payload must be an object.'];
  }

  if (!blueprint.campaign || typeof blueprint.campaign !== 'object') {
    errors.push('Blueprint must include a campaign object.');
  } else {
    if (typeof blueprint.campaign.name !== 'string' || !hasValue(blueprint.campaign.name)) {
      errors.push('Blueprint campaign.name must be a non-empty string.');
    }

    const budget = blueprint.campaign.campaignBudget;
    if (!budget || typeof budget !== 'object') {
      errors.push('Blueprint campaign must include a campaignBudget object.');
    } else {
      const amountCOP = Number(budget.amountCOP);
      if (!Number.isFinite(amountCOP) || amountCOP <= 0) {
        errors.push('Blueprint campaignBudget.amountCOP must be a positive number.');
      }
    }

    if (
      blueprint.campaign.geoTargetStateIds != null &&
      !Array.isArray(blueprint.campaign.geoTargetStateIds)
    ) {
      errors.push('Blueprint campaign.geoTargetStateIds must be an array when provided.');
    } else if (Array.isArray(blueprint.campaign.geoTargetStateIds)) {
      blueprint.campaign.geoTargetStateIds.forEach((stateId, idx) => {
        const isStringId = typeof stateId === 'string' && hasValue(stateId);
        const isFiniteNumericId = typeof stateId === 'number' && Number.isFinite(stateId);
        if (!isStringId && !isFiniteNumericId) {
          errors.push(
            `Blueprint campaign.geoTargetStateIds[${idx}] must be a non-empty string or finite number.`
          );
        }
      });
    }

    if (blueprint.campaign.languages != null && !Array.isArray(blueprint.campaign.languages)) {
      errors.push('Blueprint campaign.languages must be an array when provided.');
    } else if (Array.isArray(blueprint.campaign.languages)) {
      blueprint.campaign.languages.forEach((lang, idx) => {
        if (typeof lang !== 'string' || !hasValue(lang)) {
          errors.push(`Blueprint campaign.languages[${idx}] must be a non-empty string.`);
        }
      });
    }
  }

  if (!Array.isArray(blueprint.adGroups) || blueprint.adGroups.length === 0) {
    errors.push('Blueprint must include at least one ad group.');
    return errors;
  }

  blueprint.adGroups.forEach((ag, index) => {
    const idx = index + 1;
    if (!ag || typeof ag !== 'object') {
      errors.push(`Ad group #${idx} is missing.`);
      return;
    }

    if (typeof ag.name !== 'string' || !ag.name.trim()) {
      errors.push(`Ad group #${idx} name must be a non-empty string.`);
    }

    const rsa = ag.rsa || {};
    const adGroupLabel = (typeof ag.name === 'string' ? ag.name.trim() : '') || idx;

    const collectStringAssets = (values, fieldLabel) => {
      if (values == null) return [];
      if (!Array.isArray(values)) {
        errors.push(
          `Ad group "${adGroupLabel}" RSA ${fieldLabel}s must be an array of strings.`
        );
        return [];
      }
      const cleaned = [];
      values.forEach((item, itemIndex) => {
        if (typeof item !== 'string') {
          errors.push(
            `Ad group "${adGroupLabel}" has non-string RSA ${fieldLabel} at index ${itemIndex + 1}.`
          );
          return;
        }
        const trimmed = item.trim();
        if (trimmed) {
          cleaned.push(trimmed);
        }
      });
      return cleaned;
    };

    const finalUrls = collectStringAssets(rsa.finalUrls, 'final URL');
    const headlines = collectStringAssets(rsa.headlines, 'headline');
    const descriptions = collectStringAssets(rsa.descriptions, 'description');

    if (!finalUrls.length) {
      errors.push(`Ad group "${adGroupLabel}" must include at least one RSA final URL.`);
    }
    if (headlines.length < 3) {
      errors.push(`Ad group "${adGroupLabel}" must include at least 3 RSA headlines.`);
    }
    if (headlines.length > 15) {
      errors.push(`Ad group "${adGroupLabel}" must include no more than 15 RSA headlines.`);
    }
    if (descriptions.length < 2) {
      errors.push(`Ad group "${adGroupLabel}" must include at least 2 RSA descriptions.`);
    }
    if (descriptions.length > 4) {
      errors.push(`Ad group "${adGroupLabel}" must include no more than 4 RSA descriptions.`);
    }

    const keywordCount = cleanKeywordPayload(ag.keywords).length;
    if (keywordCount === 0) {
      errors.push(`Ad group "${adGroupLabel}" must include at least one non-empty keyword.`);
    }
  });

  const emptyNegativeCount = (Array.isArray(blueprint?.campaign?.additionalNegatives)
    ? blueprint.campaign.additionalNegatives
    : [])
    .filter(kw => !String((kw && kw.text) || '').trim()).length;
  if (emptyNegativeCount > 0) {
    errors.push('Blueprint campaign additionalNegatives contains empty keyword text values.');
  }

  return errors;
}

// ── Status/enum helpers ───────────────────────────────────────────────────

// google-ads-api accepts string enum values
const AD_NETWORK_TYPE = {
  GOOGLE_SEARCH: 2,
};

function cleanKeywordPayload(entries) {
  return (Array.isArray(entries) ? entries : [])
    .map(entry => ({
      text: String((entry && entry.text) || '').trim(),
      matchType: entry && entry.matchType
    }))
    .filter(entry => entry.text.length > 0);
}

function normalizeGeoTargetConstant(stateId) {
  const raw = String(stateId ?? '').trim();
  if (!raw) return null;
  return raw.startsWith('geoTargetConstants/')
    ? raw
    : `geoTargetConstants/${raw}`;
}

function normalizeLanguageConstant(language) {
  const raw = String(language ?? '').trim();
  if (!raw) return null;
  return raw.startsWith('languageConstants/')
    ? raw
    : `languageConstants/${raw}`;
}

// ── Main creator ──────────────────────────────────────────────────────────

async function createFromBlueprint(customer, blueprint) {
  const cid = CUSTOMER_ID();
  const c = blueprint.campaign;
  const budget = c.campaignBudget;
  const campaignName = c.name.trim();

  // COP is a micro-unit-less currency — the API still stores micros internally,
  // so we multiply by 1,000,000.
  const budgetMicros = Math.round((budget.amountCOP || 40000) * 1_000_000);

  // Negative keywords at campaign level
  const MATCH_TYPE_MAP = { EXACT: 3, PHRASE: 4, BROAD: 5 };

  // Helper: wrap mutate calls so failures include the step name for debugging.
  async function mutateStep(stepLabel, mutations) {
    try {
      return await customer.mutateResources(mutations);
    } catch (err) {
      // Annotate the error with the step that failed so the outer handler
      // can report *which* API call triggered the problem.
      err._blueprintStep = stepLabel;
      throw err;
    }
  }

  // ── Step 1: Create budget ──────────────────────────────────────────────
  const budgetRes = await mutateStep('CampaignBudget', [
    {
      entity: 'CampaignBudget',
      operation: 'create',
      resource: {
        resource_name: tmpBudgetName(),
        name: uniqueBudgetName(budget.name || `${campaignName} Budget`, campaignName),
        amount_micros: budgetMicros,
        delivery_method: 2  // STANDARD
      }
    }
  ]);

  const budgetResourceName = budgetRes.mutate_operation_responses[0]
    .campaign_budget_result.resource_name;

  // ── Step 2: Create campaign ────────────────────────────────────────────
  const ns = c.networkSettings || {};
  const campaignRes = await mutateStep('Campaign', [
    {
      entity: 'Campaign',
      operation: 'create',
      resource: {
        resource_name: `customers/${cid}/campaigns/-1`,
        name: campaignName,
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
  const geoCriteria = (Array.isArray(c.geoTargetStateIds) ? c.geoTargetStateIds : [])
    .map(normalizeGeoTargetConstant)
    .filter(Boolean)
    .map(geoTargetConstant => ({
    entity: 'CampaignCriterion',
    operation: 'create',
    resource: {
      campaign: campaignResourceName,
      location: {
        geo_target_constant: geoTargetConstant
      },
      negative: false
    }
    }));

  const langCriteria = (Array.isArray(c.languages) ? c.languages : [])
    .map(normalizeLanguageConstant)
    .filter(Boolean)
    .map(langConstant => ({
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

  const negCriteria = cleanKeywordPayload(c.additionalNegatives).map(kw => ({
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
    await mutateStep('CampaignCriteria', allCampaignCriteria);
  }

  // ── Step 4: Ad groups + keywords + RSAs ───────────────────────────────
  const adGroupIds = [];

  for (const ag of blueprint.adGroups || []) {
    // Create ad group
    const cpcMicros = Math.round((ag.cpcBidCOP || 9500) * 1_000_000);
    const adGroupName = typeof ag.name === 'string' ? ag.name.trim() : '';
    const agRes = await mutateStep(`AdGroup "${adGroupName}"`, [
      {
        entity: 'AdGroup',
        operation: 'create',
        resource: {
          resource_name: `customers/${cid}/adGroups/-1`,
          name: adGroupName,
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
    adGroupIds.push({ name: adGroupName, id: agId });

    // Keywords
    const kwMutations = cleanKeywordPayload(ag.keywords).map(kw => ({
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
      await mutateStep(`Keywords for "${adGroupName}"`, kwMutations);
    }

    // RSA
    const rsa = ag.rsa || {};
    // Unpin all — let Google optimize. Trim and drop blank values to avoid
    // "required field missing" API errors from empty asset entries.
    const unpinnedHeadlines = (rsa.headlines || [])
      .map(text => String(text || '').trim())
      .filter(Boolean)
      .map(text => ({ text }));
    const unpinnedDescs = (rsa.descriptions || [])
      .map(text => String(text || '').trim())
      .filter(Boolean)
      .map(text => ({ text }));
    const cleanFinalUrls = (rsa.finalUrls || [])
      .map(url => String(url || '').trim())
      .filter(Boolean);

    // Guard against sending an RSA with insufficient assets — the API
    // requires ≥3 headlines, ≥2 descriptions, and ≥1 final URL.
    if (unpinnedHeadlines.length < 3) {
      throw Object.assign(
        new Error(`Ad group "${adGroupName}" has only ${unpinnedHeadlines.length} non-empty headlines after trimming (minimum 3 required)`),
        { _blueprintStep: `RSA for "${adGroupName}"` }
      );
    }
    if (unpinnedDescs.length < 2) {
      throw Object.assign(
        new Error(`Ad group "${adGroupName}" has only ${unpinnedDescs.length} non-empty descriptions after trimming (minimum 2 required)`),
        { _blueprintStep: `RSA for "${adGroupName}"` }
      );
    }
    if (cleanFinalUrls.length < 1) {
      throw Object.assign(
        new Error(`Ad group "${adGroupName}" has no non-empty final URLs after trimming`),
        { _blueprintStep: `RSA for "${adGroupName}"` }
      );
    }

    const trimmedPath1 = String(rsa.path1 || '').trim();
    const trimmedPath2 = String(rsa.path2 || '').trim();
    const responsiveSearchAd = {
      headlines: unpinnedHeadlines,
      descriptions: unpinnedDescs
    };
    if (trimmedPath1) responsiveSearchAd.path1 = trimmedPath1;
    if (trimmedPath2) responsiveSearchAd.path2 = trimmedPath2;

    await mutateStep(`RSA for "${adGroupName}"`, [
      {
        entity: 'AdGroupAd',
        operation: 'create',
        resource: {
          ad_group: agResourceName,
          status: 2,  // ENABLED
          ad: {
            final_urls: cleanFinalUrls,
            responsive_search_ad: responsiveSearchAd
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

exports.handler = async function(event, context) {
  const requestId =
    (context && context.awsRequestId) ||
    (event && event.headers && (event.headers['x-nf-request-id'] || event.headers['X-Nf-Request-Id'])) ||
    '';

  if (event.httpMethod === 'OPTIONS') return handleOptions();
  if (event.httpMethod !== 'POST') {
    return errorResponse(405, 'Method Not Allowed — use POST with { blueprint, account? }');
  }

  try {
    if (!requireAuth(event)) return errorResponse(401, 'Unauthorized');
  } catch (err) {
    const authMsg = requestId ? `${err.message} (requestId: ${requestId})` : err.message;
    return errorResponse(500, authMsg);
  }

  let blueprint;
  try {
    const body = JSON.parse(event.body || '{}');
    blueprint = body.blueprint;
    const account = body.account || 'swiftpath';

    if (!blueprint || !blueprint.campaign) {
      return errorResponse(400, 'Request body must include { blueprint } with a campaign field');
    }
    const validationErrors = validateBlueprintForCreate(blueprint);
    if (validationErrors.length) {
      return errorResponse(400, `Blueprint validation failed: ${validationErrors.join(' ')}`);
    }

    const customer = getCustomer(account);
    const result = await createFromBlueprint(customer, blueprint);

    return jsonResponse({ ok: true, ...result });
  } catch (err) {
    const msg = normalizeError(err);
    const step = err._blueprintStep || 'unknown';
    const responseMessage = requestId
      ? `[${step}] ${msg} (requestId: ${requestId})`
      : `[${step}] ${msg}`;

    // Log full error details for debugging — including any nested errors
    // from the Google Ads API (error_code, location, trigger).
    const errorDetails = {
      requestId,
      step,
      message: msg,
    };
    const rawErrors = (err.failure && err.failure.errors) || err.errors;
    if (Array.isArray(rawErrors)) {
      errorDetails.googleAdsErrors = rawErrors.map(e => extractErrorDetail(e)).filter(Boolean);
    }
    console.error('campaign-blueprint-create error:', errorDetails);
    console.error('campaign-blueprint-create raw error:', err);
    return errorResponse(500, responseMessage);
  }
};
