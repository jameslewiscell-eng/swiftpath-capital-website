// netlify/functions/test-resend.js
// Diagnostic endpoint: GET /.netlify/functions/test-resend?to=your@email.com
// Sends a test email via Resend and returns detailed diagnostics.

exports.handler = async function(event) {
  const diag = {
    timestamp: new Date().toISOString(),
    env: {
      RESEND_API_KEY: process.env.RESEND_API_KEY
        ? `${process.env.RESEND_API_KEY.slice(0, 8)}...${process.env.RESEND_API_KEY.slice(-4)} (${process.env.RESEND_API_KEY.length} chars)`
        : '(not set)',
      RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL || '(not set)',
      AI_AUTORESPONDER_ENABLED: process.env.AI_AUTORESPONDER_ENABLED || '(not set)',
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ? 'set' : '(not set)'
    },
    steps: []
  };

  const resendApiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;

  if (!resendApiKey) {
    diag.steps.push({ step: 'check-api-key', status: 'FAIL', detail: 'RESEND_API_KEY is not set' });
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(diag, null, 2) };
  }
  diag.steps.push({ step: 'check-api-key', status: 'OK' });

  if (!from) {
    diag.steps.push({ step: 'check-from-email', status: 'FAIL', detail: 'RESEND_FROM_EMAIL is not set' });
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(diag, null, 2) };
  }
  diag.steps.push({ step: 'check-from-email', status: 'OK', value: from });

  // Step 1: Verify API key by listing domains
  try {
    const domainsRes = await fetch('https://api.resend.com/domains', {
      headers: { Authorization: `Bearer ${resendApiKey}` }
    });
    const domainsBody = await domainsRes.text();
    diag.steps.push({
      step: 'list-domains',
      status: domainsRes.ok ? 'OK' : 'FAIL',
      httpStatus: domainsRes.status,
      body: domainsBody.slice(0, 500)
    });
    if (!domainsRes.ok) {
      return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(diag, null, 2) };
    }
  } catch (err) {
    diag.steps.push({ step: 'list-domains', status: 'ERROR', detail: err.message });
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(diag, null, 2) };
  }

  // Step 2: Send test email if ?to= is provided
  const params = new URLSearchParams(event.rawUrl?.split('?')[1] || '');
  const to = params.get('to');

  if (!to) {
    diag.steps.push({ step: 'send-test', status: 'SKIPPED', detail: 'Add ?to=your@email.com to send a test email' });
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(diag, null, 2) };
  }

  try {
    const payload = {
      from,
      to: [to],
      subject: 'SwiftPath Capital - Resend Test',
      html: '<p>This is a test email from the SwiftPath Capital autoresponder system.</p><p>If you received this, Resend is working correctly.</p>',
      reply_to: 'info@swiftpathcapital.com',
      tags: [{ name: 'automation', value: 'resend-test' }]
    };

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const emailBody = await emailRes.text();
    diag.steps.push({
      step: 'send-test',
      status: emailRes.ok ? 'OK' : 'FAIL',
      httpStatus: emailRes.status,
      to,
      body: emailBody.slice(0, 500)
    });
  } catch (err) {
    diag.steps.push({ step: 'send-test', status: 'ERROR', detail: err.message });
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(diag, null, 2)
  };
};
