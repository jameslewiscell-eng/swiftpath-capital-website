// netlify/functions/twilio-check-verify.js
// Confirms the OTP code sent to the given phone number using Twilio Verify.
// Includes input validation and structured error responses.

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
    const { phone, code } = JSON.parse(event.body || '{}');
    if (!phone || !code) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ ok: false, error: 'Missing phone or code.' }) };
    }

    // Validate code format (digits only, 4-8 chars)
    const cleanCode = (code + '').trim();
    if (!/^\d{4,8}$/.test(cleanCode)) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ ok: false, error: 'Code must be 4-8 digits.' }) };
    }

    // Validate phone format
    const cleanPhone = phone.replace(/[^\d+]/g, '');
    if (!/^\+\d{8,15}$/.test(cleanPhone)) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ ok: false, error: 'Invalid phone format.' }) };
    }

    const sid   = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    const svc   = process.env.TWILIO_VERIFY_SERVICE_SID;
    if (!sid || !token || !svc) {
      return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ ok: false, error: 'Server configuration error.' }) };
    }

    const res = await fetch(`https://verify.twilio.com/v2/Services/${svc}/VerificationCheck`, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({ To: cleanPhone, Code: cleanCode })
    });

    const data = await res.json();
    const ok = data.status === 'approved';

    if (ok) {
      return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ ok: true, status: 'approved' }) };
    }

    // Twilio returns 404 when verification has expired or too many attempts
    if (res.status === 404) {
      return { statusCode: 410, headers: CORS_HEADERS, body: JSON.stringify({ ok: false, error: 'Code expired. Please request a new one.' }) };
    }

    return { statusCode: 401, headers: CORS_HEADERS, body: JSON.stringify({ ok: false, status: data.status, error: 'Invalid code. Please try again.' }) };
  } catch (e) {
    console.error('[twilio-check-verify] Error:', e);
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ ok: false, error: 'Unexpected server error.' }) };
  }
}
