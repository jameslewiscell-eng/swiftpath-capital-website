// netlify/functions/google-ads-report.js
// Performance reporting: pull metrics, date-range reports, keyword performance

const {
  getCustomer,
  handleOptions,
  errorResponse,
  jsonResponse,
  requireAuth
} = require('./lib/google-ads-client');

async function accountOverview(customer, dateRange) {
  const rows = await customer.query(`
    SELECT
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions,
      metrics.cost_per_conversion,
      metrics.average_cpc,
      metrics.ctr
    FROM customer
    WHERE segments.date DURING ${dateRange}
  `);

  if (!rows.length) {
    return { impressions: 0, clicks: 0, cost: 0, conversions: 0, cpc: 0, ctr: 0, conversionRate: 0, costPerConversion: 0 };
  }

  const m = rows[0].metrics;
  const clicks = Number(m.clicks || 0);
  const conversions = Number(m.conversions || 0);
  return {
    impressions: Number(m.impressions || 0),
    clicks,
    cost: Number(m.cost_micros || 0) / 1_000_000,
    conversions,
    cpc: Number(m.average_cpc || 0) / 1_000_000,
    ctr: Number(m.ctr || 0),
    conversionRate: clicks > 0 ? conversions / clicks : 0,
    costPerConversion: Number(m.cost_per_conversion || 0) / 1_000_000
  };
}

async function dailyPerformance(customer, dateRange) {
  const rows = await customer.query(`
    SELECT
      segments.date,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions
    FROM customer
    WHERE segments.date DURING ${dateRange}
    ORDER BY segments.date ASC
  `);

  return rows.map(row => ({
    date: row.segments.date,
    impressions: Number(row.metrics.impressions || 0),
    clicks: Number(row.metrics.clicks || 0),
    cost: Number(row.metrics.cost_micros || 0) / 1_000_000,
    conversions: Number(row.metrics.conversions || 0)
  }));
}

async function campaignPerformance(customer, dateRange) {
  const rows = await customer.query(`
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions,
      metrics.cost_per_conversion,
      metrics.ctr,
      metrics.average_cpc
    FROM campaign
    WHERE campaign.status != 'REMOVED'
      AND segments.date DURING ${dateRange}
    ORDER BY metrics.cost_micros DESC
  `);

  return rows.map(row => ({
    id: row.campaign.id,
    name: row.campaign.name,
    status: row.campaign.status,
    impressions: Number(row.metrics.impressions || 0),
    clicks: Number(row.metrics.clicks || 0),
    cost: Number(row.metrics.cost_micros || 0) / 1_000_000,
    conversions: Number(row.metrics.conversions || 0),
    costPerConversion: Number(row.metrics.cost_per_conversion || 0) / 1_000_000,
    ctr: Number(row.metrics.ctr || 0),
    cpc: Number(row.metrics.average_cpc || 0) / 1_000_000
  }));
}

async function keywordPerformance(customer, dateRange) {
  const rows = await customer.query(`
    SELECT
      ad_group_criterion.keyword.text,
      ad_group_criterion.keyword.match_type,
      campaign.name,
      ad_group.name,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions,
      metrics.ctr,
      metrics.average_cpc
    FROM keyword_view
    WHERE segments.date DURING ${dateRange}
      AND campaign.status != 'REMOVED'
    ORDER BY metrics.cost_micros DESC
    LIMIT 50
  `);

  return rows.map(row => ({
    keyword: row.ad_group_criterion.keyword.text,
    matchType: row.ad_group_criterion.keyword.match_type,
    campaign: row.campaign.name,
    adGroup: row.ad_group.name,
    impressions: Number(row.metrics.impressions || 0),
    clicks: Number(row.metrics.clicks || 0),
    cost: Number(row.metrics.cost_micros || 0) / 1_000_000,
    conversions: Number(row.metrics.conversions || 0),
    ctr: Number(row.metrics.ctr || 0),
    cpc: Number(row.metrics.average_cpc || 0) / 1_000_000
  }));
}

