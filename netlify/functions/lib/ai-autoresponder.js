// netlify/functions/lib/ai-autoresponder.js

function isAutoresponderEnabled() {
  const raw = String(process.env.AI_AUTORESPONDER_ENABLED || '').trim().toLowerCase();
  if (raw === 'true' || raw === '1' || raw === 'on' || raw === 'yes') return true;
  return false;
}

function buildFallbackEmail({ contactName, stage, applicationUrl, scheduleUrl, docsUploadUrl }) {
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
      `<p>You can also <a href="${scheduleUrl}">schedule a call</a> to discuss your scenario and next steps.</p>`
    ].join('')
  };
}

function appendEmailSignature(html) {
  const body = String(html || '').trim();
  const signature = [
    '<p>Best regards,<br><strong>SwiftPath Capital Team</strong></p>',
    '<p>Phone: <a href="tel:+13214304434">+1 (321) 430-4434</a><br>Email: <a href="mailto:info@swiftcapital.com">info@swiftcapital.com</a></p>',
    '<p><img src="https://swiftpathcapital.com/Images/Logo.PNG" alt="SwiftPath Capital logo" width="180" /></p>'
  ].join('');

  if (!body) return signature;
  return `${body}${signature}`;
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
  docsUploadUrl
}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  console.log('generateEmailWithClaude: starting', {
    hasApiKey: !!apiKey,
    apiKeyLength: apiKey ? apiKey.length : 0,
    apiKeyPrefix: apiKey ? apiKey.substring(0, 10) + '...' : '(none)',
    stage,
    intentLevel,
    contactName
  });

  if (!apiKey) {
    console.log('generateEmailWithClaude: NO API KEY — using fallback template');
    return buildFallbackEmail({
      contactName,
      stage,
      applicationUrl,
      scheduleUrl,
      docsUploadUrl
    });
  }

  const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514';
  console.log('generateEmailWithClaude: using model', model);

  const systemPrompt = [
    'You write high-converting, professional loan follow-up emails for SwiftPath Capital.',
    'Return strict JSON with keys: subject, html.',
    'Email requirements:',
    '- Greet by first name when available.',
    '- Detect and reference purchase vs refinance when known, otherwise ask a short clarifying question.',
    '- Detect and reference commercial vs residential when known, otherwise ask a short clarifying question.',
    '- Adjust tone by intent level: low intent (lead) = nudge to apply + schedule call; high intent (application) = immediate process engagement + docs checklist + schedule call.',
    '- Do not mention rate calculators or discuss pricing/rates before a value conversation.',
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

    console.log('generateEmailWithClaude: Anthropic API response status', res.status);
    const payload = await res.json();
    if (!res.ok) {
      console.error('generateEmailWithClaude: Anthropic API ERROR', {
        status: res.status,
        error: JSON.stringify(payload).substring(0, 500)
      });
      throw new Error(`Anthropic error: ${res.status} ${JSON.stringify(payload)}`);
    }

    const text = (payload.content || []).map((c) => c.text || '').join('\n').trim();
    console.log('generateEmailWithClaude: Claude raw response length', text.length);
    console.log('generateEmailWithClaude: Claude raw response preview', text.substring(0, 300));
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
      console.error('generateEmailWithClaude: parsed response missing subject or html', JSON.stringify(parsed).substring(0, 300));
      throw new Error('Claude response missing subject or html');
    }

    console.log('generateEmailWithClaude: SUCCESS — AI-generated email', {
      subject: parsed.subject,
      htmlLength: parsed.html.length
    });

    return {
      subject: String(parsed.subject).trim(),
      html: String(parsed.html).trim()
    };
  } catch (err) {
    console.error('generateEmailWithClaude: FALLING BACK TO TEMPLATE — error was:', err.message || err);
    return buildFallbackEmail({
      contactName,
      stage,
      applicationUrl,
      scheduleUrl,
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

  console.log('sendWithResend: config check —', {
    hasApiKey: !!resendApiKey,
    apiKeySource: process.env.RESEND_API_KEY ? 'RESEND_API_KEY' : process.env.RESEND_API_TOKEN ? 'RESEND_API_TOKEN' : process.env.RESEND_TOKEN ? 'RESEND_TOKEN' : 'NONE',
    hasFrom: !!from,
    from: from || '(not set)',
    to
  });

  if (!resendApiKey || !from) {
    throw new Error(
      'Missing Resend configuration. ' +
      (resendApiKey ? '' : 'RESEND_API_KEY is not set. ') +
      (from ? '' : 'RESEND_FROM_EMAIL is not set. ') +
      'Set both in Netlify environment variables.'
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
    html: appendEmailSignature(html),
    reply_to: process.env.RESEND_REPLY_TO || 'info@swiftpathcapital.com',
    tags: tag ? [{ name: 'automation', value: tag }] : undefined
  });

  if (error) {
    console.error('sendWithResend: Resend API error —', error);
    throw new Error(error);
  }

  console.log('sendWithResend: email sent successfully —', { id: data?.id, to });
  return data;
}

module.exports = {
  isAutoresponderEnabled,
  inferTransactionType,
  inferPropertyType,
  buildFallbackEmail,
  appendEmailSignature,
  generateEmailWithClaude,
  sendWithResend
};
