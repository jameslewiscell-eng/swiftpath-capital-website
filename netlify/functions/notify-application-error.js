// netlify/functions/notify-application-error.js
// Sends internal alerts when loan application validation/submission issues occur.

const { sendWithResend } = require('./lib/ai-autoresponder');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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

  const notifyTo = process.env.APPLICATION_ERROR_ALERT_EMAIL || process.env.RESEND_FROM_EMAIL;
  if (!notifyTo) {
    console.warn('notify-application-error: no destination email configured');
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ ok: true, skipped: true })
    };
  }

  try {
    const payload = JSON.parse(event.body || '{}');
    const type = payload.type || 'unknown_error';
    const details = payload.details || {};
    const invalidFields = Array.isArray(details.invalid_fields) ? details.invalid_fields.join(', ') : '';

    const subject = `[SwiftPath] Loan App ${type}`;
    const html = [
      '<h2>Loan Application Error Notification</h2>',
      `<p><strong>Type:</strong> ${escapeHtml(type)}</p>`,
      payload.submitted_at ? `<p><strong>Timestamp:</strong> ${escapeHtml(payload.submitted_at)}</p>` : '',
      payload.page_url ? `<p><strong>Page:</strong> ${escapeHtml(payload.page_url)}</p>` : '',
      invalidFields ? `<p><strong>Invalid fields:</strong> ${escapeHtml(invalidFields)}</p>` : '',
      details.message ? `<p><strong>Error:</strong> ${escapeHtml(details.message)}</p>` : '',
      payload.user_agent ? `<p><strong>User agent:</strong> ${escapeHtml(payload.user_agent)}</p>` : ''
    ].filter(Boolean).join('');

    await sendWithResend({
      to: notifyTo,
      subject,
      html,
      tag: 'application-error-alert'
    });

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ ok: true })
    };
  } catch (err) {
    console.error('notify-application-error error:', err);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ ok: false, error: err.message || String(err) })
    };
  }
};