async function negativeKeywords(customer) {
  // Campaign-level negative keywords
  const campaignNegatives = await customer.query(`
    SELECT
      campaign.id,
      campaign.name,
      campaign_criterion.criterion_id,
      campaign_criterion.negative,
      campaign_criterion.keyword.text,
      campaign_criterion.keyword.match_type,
      campaign_criterion.type
    FROM campaign_criterion
    WHERE campaign_criterion.type = 'KEYWORD'
      AND campaign_criterion.negative = TRUE
      AND campaign.status != 'REMOVED'
  `);

  // Ad-group-level negative keywords
  let adGroupNegatives = [];
  try {
    adGroupNegatives = await customer.query(`
      SELECT
        campaign.id,
        campaign.name,
        ad_group.id,
        ad_group.name,
        ad_group_criterion.criterion_id,
        ad_group_criterion.negative,
        ad_group_criterion.keyword.text,
        ad_group_criterion.keyword.match_type
      FROM ad_group_criterion
      WHERE ad_group_criterion.type = 'KEYWORD'
        AND ad_group_criterion.negative = TRUE
        AND campaign.status != 'REMOVED'
    `);
  } catch (e) {
    console.warn('ad_group negatives query failed:', e.message);
  }

  // Shared negative keyword lists attached to campaigns
  let sharedSetKeywords = [];
  let sharedSetLinks = [];
  try {
    sharedSetLinks = await customer.query(`
      SELECT
        campaign.id,
        campaign.name,
        shared_set.id,
        shared_set.name,
        shared_set.type,
        shared_set.status
      FROM campaign_shared_set
      WHERE shared_set.type = 'NEGATIVE_KEYWORDS'
        AND campaign.status != 'REMOVED'
    `);

    sharedSetKeywords = await customer.query(`
      SELECT
        shared_set.id,
        shared_set.name,
        shared_criterion.criterion_id,
        shared_criterion.keyword.text,
        shared_criterion.keyword.match_type,
        shared_criterion.type
      FROM shared_criterion
      WHERE shared_criterion.type = 'KEYWORD'
        AND shared_set.type = 'NEGATIVE_KEYWORDS'
        AND shared_set.status = 'ENABLED'
    `);
  } catch (e) {
    console.warn('shared negatives query failed:', e.message);
  }

  return {
    campaignNegatives: campaignNegatives.map(r => ({
      campaignId: r.campaign.id,
      campaignName: r.campaign.name,
      criterionId: r.campaign_criterion.criterion_id,
      keyword: r.campaign_criterion.keyword && r.campaign_criterion.keyword.text,
      matchType: r.campaign_criterion.keyword && r.campaign_criterion.keyword.match_type
    })),
    adGroupNegatives: adGroupNegatives.map(r => ({
      campaignId: r.campaign.id,
      campaignName: r.campaign.name,
      adGroupId: r.ad_group.id,
      adGroupName: r.ad_group.name,
      keyword: r.ad_group_criterion.keyword && r.ad_group_criterion.keyword.text,
      matchType: r.ad_group_criterion.keyword && r.ad_group_criterion.keyword.match_type
    })),
    sharedSets: sharedSetLinks.map(r => ({
      campaignId: r.campaign.id,
      campaignName: r.campaign.name,
      sharedSetId: r.shared_set.id,
      sharedSetName: r.shared_set.name,
      status: r.shared_set.status
    })),
    sharedSetKeywords: sharedSetKeywords.map(r => ({
      sharedSetId: r.shared_set.id,
      sharedSetName: r.shared_set.name,
      criterionId: r.shared_criterion.criterion_id,
      keyword: r.shared_criterion.keyword && r.shared_criterion.keyword.text,
      matchType: r.shared_criterion.keyword && r.shared_criterion.keyword.match_type
    }))
  };
}

