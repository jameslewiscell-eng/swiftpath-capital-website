// netlify/functions/google-ads-diagnose.js
// Diagnostic endpoint to test Google Ads OAuth credentials independently

const { corsHeaders, handleOptions, errorResponse, jsonResponse, requireAuth } = require('./lib/google-ads-client');
const https = require('https');

function refreshAccessToken(clientId, clientSecret, refreshToken) {
  return new Promise((resolve, reject) => {
    const postData = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    }).toString();

    const options = {
      hostname: 'oauth2.googleapis.com',
      path: '/token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try {
          resolve({ statusCode: res.statusCode, body: JSON.parse(body) });
        } catch {
          resolve({ statusCode: res.statusCode, body });
        }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return handleOptions();
  if (event.httpMethod !== 'GET') return errorResponse(405, 'Method Not Allowed');
  if (!requireAuth(event)) return errorResponse(401, 'Unauthorized');

  const clientId = process.env.GOOGLE_ADS_CLIENT_ID || '';
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET || '';
  const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN || '';
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN || '';
  const customerId = process.env.GOOGLE_ADS_CUSTOMER_ID || '';
  const loginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || '';

  // Show what's configured (masked for security)
  const mask = (val) => val ? val.substring(0, 8) + '...' + val.substring(val.length - 4) : '(empty)';

  const diagnostics = {
    envVarsPresent: {
      GOOGLE_ADS_CLIENT_ID: mask(clientId),
      GOOGLE_ADS_CLIENT_SECRET: mask(clientSecret),
      GOOGLE_ADS_REFRESH_TOKEN: mask(refreshToken),
      GOOGLE_ADS_DEVELOPER_TOKEN: mask(developerToken),
      GOOGLE_ADS_CUSTOMER_ID: customerId || '(empty)',
      GOOGLE_ADS_LOGIN_CUSTOMER_ID: loginCustomerId || '(not set)'
    },
    checks: []
  };

  // Check CLIENT_SECRET prefix
  if (clientSecret.startsWith('GOCSPX-')) {
    diagnostics.checks.push('CLIENT_SECRET has GOCSPX- prefix (Web Application type credential)');
  } else {
    diagnostics.checks.push('CLIENT_SECRET does NOT have GOCSPX- prefix (likely Desktop type credential)');
  }

  // Check CUSTOMER_ID format (should be digits only, no dashes)
  if (customerId && customerId.includes('-')) {
    diagnostics.checks.push('WARNING: CUSTOMER_ID contains dashes — should be digits only (e.g., 5354667756 not 535-466-7756)');
  }

  // Test the OAuth token refresh directly
  try {
    const tokenResult = await refreshAccessToken(clientId, clientSecret, refreshToken);
    if (tokenResult.statusCode === 200 && tokenResult.body.access_token) {
      diagnostics.tokenRefresh = {
        status: 'SUCCESS',
        message: 'OAuth token refresh worked — credentials match the refresh token',
        accessTokenPreview: mask(tokenResult.body.access_token),
        expiresIn: tokenResult.body.expires_in
      };
    } else {
      diagnostics.tokenRefresh = {
        status: 'FAILED',
        httpStatus: tokenResult.statusCode,
        error: tokenResult.body.error,
        errorDescription: tokenResult.body.error_description,
        hint: tokenResult.body.error === 'invalid_client'
          ? 'The CLIENT_ID and CLIENT_SECRET do not match the credential used to generate the REFRESH_TOKEN. You must use the SAME OAuth credential for all three values.'
          : 'Check the error description above for details.'
      };
    }
  } catch (err) {
    diagnostics.tokenRefresh = {
      status: 'ERROR',
      message: err.message
    };
  }

  return jsonResponse(diagnostics);
};
