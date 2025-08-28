// netlify/functions/csp-collector.js
// Minimal CSP report collector: logs to Netlify function logs (visible in Netlify UI)
// You can later forward to email/Slack or store in a log service.

export async function handler(event) {
  try {
    const body = event.body || "{}";
    console.log("CSP Report:", body);
  } catch (e) {
    console.error("CSP collector parse error:", e);
  }
  return {
    statusCode: 204, // No Content (silences browser warnings)
  };
}