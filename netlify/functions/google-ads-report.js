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
      metrics.ctr,
      metrics.conversion_rate
    FROM customer
    WHERE segments.date DURING ${dateRange}
  `);

  if (!rows.length) {
    return { impressions: 0, clicks: 0, cost: 0, conversions: 0, cpc: 0, ctr: 0, conversionRate: 0, costPerConversion: 0 };
  }

  const m = rows[0].metrics;
  return {
    impressions: Number(m.impressions || 0),
    clicks: Number(m.clicks || 0),
    cost: Number(m.cost_micros || 0) / 1_000_000,
    conversions: Number(m.conversions || 0),
    cpc: Number(m.average_cpc || 0) / 1_000_000,
    ctr: Number(m.ctr || 0),
    conversionRate: Number(m.conversion_rate || 0),
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

const VALID_DATE_RANGES = [
  'TODAY', 'YESTERDAY', 'LAST_7_DAYS', 'LAST_14_DAYS', 'LAST_30_DAYS',
  'THIS_MONTH', 'LAST_MONTH', 'THIS_QUARTER', 'LAST_QUARTER'
];

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return handleOptions();
  if (event.httpMethod !== 'GET') return errorResponse(405, 'Method Not Allowed');
  if (!requireAuth(event)) return errorResponse(401, 'Unauthorized');

  try {
    const customer = getCustomer();
    const params = event.queryStringParameters || {};
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
      default:
        return errorResponse(400, `Invalid report type: ${reportType}`);
    }
  } catch (err) {
    console.error('google-ads-report error:', err.message || err);
    return errorResponse(500, err.message || 'Internal server error');
  }
};
