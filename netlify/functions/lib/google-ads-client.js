// netlify/functions/lib/google-ads-client.js
// Shared Google Ads API client for all agent functions

const { GoogleAdsApi } = require('google-ads-api');

function getClient() {
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;

  if (!clientId || !clientSecret || !developerToken) {
    throw new Error(
      'Missing Google Ads configuration. Required env vars: ' +
      'GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET, GOOGLE_ADS_DEVELOPER_TOKEN'
    );
  }

  return new GoogleAdsApi({
    client_id: clientId,
    client_secret: clientSecret,
    developer_token: developerToken
  });
}

function getCustomer() {
  const client = getClient();
  const customerId = process.env.GOOGLE_ADS_CUSTOMER_ID;
  const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;
  const loginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || undefined;

  if (!customerId || !refreshToken) {
    throw new Error(
      'Missing Google Ads account configuration. Required env vars: ' +
      'GOOGLE_ADS_CUSTOMER_ID, GOOGLE_ADS_REFRESH_TOKEN'
    );
  }

  return client.Customer({
    customer_id: customerId,
    refresh_token: refreshToken,
    login_customer_id: loginCustomerId
  });
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
  };
}

function handleOptions() {
  return { statusCode: 204, headers: corsHeaders(), body: '' };
}

function errorResponse(statusCode, message) {
  return {
    statusCode,
    headers: corsHeaders(),
    body: JSON.stringify({ error: message })
  };
}

function jsonResponse(data, statusCode = 200) {
  return {
    statusCode,
    headers: corsHeaders(),
    body: JSON.stringify(data)
  };
}

function requireAuth(event) {
  const authHeader = event.headers.authorization || event.headers.Authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  const expected = process.env.GOOGLE_ADS_AGENT_SECRET;

  if (!expected) {
    throw new Error('GOOGLE_ADS_AGENT_SECRET env var not set');
  }

  if (!token || token !== expected) {
    return false;
  }
  return true;
}

module.exports = {
  getClient,
  getCustomer,
  corsHeaders,
  handleOptions,
  errorResponse,
  jsonResponse,
  requireAuth
};
