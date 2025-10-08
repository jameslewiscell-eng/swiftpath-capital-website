// netlify/functions/twilio-check-verify.js
// Confirms the OTP code sent to the given phone number using Twilio Verify.
export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  try {
    const { phone, code } = JSON.parse(event.body || '{}');
    if (!phone || !code) return { statusCode: 400, body: 'Missing phone or code' };

    const sid   = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    const svc   = process.env.TWILIO_VERIFY_SERVICE_SID;
    if (!sid || !token || !svc) {
      return { statusCode: 500, body: 'Twilio env vars missing' };
    }

    const res = await fetch(`https://verify.twilio.com/v2/Services/${svc}/VerificationCheck`, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({ To: phone, Code: code })
    });

    const data = await res.json();
    const ok = data.status === 'approved';
    return { statusCode: ok ? 200 : 401, body: JSON.stringify({ ok, status: data.status }) };
  } catch (e) {
    return { statusCode: 500, body: 'check-verify error: ' + (e.message || String(e)) };
  }
}