async function campaignSettings(customer) {
  // Customer-level info: currency, time zone, descriptive name
  let customerInfo = {};
  try {
    const customerRows = await customer.query(`
      SELECT
        customer.id,
        customer.descriptive_name,
        customer.currency_code,
        customer.time_zone,
        customer.auto_tagging_enabled
      FROM customer
      LIMIT 1
    `);
    if (customerRows.length) {
      customerInfo = {
        id: customerRows[0].customer.id,
        name: customerRows[0].customer.descriptive_name,
        currencyCode: customerRows[0].customer.currency_code,
        timeZone: customerRows[0].customer.time_zone,
        autoTagging: customerRows[0].customer.auto_tagging_enabled
      };
    }
  } catch (e) {
    console.warn('customer query failed:', e.message);
  }

  // Campaign-level settings: budget, bidding strategy, network settings, channel
  const campaignRows = await customer.query(`
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      campaign.advertising_channel_type,
      campaign.advertising_channel_sub_type,
      campaign.bidding_strategy_type,
      campaign.target_cpa.target_cpa_micros,
      campaign.maximize_conversions.target_cpa_micros,
      campaign.manual_cpc.enhanced_cpc_enabled,
      campaign.network_settings.target_google_search,
      campaign.network_settings.target_search_network,
      campaign.network_settings.target_content_network,
      campaign.network_settings.target_partner_search_network,
      campaign.geo_target_type_setting.positive_geo_target_type,
      campaign.geo_target_type_setting.negative_geo_target_type,
      campaign_budget.id,
      campaign_budget.name,
      campaign_budget.amount_micros,
      campaign_budget.delivery_method
    FROM campaign
    WHERE campaign.status != 'REMOVED'
  `);

  // Geo targets (positive and negative location criteria)
  const geoRows = await customer.query(`
    SELECT
      campaign.id,
      campaign.name,
      campaign_criterion.criterion_id,
      campaign_criterion.negative,
      campaign_criterion.location.geo_target_constant,
      campaign_criterion.type,
      campaign_criterion.status,
      campaign_criterion.bid_modifier
    FROM campaign_criterion
    WHERE campaign_criterion.type = 'LOCATION'
      AND campaign.status != 'REMOVED'
  `);

  // Resolve geo_target_constant resource names to human-readable names
  const geoConstantNames = new Set(
    geoRows
      .map(r => r.campaign_criterion.location && r.campaign_criterion.location.geo_target_constant)
      .filter(Boolean)
  );

  const geoConstantLookup = {};
  if (geoConstantNames.size > 0) {
    try {
      const idList = Array.from(geoConstantNames)
        .map(rn => `'${rn}'`)
        .join(',');
      const constRows = await customer.query(`
        SELECT
          geo_target_constant.resource_name,
          geo_target_constant.id,
          geo_target_constant.name,
          geo_target_constant.canonical_name,
          geo_target_constant.country_code,
          geo_target_constant.target_type,
          geo_target_constant.status
        FROM geo_target_constant
        WHERE geo_target_constant.resource_name IN (${idList})
      `);
      constRows.forEach(cr => {
        geoConstantLookup[cr.geo_target_constant.resource_name] = {
          id: cr.geo_target_constant.id,
          name: cr.geo_target_constant.name,
          canonicalName: cr.geo_target_constant.canonical_name,
          countryCode: cr.geo_target_constant.country_code,
          targetType: cr.geo_target_constant.target_type
        };
      });
    } catch (e) {
      console.warn('geo_target_constant lookup failed:', e.message);
    }
  }

  // Language targeting
  let languageRows = [];
  try {
    languageRows = await customer.query(`
      SELECT
        campaign.id,
        campaign.name,
        campaign_criterion.criterion_id,
        campaign_criterion.language.language_constant,
        campaign_criterion.negative
      FROM campaign_criterion
      WHERE campaign_criterion.type = 'LANGUAGE'
        AND campaign.status != 'REMOVED'
    `);
  } catch (e) {
    console.warn('language criterion query failed:', e.message);
  }

  return {
    customer: customerInfo,
    campaigns: campaignRows.map(r => ({
      id: r.campaign.id,
      name: r.campaign.name,
      status: r.campaign.status,
      channelType: r.campaign.advertising_channel_type,
      channelSubType: r.campaign.advertising_channel_sub_type,
      biddingStrategyType: r.campaign.bidding_strategy_type,
      targetCpa: r.campaign.target_cpa && r.campaign.target_cpa.target_cpa_micros
        ? Number(r.campaign.target_cpa.target_cpa_micros) / 1_000_000
        : null,
      enhancedCpc: r.campaign.manual_cpc && r.campaign.manual_cpc.enhanced_cpc_enabled,
      networkSettings: {
        googleSearch: r.campaign.network_settings && r.campaign.network_settings.target_google_search,
        searchNetwork: r.campaign.network_settings && r.campaign.network_settings.target_search_network,
        contentNetwork: r.campaign.network_settings && r.campaign.network_settings.target_content_network,
        partnerSearchNetwork: r.campaign.network_settings && r.campaign.network_settings.target_partner_search_network
      },
      geoTargetType: r.campaign.geo_target_type_setting && {
        positive: r.campaign.geo_target_type_setting.positive_geo_target_type,
        negative: r.campaign.geo_target_type_setting.negative_geo_target_type
      },
      budget: {
        id: r.campaign_budget.id,
        name: r.campaign_budget.name,
        amount: Number(r.campaign_budget.amount_micros || 0) / 1_000_000,
        deliveryMethod: r.campaign_budget.delivery_method
      }
    })),
    geoTargets: geoRows.map(r => {
      const rn = r.campaign_criterion.location && r.campaign_criterion.location.geo_target_constant;
      const lookup = rn ? geoConstantLookup[rn] : null;
      return {
        campaignId: r.campaign.id,
        campaignName: r.campaign.name,
        negative: r.campaign_criterion.negative,
        geoTargetConstant: rn,
        resolved: lookup,
        bidModifier: r.campaign_criterion.bid_modifier
      };
    }),
    languages: languageRows.map(r => ({
      campaignId: r.campaign.id,
      campaignName: r.campaign.name,
      languageConstant: r.campaign_criterion.language && r.campaign_criterion.language.language_constant,
      negative: r.campaign_criterion.negative
    }))
  };
}

