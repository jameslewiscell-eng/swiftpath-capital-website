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
  const dealText = fieldMap.lead_purpose || fieldMap.loan_purpose || fieldMap.purpose || '';
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
    rateToolUrl: process.env.RATE_TOOL_URL || 'https://swiftpathcapital.com/rate-calculator.html',
    docsUploadUrl: process.env.DOCS_UPLOAD_URL || 'https://swiftpathcapital.com/thank-you.html'
  });

  await sendWithResend({
    to,
    subject: email.subject,
    html: email.html,
    tag: 'lead-ai-autoresponse'
  });
}

exports.handler = async function (event) {
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
      body: JSON.stringify({ fields, context: hsContext })
    });
    const text = await res.text();

    if (res.ok) {
      try {
        await sendLeadAutoResponse(fields);
      } catch (emailErr) {
        console.error('hs-submit: lead auto-response error', emailErr);
      }
    }

    return { statusCode: res.status, body: text };
  } catch (err) {
    return { statusCode: 500, body: 'Proxy error: ' + (err && err.message ? err.message : String(err)) };
  }
};
