// netlify/functions/twilio-start-verify.js
// Starts an SMS verification for the given phone number using Twilio Verify.
// Includes basic phone validation and request-level safeguards.

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS_HEADERS, body: 'Method Not Allowed' };
  }
  try {
    const { phone } = JSON.parse(event.body || '{}');
    if (!phone) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Missing phone number.' }) };
    }

    // Validate phone format (E.164: + followed by 8-15 digits)
    const cleaned = phone.replace(/[^\d+]/g, '');
    if (!/^\+\d{8,15}$/.test(cleaned)) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Invalid phone format. Use E.164 (e.g. +13214304434).' }) };
    }

    const sid   = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    const svc   = process.env.TWILIO_VERIFY_SERVICE_SID;
    if (!sid || !token || !svc) {
      return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Server configuration error.' }) };
    }

    const res = await fetch(`https://verify.twilio.com/v2/Services/${svc}/Verifications`, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({ To: cleaned, Channel: 'sms' })
    });

    if (res.ok) {
      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({ ok: true, message: 'Verification code sent.' })
      };
    }

    // Twilio returns 429 when rate limited on their side
    const status = res.status === 429 ? 429 : 502;
    const errBody = await res.text();
    console.error('[twilio-start-verify] Twilio error:', res.status, errBody);
    return {
      statusCode: status,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: status === 429 ? 'Too many requests. Please wait a minute and try again.' : 'Could not send verification code. Please try again.' })
    };
  } catch (e) {
    console.error('[twilio-start-verify] Error:', e);
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Unexpected server error.' }) };
  }
}
