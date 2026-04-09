// netlify/functions/campaign-blueprint-status.js
// Reads the Blob written by campaign-blueprint-background.js and returns
// the current state of a blueprint job.
//
//   GET /campaign-blueprint-status?jobId=<jobId>
//     → { status: "pending" | "ready" | "error" | "unknown", ...payload }
//
// Auth: shares GOOGLE_ADS_AGENT_SECRET with the rest of the agent.

const { getStore, connectLambda } = require('@netlify/blobs');
const {
  handleOptions,
  errorResponse,
  jsonResponse,
  requireAuth
} = require('./lib/google-ads-client');

const BLUEPRINT_STORE = 'campaign-blueprints';

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return handleOptions();
  if (event.httpMethod !== 'GET') return errorResponse(405, 'Method Not Allowed');

  // Bridge Lambda v1 event into the Netlify Blobs SDK context
  try {
    connectLambda(event);
  } catch (e) {
    console.warn('connectLambda failed:', e.message);
  }

  try {
    if (!requireAuth(event)) return errorResponse(401, 'Unauthorized');
  } catch (err) {
    return errorResponse(500, err.message);
  }

  try {
    const params = event.queryStringParameters || {};
    const jobId = (params.jobId || '').trim();
    if (!jobId) return errorResponse(400, 'Missing required parameter: jobId');

    const store = getStore({ name: BLUEPRINT_STORE, consistency: 'strong' });
    const payload = await store.get(`blueprint:${jobId}`, { type: 'json' });

    if (!payload) {
      return jsonResponse({ status: 'unknown', jobId });
    }
    return jsonResponse({ jobId, ...payload });
  } catch (err) {
    const msg = err.message || String(err) || 'Internal server error';
    console.error('campaign-blueprint-status error:', msg, err);
    return errorResponse(500, msg);
  }
};
