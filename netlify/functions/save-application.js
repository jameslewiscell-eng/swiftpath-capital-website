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

function toLabel(key) {
  return String(key || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function normalizeValue(value) {
  if (value == null) return '';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value).trim();
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildApplicationEntries(data = {}) {
  return Object.entries(data)
    .filter(([key]) => key !== 'signature_data')
    .map(([key, value]) => ({ label: toLabel(key), value: normalizeValue(value) }))
    .filter((entry) => entry.value !== '');
}

function escapePdfText(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/\r/g, ' ')
    .replace(/\n/g, ' ');
}

function wrapText(value, maxLen) {
  const words = String(value || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length > maxLen && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

async function generateApplicationPdf(entries, title) {
  const lines = [
    `SwiftPath Capital Application`,
    `Applicant: ${title}`,
    `Generated: ${new Date().toISOString()}`,
    ''
  ];

  for (const entry of entries) {
    lines.push(`${entry.label}:`);
    wrapText(entry.value || '-', 95).forEach((line) => lines.push(`  ${line}`));
    lines.push('');
  }

  const contentLines = [];
  contentLines.push('BT');
  contentLines.push('/F1 11 Tf');
  contentLines.push('50 760 Td');
  contentLines.push('14 TL');
  for (const line of lines) {
    contentLines.push(`(${escapePdfText(line)}) Tj`);
    contentLines.push('T*');
  }
  contentLines.push('ET');
  const contentStream = contentLines.join('\n');
  const contentBuffer = Buffer.from(contentStream, 'utf8');

  const objects = [];
  const addObject = (body) => {
    objects.push(body);
    return objects.length;
  };

  const fontObj = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const contentsObj = addObject(`<< /Length ${contentBuffer.length} >>\nstream\n${contentStream}\nendstream`);
  const pageObj = addObject(`<< /Type /Page /Parent 4 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontObj} 0 R >> >> /Contents ${contentsObj} 0 R >>`);
  const pagesObj = addObject(`<< /Type /Pages /Kids [${pageObj} 0 R] /Count 1 >>`);
  const catalogObj = addObject(`<< /Type /Catalog /Pages ${pagesObj} 0 R >>`);

  let pdf = '%PDF-1.4\n';
  const xref = [0];
  for (let i = 0; i < objects.length; i += 1) {
    xref.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xrefStart = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i < xref.length; i += 1) {
    pdf += `${String(xref[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogObj} 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return Buffer.from(pdf, 'utf8');
}

async function sendInternalApplicationNotification(data = {}, pdfBuffer) {
  const to =
    process.env.APPLICATION_NOTIFICATION_EMAIL ||
    process.env.NOTIFICATION_EMAIL ||
    process.env.RESEND_REPLY_TO ||
    'info@swiftpathcapital.com';

  const entries = buildApplicationEntries(data);
  const name = [data.first_name, data.last_name].filter(Boolean).join(' ').trim() || 'Unknown Applicant';
  const subject = `New SwiftPath application: ${name}`;
  const summaryItems = entries
    .map((entry) => `<li><strong>${escapeHtml(entry.label)}:</strong> ${escapeHtml(entry.value)}</li>`)
    .join('');

  await sendWithResend({
    to,
    subject,
    html: [
      `<p>A new application was submitted by <strong>${escapeHtml(name)}</strong>.</p>`,
      '<p>Application details are included below and attached as a PDF.</p>',
      `<ul>${summaryItems}</ul>`
    ].join(''),
    tag: 'application-notification',
    attachments: [
      {
        filename: `application-${new Date().toISOString().slice(0, 10)}.pdf`,
        content: pdfBuffer.toString('base64')
      }
    ]
  });
}

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
  console.log('save-application: INVOKED', {
    method: event.httpMethod,
    path: event.path,
    timestamp: new Date().toISOString(),
    bodyLength: (event.body || '').length,
    envCheck: {
      AI_AUTORESPONDER_ENABLED: process.env.AI_AUTORESPONDER_ENABLED || '(not set)',
      DROPBOX_ACCESS_TOKEN: process.env.DROPBOX_ACCESS_TOKEN ? 'set' : '(not set)',
      RESEND_API_KEY: process.env.RESEND_API_KEY ? 'set' : '(not set)',
      RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL || '(not set)',
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ? 'set' : '(not set)'
    }
  });

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS };
  }

  // GET = health check / diagnostic
  if (event.httpMethod === 'GET') {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      body: JSON.stringify({
        status: 'ok',
        function: 'save-application',
        timestamp: new Date().toISOString(),
        env: {
          AI_AUTORESPONDER_ENABLED: process.env.AI_AUTORESPONDER_ENABLED || '(not set)',
          DROPBOX_ACCESS_TOKEN: process.env.DROPBOX_ACCESS_TOKEN ? 'set' : '(not set)',
          RESEND_API_KEY: process.env.RESEND_API_KEY ? 'set' : '(not set)',
          RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL || '(not set)',
          ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ? 'set' : '(not set)'
        }
      }, null, 2)
    };
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

    const entries = buildApplicationEntries(data);

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
      const applicantName = [data.first_name, data.last_name].filter(Boolean).join(' ').trim() || 'Loan Application';
      const pdfBuffer = await generateApplicationPdf(entries, applicantName);
      await sendInternalApplicationNotification(data, pdfBuffer);
      console.log('save-application: internal application notification email sent');
    } catch (notificationErr) {
      console.error('save-application: internal application notification FAILED —', notificationErr.message || notificationErr);
    }

    try {
      console.log('save-application: attempting application auto-response…');
      await sendApplicationAutoResponse(data);
      console.log('save-application: application auto-response completed');
    } catch (emailErr) {
      console.error('save-application: application auto-response FAILED —', emailErr.message || emailErr);
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