const VALID_DATE_RANGES = [
  'TODAY', 'YESTERDAY', 'LAST_7_DAYS', 'LAST_14_DAYS', 'LAST_30_DAYS',
  'THIS_MONTH', 'LAST_MONTH', 'THIS_QUARTER', 'LAST_QUARTER'
];

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return handleOptions();
  if (event.httpMethod !== 'GET') return errorResponse(405, 'Method Not Allowed');
  if (!requireAuth(event)) return errorResponse(401, 'Unauthorized');

  try {
    const params = event.queryStringParameters || {};
    const customer = getCustomer(params.account);
    const dateRange = VALID_DATE_RANGES.includes(params.dateRange) ? params.dateRange : 'LAST_30_DAYS';
    const reportType = params.type || 'overview';

    switch (reportType) {
      case 'overview': {
        const overview = await accountOverview(customer, dateRange);
        return jsonResponse({ dateRange, overview });
      }
      case 'daily': {
        const daily = await dailyPerformance(customer, dateRange);
        return jsonResponse({ dateRange, daily });
      }
      case 'campaigns': {
        const campaigns = await campaignPerformance(customer, dateRange);
        return jsonResponse({ dateRange, campaigns });
      }
      case 'keywords': {
        const keywords = await keywordPerformance(customer, dateRange);
        return jsonResponse({ dateRange, keywords });
      }
      case 'negative-keywords': {
        const negatives = await negativeKeywords(customer);
        return jsonResponse({ negatives });
      }
      case 'campaign-settings': {
        const settings = await campaignSettings(customer);
        return jsonResponse({ settings });
      }
      default:
        return errorResponse(400, `Invalid report type: ${reportType}`);
    }
  } catch (err) {
    const msg = err.message || (typeof err === 'object' ? JSON.stringify(err) : String(err)) || 'Internal server error';
    console.error('google-ads-report error:', msg, err);
    return errorResponse(500, msg);
  }
};
