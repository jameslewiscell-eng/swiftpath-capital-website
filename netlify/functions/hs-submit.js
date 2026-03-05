// netlify/functions/hs-submit.js (CommonJS)

const {
  isAutoresponderEnabled,
  inferTransactionType,
  inferPropertyType,
  generateEmailWithClaude,
  sendWithResend
} = require('./lib/ai-autoresponder');

function fieldsToMap(fields) {
  return (fields || []).reduce((acc, field) => {
    if (field && field.name && field.value != null && acc[field.name] == null) {
      acc[field.name] = String(field.value).trim();
    }
    return acc;
  }, {});
}

async function sendLeadAutoResponse(fields = []) {
  if (!isAutoresponderEnabled()) {
    console.log('hs-submit: skipping lead auto-response (AI_AUTORESPONDER_ENABLED is not true)');
    return;
  }

  const fieldMap = fieldsToMap(fields);
  const to = fieldMap.email;
  if (!to) {
    console.log('hs-submit: skipping lead auto-response (missing lead email)');
    return;
  }

  const contactName = fieldMap.firstname || fieldMap.name || 'there';
  const leadSource = fieldMap.lead_source || '';
  const leadCaptureOffer = fieldMap.lead_capture_offer || '';
  const isRoiCalculatorPopupLead = leadCaptureOffer === 'roi_calculator' || leadSource === 'exit_popup_roi_calculator';
  const dealText = isRoiCalculatorPopupLead
    ? ''
    : (fieldMap.lead_purpose || fieldMap.loan_purpose || fieldMap.purpose || '');
  const transactionType = inferTransactionType(dealText);
  const propertyType = inferPropertyType(dealText);

  const email = await generateEmailWithClaude({
    contactName,
    stage: 'lead',
    intentLevel: 'low',
    dealText,
    transactionType,
    propertyType,
    applicationUrl: process.env.APPLICATION_URL || 'https://swiftpathcapital.com/LoanApp.html',
    scheduleUrl: process.env.SCHEDULING_URL || 'https://calendly.com/swiftpath-capital',
    rateToolUrl: process.env.RATE_TOOL_URL || 'https://swiftpathcapital.com/flip-rate-calculator.html',
    docsUploadUrl: process.env.DOCS_UPLOAD_URL || 'https://swiftpathcapital.com/thank-you.html',
    leadSource,
    leadCaptureOffer
  });

  await sendWithResend({
    to,
    subject: email.subject,
    html: email.html,
    tag: 'lead-ai-autoresponse'
  });
}

exports.handler = async function (event) {
  const envStatus = {
    AI_AUTORESPONDER_ENABLED: process.env.AI_AUTORESPONDER_ENABLED || '(not set)',
    RESEND_API_KEY: process.env.RESEND_API_KEY ? 'set' : '(not set)',
    RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL || '(not set)',
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ? 'set' : '(not set)'
  };

  console.log('hs-submit: INVOKED', {
    method: event.httpMethod,
    path: event.path,
    timestamp: new Date().toISOString(),
    envCheck: envStatus
  });

  try {
    // GET = health check / diagnostic
    if (event.httpMethod === 'GET') {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'ok',
          function: 'hs-submit',
          timestamp: new Date().toISOString(),
          env: envStatus
        }, null, 2)
      };
    }

    if (event.httpMethod !== 'POST') {
      console.log('hs-submit: rejected non-POST request:', event.httpMethod);
      return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const body = JSON.parse(event.body || '{}');
    const { portalId, formGuid, fields = [], context: hsContext = {} } = body || {};
    console.log('hs-submit: parsed payload', {
      portalId: portalId || '(missing)',
      formGuid: formGuid || '(missing)',
      fieldCount: fields.length,
      fieldNames: fields.map(f => f.name)
    });

    if (!portalId || !formGuid) {
      return { statusCode: 400, body: 'Missing portalId or formGuid' };
    }

    const url = `https://api.hsforms.com/submissions/v3/integration/submit/${portalId}/${formGuid}`;
    console.log('hs-submit: forwarding to HubSpot…');
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields, context: hsContext })
    });
    const text = await res.text();
    console.log('hs-submit: HubSpot response', { status: res.status, bodyLength: text.length });

    if (res.ok) {
      try {
        console.log('hs-submit: HubSpot submit succeeded, attempting lead auto-response…');
        await sendLeadAutoResponse(fields);
        console.log('hs-submit: lead auto-response completed');
      } catch (emailErr) {
        console.error('hs-submit: lead auto-response FAILED —', emailErr.message || emailErr);
      }
    } else {
      console.warn('hs-submit: HubSpot returned error, skipping auto-response', { status: res.status, body: text.slice(0, 500) });
    }

    return { statusCode: res.status, body: text };
  } catch (err) {
    console.error('hs-submit: UNHANDLED ERROR —', err.message || err, err.stack || '');
    return { statusCode: 500, body: 'Proxy error: ' + (err && err.message ? err.message : String(err)) };
  }
};
