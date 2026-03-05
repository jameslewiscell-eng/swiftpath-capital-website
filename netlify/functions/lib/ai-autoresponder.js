// netlify/functions/lib/ai-autoresponder.js

function isAutoresponderEnabled() {
  const raw = String(process.env.AI_AUTORESPONDER_ENABLED || '').trim().toLowerCase();
  if (raw === 'false' || raw === '0' || raw === 'off' || raw === 'no') return false;
  return true;
}

function buildFallbackEmail({ contactName, stage, applicationUrl, scheduleUrl, rateToolUrl, docsUploadUrl }) {
  const safeName = contactName || 'there';

  if (stage === 'application') {
    return {
      subject: 'We received your SwiftPath Capital application',
      html: [
        `<p>Hi ${safeName},</p>`,
        '<p>Thanks for submitting your application with SwiftPath Capital. We received it and a team member will review it shortly.</p>',
        '<p>To help us move faster, you can start uploading supporting documents now.</p>',
        `<p><a href="${docsUploadUrl}">Upload documents</a> · <a href="${scheduleUrl}">Schedule a call</a></p>`
      ].join('')
    };
  }

  return {
    subject: 'Thanks for reaching out to SwiftPath Capital',
    html: [
      `<p>Hi ${safeName},</p>`,
      '<p>Thanks for your interest in SwiftPath Capital. We received your request and a lending advisor will follow up soon.</p>',
      `<p>To speed things up, you can start your full application here: <a href="${applicationUrl}">Apply now</a>.</p>`,
      `<p>You can also <a href="${scheduleUrl}">schedule a call</a> or review financing options in our <a href="${rateToolUrl}">rate calculator</a>.</p>`
    ].join('')
  };
}

function inferTransactionType(text) {
  const s = String(text || '').toLowerCase();
  if (!s) return 'unknown';
  if (s.includes('refi') || s.includes('refinance') || s.includes('cash-out')) return 'refinance';
  if (s.includes('purchase') || s.includes('acquisition') || s.includes('buy')) return 'purchase';
  return 'unknown';
}

function inferPropertyType(text) {
  const s = String(text || '').toLowerCase();
  if (!s) return 'unknown';
  if (
    s.includes('commercial') ||
    s.includes('retail') ||
    s.includes('office') ||
    s.includes('industrial') ||
    s.includes('multifamily') ||
    s.includes('mixed use')
  ) {
    return 'commercial';
  }
  if (
    s.includes('sfr') ||
    s.includes('single family') ||
    s.includes('duplex') ||
    s.includes('triplex') ||
    s.includes('quad') ||
    s.includes('residential')
  ) {
    return 'residential';
  }
  return 'unknown';
}

async function generateEmailWithClaude({
  contactName,
  stage,
  intentLevel,
  dealText,
  transactionType,
  propertyType,
  scheduleUrl,
  applicationUrl,
  rateToolUrl,
  docsUploadUrl
}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return buildFallbackEmail({
      contactName,
      stage,
      applicationUrl,
      scheduleUrl,
      rateToolUrl,
      docsUploadUrl
    });
  }

  const model = process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-latest';

  const systemPrompt = [
    'You write high-converting, professional loan follow-up emails for SwiftPath Capital.',
    'Return strict JSON with keys: subject, html.',
    'Email requirements:',
    '- Greet by first name when available.',
    '- Detect and reference purchase vs refinance when known, otherwise ask a short clarifying question.',
    '- Detect and reference commercial vs residential when known, otherwise ask a short clarifying question.',
    '- Adjust tone by intent level: low intent (lead) = nudge to apply + schedule call; high intent (application) = immediate process engagement + docs checklist + schedule call.',
    '- NEVER request bank statements in the initial document request.',
    '- If stage is application/high intent, include docs request list tailored for private lending such as: LLC formation docs/operating agreement (if entity borrower), purchase contract (if under contract), scope of work + rehab budget (if rehab), rent roll/T12 (if applicable), and current insurance quote/declarations if available.',
    '- Keep concise, clear CTA, and human.',
    '- HTML must be simple tags only: <p>, <ul>, <ol>, <li>, <strong>, <a>.'
  ].join('\n');

  const userPrompt = {
    brand: 'SwiftPath Capital',
    stage,
    intentLevel,
    contactName: contactName || 'there',
    knownDealDescription: dealText || '',
    transactionType,
    propertyType,
    links: {
      scheduleUrl,
      applicationUrl,
      rateToolUrl,
      docsUploadUrl
    }
  };

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model,
        max_tokens: 700,
        temperature: 0.4,
        system: systemPrompt,
        messages: [{ role: 'user', content: JSON.stringify(userPrompt) }]
      })
    });

    const payload = await res.json();
    if (!res.ok) {
      throw new Error(`Anthropic error: ${res.status} ${JSON.stringify(payload)}`);
    }

    const text = (payload.content || []).map((c) => c.text || '').join('\n').trim();
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      const jsonStart = text.indexOf('{');
      const jsonEnd = text.lastIndexOf('}');
      if (jsonStart >= 0 && jsonEnd > jsonStart) {
        parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1));
      } else {
        throw new Error('Claude response was not valid JSON');
      }
    }

    if (!parsed || !parsed.subject || !parsed.html) {
      throw new Error('Claude response missing subject or html');
    }

    return {
      subject: String(parsed.subject).trim(),
      html: String(parsed.html).trim()
    };
  } catch (err) {
    console.error('ai-autoresponder: falling back to static email', err);
    return buildFallbackEmail({
      contactName,
      stage,
      applicationUrl,
      scheduleUrl,
      rateToolUrl,
      docsUploadUrl
    });
  }
}

async function sendWithResend({ to, subject, html, tag }) {
  const resendApiKey =
    process.env.RESEND_API_KEY ||
    process.env.RESEND_API_TOKEN ||
    process.env.RESEND_TOKEN;
  const from = process.env.RESEND_FROM_EMAIL;

  if (!resendApiKey || !from) {
    throw new Error(
      'Missing Resend configuration. Set RESEND_FROM_EMAIL and one of RESEND_API_KEY, RESEND_API_TOKEN, or RESEND_TOKEN.'
    );
  }

  const resend = {
    emails: {
      send: async function(payload) {
        const emailRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });

        if (!emailRes.ok) {
          const errText = await emailRes.text();
          return { data: null, error: `Resend send failed: ${emailRes.status} ${errText}` };
        }

        return { data: await emailRes.json(), error: null };
      }
    }
  };

  const { data, error } = await resend.emails.send({
    from,
    to: [to],
    subject,
    html,
    reply_to: process.env.RESEND_REPLY_TO || undefined,
    tags: tag ? [{ name: 'automation', value: tag }] : undefined
  });

  if (error) {
    throw new Error(error);
  }

  return data;
}

module.exports = {
  isAutoresponderEnabled,
  inferTransactionType,
  inferPropertyType,
  buildFallbackEmail,
  generateEmailWithClaude,
  sendWithResend
};
