// netlify/functions/save-application.js
// Saves extra loan-application fields (credit score, DOB, signature, etc.)
// as a JSON file in Dropbox.  These fields are NOT sent to HubSpot.
// Requires env var: DROPBOX_ACCESS_TOKEN (already set for upload-to-dropbox).

const {
  isAutoresponderEnabled,
  inferTransactionType,
  inferPropertyType,
  generateEmailWithClaude,
  sendWithResend
} = require('./lib/ai-autoresponder');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

async function sendApplicationAutoResponse(data = {}) {
  if (!isAutoresponderEnabled()) {
    console.log('save-application: skipping application auto-response (AI_AUTORESPONDER_ENABLED is not true)');
    return;
  }

  const to = data.email;
  if (!to) {
    console.log('save-application: skipping application auto-response (missing applicant email)');
    return;
  }

  const dealText = [data.loan_type, data.loan_purpose, data.scope_of_work].filter(Boolean).join(' | ');
  const transactionType = inferTransactionType(dealText);
  const propertyType = inferPropertyType(dealText);

  const email = await generateEmailWithClaude({
    contactName: data.first_name || 'there',
    stage: 'application',
    intentLevel: 'high',
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
    tag: 'application-ai-autoresponse'
  });
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: CORS_HEADERS,
      body: JSON.stringify({ ok: false, error: 'Method not allowed' })
    };
  }

  const token = process.env.DROPBOX_ACCESS_TOKEN;
  if (!token) {
    console.error('save-application: Missing DROPBOX_ACCESS_TOKEN');
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ ok: false, error: 'Server configuration error' })
    };
  }

  try {
    const data = JSON.parse(event.body || '{}');

    // Build a human-readable filename
    const name = [data.first_name, data.last_name].filter(Boolean).join('_') || 'unknown';
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `/applications/${ts}__${name}.json`;

    // Separate signature image from the rest (save as separate PNG if present)
    let signaturePath = null;
    const signatureData = data.signature_data;
    delete data.signature_data; // don't store base64 blob in JSON

    // Save JSON record
    const jsonBuffer = Buffer.from(JSON.stringify(data, null, 2), 'utf8');
    const uploadRes = await fetch('https://content.dropboxapi.com/2/files/upload', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Dropbox-API-Arg': JSON.stringify({
          path: filename,
          mode: 'add',
          autorename: true,
          mute: false
        }),
        'Content-Type': 'application/octet-stream'
      },
      body: jsonBuffer
    });

    if (!uploadRes.ok) {
      const text = await uploadRes.text();
      throw new Error(`Dropbox JSON upload failed: ${uploadRes.status} ${text}`);
    }

    // Save signature image if present
    if (signatureData && signatureData.startsWith('data:image/png;base64,')) {
      const base64 = signatureData.replace('data:image/png;base64,', '');
      const sigBuffer = Buffer.from(base64, 'base64');
      const sigFilename = `/applications/${ts}__${name}__signature.png`;

      const sigRes = await fetch('https://content.dropboxapi.com/2/files/upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Dropbox-API-Arg': JSON.stringify({
            path: sigFilename,
            mode: 'add',
            autorename: true,
            mute: false
          }),
          'Content-Type': 'application/octet-stream'
        },
        body: sigBuffer
      });

      if (sigRes.ok) {
        signaturePath = sigFilename;
      } else {
        console.warn('Signature upload failed:', await sigRes.text());
      }
    }

    try {
      await sendApplicationAutoResponse(data);
    } catch (emailErr) {
      console.error('save-application: application auto-response error', emailErr);
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      body: JSON.stringify({
        ok: true,
        json_path: filename,
        signature_path: signaturePath
      })
    };
  } catch (err) {
    console.error('save-application error:', err);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ ok: false, error: err.message || String(err) })
    };
  }
};
