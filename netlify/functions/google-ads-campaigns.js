// netlify/functions/google-ads-campaigns.js
// Campaign management: list, create, pause, enable campaigns and ad groups

const {
  getCustomer,
  handleOptions,
  errorResponse,
  jsonResponse,
  requireAuth
} = require('./lib/google-ads-client');

async function listCampaigns(customer) {
  const campaigns = await customer.query(`
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      campaign.advertising_channel_type,
      campaign_budget.amount_micros,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions,
      metrics.cost_per_conversion
    FROM campaign
    WHERE campaign.status != 'REMOVED'
    ORDER BY metrics.cost_micros DESC
  `);

  return campaigns.map(row => ({
    id: row.campaign.id,
    name: row.campaign.name,
    status: row.campaign.status,
    channelType: row.campaign.advertising_channel_type,
    budgetMicros: row.campaign_budget.amount_micros,
    budget: Number(row.campaign_budget.amount_micros) / 1_000_000,
    metrics: {
      impressions: Number(row.metrics.impressions || 0),
      clicks: Number(row.metrics.clicks || 0),
      costMicros: Number(row.metrics.cost_micros || 0),
      cost: Number(row.metrics.cost_micros || 0) / 1_000_000,
      conversions: Number(row.metrics.conversions || 0),
      costPerConversion: Number(row.metrics.cost_per_conversion || 0) / 1_000_000
    }
  }));
}

async function listAdGroups(customer, campaignId) {
  const adGroups = await customer.query(`
    SELECT
      ad_group.id,
      ad_group.name,
      ad_group.status,
      ad_group.campaign,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions
    FROM ad_group
    WHERE campaign.id = ${campaignId}
      AND ad_group.status != 'REMOVED'
    ORDER BY metrics.cost_micros DESC
  `);

  return adGroups.map(row => ({
    id: row.ad_group.id,
    name: row.ad_group.name,
    status: row.ad_group.status,
    metrics: {
      impressions: Number(row.metrics.impressions || 0),
      clicks: Number(row.metrics.clicks || 0),
      cost: Number(row.metrics.cost_micros || 0) / 1_000_000,
      conversions: Number(row.metrics.conversions || 0)
    }
  }));
}

async function updateCampaignStatus(customer, campaignId, newStatus) {
  const resourceName = `customers/${process.env.GOOGLE_ADS_CUSTOMER_ID}/campaigns/${campaignId}`;
  await customer.campaigns.update([{
    resource_name: resourceName,
    status: newStatus
  }]);
  return { campaignId, status: newStatus };
}

async function updateAdGroupStatus(customer, adGroupId, newStatus) {
  const resourceName = `customers/${process.env.GOOGLE_ADS_CUSTOMER_ID}/adGroups/${adGroupId}`;
  await customer.adGroups.update([{
    resource_name: resourceName,
    status: newStatus
  }]);
  return { adGroupId, status: newStatus };
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return handleOptions();

  if (!requireAuth(event)) {
    return errorResponse(401, 'Unauthorized');
  }

  try {
    const customer = getCustomer();
    const params = event.queryStringParameters || {};
    const body = event.httpMethod === 'POST' ? JSON.parse(event.body || '{}') : {};

    // GET /google-ads-campaigns — list campaigns or ad groups
    if (event.httpMethod === 'GET') {
      if (params.campaignId) {
        const adGroups = await listAdGroups(customer, params.campaignId);
        return jsonResponse({ adGroups });
      }
      const campaigns = await listCampaigns(customer);
      return jsonResponse({ campaigns });
    }

    // POST /google-ads-campaigns — update status
    if (event.httpMethod === 'POST') {
      const { action, campaignId, adGroupId, status } = body;

      if (action === 'updateCampaignStatus' && campaignId && status) {
        const result = await updateCampaignStatus(customer, campaignId, status);
        return jsonResponse(result);
      }

      if (action === 'updateAdGroupStatus' && adGroupId && status) {
        const result = await updateAdGroupStatus(customer, adGroupId, status);
        return jsonResponse(result);
      }

      return errorResponse(400, 'Invalid action or missing parameters');
    }

    return errorResponse(405, 'Method Not Allowed');
  } catch (err) {
    console.error('google-ads-campaigns error:', err.message || err);
    return errorResponse(500, err.message || 'Internal server error');
  }
};
