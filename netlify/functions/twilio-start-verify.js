// netlify/functions/twilio-start-verify.js
// Starts an SMS verification for the given phone number using Twilio Verify.
export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  try {
    const { phone } = JSON.parse(event.body || '{}');
    if (!phone) return { statusCode: 400, body: 'Missing phone' };

    const sid   = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    const svc   = process.env.TWILIO_VERIFY_SERVICE_SID;
    if (!sid || !token || !svc) {
      return { statusCode: 500, body: 'Twilio env vars missing' };
    }

    const res = await fetch(`https://verify.twilio.com/v2/Services/${svc}/Verifications`, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({ To: phone, Channel: 'sms' })
    });

    const text = await res.text();
    return { statusCode: res.ok ? 200 : 502, body: text };
  } catch (e) {
    return { statusCode: 500, body: 'start-verify error: ' + (e.message || String(e)) };
  }
}