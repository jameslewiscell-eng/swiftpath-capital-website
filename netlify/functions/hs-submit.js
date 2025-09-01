// netlify/functions/hs-submit.js (CommonJS)
exports.handler = async function (event, context) {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: 'Method Not Allowed' };
    }
    const body = JSON.parse(event.body || '{}');
    const { portalId, formGuid, fields = [], context: hsContext = {} } = body || {};
    if (!portalId || !formGuid) {
      return { statusCode: 400, body: 'Missing portalId or formGuid' };
    }
    const url = `https://api.hsforms.com/submissions/v3/integration/submit/${portalId}/${formGuid}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields, context: hsContext }),
    });
    const text = await res.text();
    return { statusCode: res.status, body: text };
  } catch (err) {
    return { statusCode: 500, body: 'Proxy error: ' + (err && err.message ? err.message : String(err)) };
  }
};
