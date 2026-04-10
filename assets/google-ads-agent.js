// assets/google-ads-agent.js
// Google Ads Agent dashboard — client-side logic

(function () {
  'use strict';

  const API_BASE = '/.netlify/functions';
  let authToken = '';
  let selectedAccount = ''; // empty = default (env var), or alias/ID

  // ── Auth ──────────────────────────────────────────────────

  function getStoredToken() {
    try { return sessionStorage.getItem('gads_agent_token') || ''; } catch { return ''; }
  }

  function storeToken(token) {
    try { sessionStorage.setItem('gads_agent_token', token); } catch { /* noop */ }
  }

  function clearToken() {
    try { sessionStorage.removeItem('gads_agent_token'); } catch { /* noop */ }
  }

  window.authenticate = async function () {
    const input = document.getElementById('auth-key');
    const error = document.getElementById('auth-error');
    const key = input.value.trim();
    error.style.display = 'none';

    if (!key) {
      error.textContent = 'Please enter an access key.';
      error.style.display = 'block';
      return;
    }

    // Validate by making a test call
    try {
      const res = await fetch(`${API_BASE}/google-ads-report?type=overview&dateRange=LAST_7_DAYS${accountQS()}`, {
        headers: { Authorization: `Bearer ${key}` }
      });

      if (res.status === 401) {
        error.textContent = 'Invalid access key. Please try again.';
        error.style.display = 'block';
        return;
      }

      authToken = key;
      storeToken(key);
      showDashboard();
    } catch (err) {
      error.textContent = 'Connection error. Please try again.';
      error.style.display = 'block';
    }
  };

  window.logout = function () {
    authToken = '';
    clearToken();
    document.getElementById('dashboard').style.display = 'none';
    document.getElementById('auth-gate').style.display = 'block';
    document.getElementById('header-user').style.display = 'none';
    document.getElementById('auth-key').value = '';
  };

  function showDashboard() {
    document.getElementById('auth-gate').style.display = 'none';
    document.getElementById('dashboard').style.display = 'block';
    document.getElementById('header-user').style.display = 'block';
    document.getElementById('header-status').textContent = 'Connected';
    refreshAll();
  }

  // ── API Helpers ───────────────────────────────────────────

  async function apiGet(path) {
    const res = await fetch(`${API_BASE}/${path}`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`API error ${res.status}: ${body}`);
    }
    return res.json();
  }

  async function apiPost(path, body) {
    const res = await fetch(`${API_BASE}/${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    if (!res.ok && res.status !== 202) {
      const text = await res.text();
      throw new Error(`API error ${res.status}: ${text}`);
    }
    // Netlify background functions return 202 with an empty body
    if (res.status === 202) return {};
    return res.json();
  }

  function getDateRange() {
    return document.getElementById('date-range').value;
  }
  function normalizeDateRange(dateRange) {
    return dateRange === 'ALL_TIME' ? 'LAST_30_DAYS' : dateRange;
  }

  function getAccountParam() {
    const el = document.getElementById('account-select');
    return el ? el.value : '';
  }
  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function accountQS() {
    const acct = getAccountParam();
    return acct ? `&account=${encodeURIComponent(acct)}` : '';
  }

  // ── Format Helpers ────────────────────────────────────────

  function fmt(n) { return n != null ? n.toLocaleString() : '--'; }
  // SwiftPath's Google Ads account is denominated in COP (Colombian Pesos).
  // COP is a whole-unit currency — no decimals, Spanish-style thousands separators.
  const CURRENCY_FMT = new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
    minimumFractionDigits: 0
  });
  function fmtCurrency(n) {
    if (n == null || Number.isNaN(Number(n))) return '--';
    return CURRENCY_FMT.format(Math.round(Number(n)));
  }
  function fmtPct(n) { return n != null ? (n * 100).toFixed(2) + '%' : '--'; }

  // Google Ads API returns status as a numeric enum
  const STATUS_MAP = { 2: 'ENABLED', 3: 'PAUSED', 4: 'REMOVED' };

  function resolveStatus(status) {
    if (typeof status === 'number') return STATUS_MAP[status] || 'UNKNOWN';
    return (status || 'UNKNOWN').toUpperCase();
  }

  function statusBadge(status) {
    const s = resolveStatus(status);
    let cls = '';
    if (s === 'ENABLED') cls = 'enabled';
    else if (s === 'PAUSED') cls = 'paused';
    else cls = 'removed';
    return `<span class="badge ${cls}">${s}</span>`;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str || ''));
    return div.innerHTML;
  }
  function showAlert(message, level = 'warn') {
    const el = document.getElementById('agent-alert');
    if (!el) return;
    el.textContent = message || '';
    el.style.display = message ? 'block' : 'none';
    if (!message) return;
    if (level === 'error') {
      el.style.background = '#fef2f2';
      el.style.borderColor = '#fca5a5';
      el.style.color = '#991b1b';
      return;
    }
    if (level === 'info') {
      el.style.background = '#eff6ff';
      el.style.borderColor = '#93c5fd';
      el.style.color = '#1e3a8a';
      return;
    }
    el.style.background = '#fff7ed';
    el.style.borderColor = '#fdba74';
    el.style.color = '#9a3412';
  }

  // ── Tabs ──────────────────────────────────────────────────

  window.switchTab = function (tabId) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));

    const btn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
    if (btn) btn.classList.add('active');

    const panel = document.getElementById(`panel-${tabId}`);
    if (panel) panel.classList.add('active');
    if (tabId === 'builder' && authToken) ensureBuilderLoaded();
  };

  // ── Overview ──────────────────────────────────────────────

  async function loadOverview() {
    const dateRange = normalizeDateRange(getDateRange());
    try {
      const data = await apiGet(`google-ads-report?type=overview&dateRange=${dateRange}${accountQS()}`);
      const o = data.overview || {};
      document.getElementById('kpi-impressions').textContent = fmt(o.impressions);
      document.getElementById('kpi-clicks').textContent = fmt(o.clicks);
      document.getElementById('kpi-ctr').textContent = fmtPct(o.ctr);
      document.getElementById('kpi-cpc').textContent = fmtCurrency(o.cpc);
      document.getElementById('kpi-cost').textContent = fmtCurrency(o.cost);
      document.getElementById('kpi-conversions').textContent = fmt(o.conversions);
      document.getElementById('kpi-conv-rate').textContent = fmtPct(o.conversionRate);
      document.getElementById('kpi-cpa').textContent = fmtCurrency(o.costPerConversion);
    } catch (err) {
      console.error('Failed to load overview:', err);
      showAlert('Could not load overview metrics. Verify account access and Google Ads API credentials.', 'error');
    }
  }

  async function loadDaily() {
    const container = document.getElementById('daily-table-container');
    container.innerHTML = '<div class="loading-overlay"><span class="spinner"></span> Loading…</div>';
    const dateRange = normalizeDateRange(getDateRange());

    try {
      const data = await apiGet(`google-ads-report?type=daily&dateRange=${dateRange}${accountQS()}`);
      const rows = data.daily || [];

      if (!rows.length) {
        container.innerHTML = '<p style="color:#6b7280;padding:1rem;">No data for this date range.</p>';
        showAlert('No performance rows returned yet. If this is a new campaign, switch Date Range to All Time and confirm the campaign is ENABLED.', 'info');
        return;
      }

      let html = `<table class="data-table">
        <thead><tr>
          <th>Date</th><th>Impressions</th><th>Clicks</th><th>Cost</th><th>Conversions</th>
        </tr></thead><tbody>`;

      rows.forEach(r => {
        html += `<tr>
          <td>${escapeHtml(r.date)}</td>
          <td>${fmt(r.impressions)}</td>
          <td>${fmt(r.clicks)}</td>
          <td>${fmtCurrency(r.cost)}</td>
          <td>${fmt(r.conversions)}</td>
        </tr>`;
      });

      html += '</tbody></table>';
      container.innerHTML = html;
    } catch (err) {
      container.innerHTML = `<p style="color:#dc2626;padding:1rem;">Error: ${escapeHtml(err.message)}</p>`;
      showAlert('Daily performance query failed. Try refreshing, then switch account if needed.', 'error');
    }
  }

  // ── Campaigns ─────────────────────────────────────────────

  async function loadCampaigns() {
    const container = document.getElementById('campaigns-table-container');
    container.innerHTML = '<div class="loading-overlay"><span class="spinner"></span> Loading campaigns…</div>';

    try {
      const data = await apiGet(`google-ads-campaigns?${accountQS().replace('&', '')}`);
      const campaigns = data.campaigns || [];

      if (!campaigns.length) {
        container.innerHTML = '<p style="color:#6b7280;padding:1rem;">No campaigns found.</p>';
        showAlert('No campaigns were returned for this account. Confirm the campaign was created under the selected account and is not REMOVED.', 'warn');
        return;
      }
      showAlert('');

      let html = `<table class="data-table">
        <thead><tr>
          <th>Campaign</th><th>Status</th><th>Budget</th><th>Impressions</th>
          <th>Clicks</th><th>Cost</th><th>Conv.</th><th>CPA</th><th>Actions</th>
        </tr></thead><tbody>`;

      campaigns.forEach(c => {
        const statusLower = resolveStatus(c.status).toLowerCase();
        const toggleBtn = statusLower === 'enabled'
          ? `<button class="btn-sm pause" onclick="toggleCampaign('${c.id}','PAUSED')">Pause</button>`
          : `<button class="btn-sm enable" onclick="toggleCampaign('${c.id}','ENABLED')">Enable</button>`;

        html += `<tr>
          <td><a href="#" onclick="viewAdGroups('${c.id}','${escapeHtml(c.name)}');return false;" style="color:#1d4ed8;text-decoration:none;font-weight:500;">${escapeHtml(c.name)}</a></td>
          <td>${statusBadge(c.status)}</td>
          <td>${fmtCurrency(c.budget)}/day</td>
          <td>${fmt(c.metrics.impressions)}</td>
          <td>${fmt(c.metrics.clicks)}</td>
          <td>${fmtCurrency(c.metrics.cost)}</td>
          <td>${fmt(c.metrics.conversions)}</td>
          <td>${fmtCurrency(c.metrics.costPerConversion)}</td>
          <td>${toggleBtn}</td>
        </tr>`;
      });

      html += '</tbody></table>';
      container.innerHTML = html;
    } catch (err) {
      container.innerHTML = `<p style="color:#dc2626;padding:1rem;">Error: ${escapeHtml(err.message)}</p>`;
      showAlert('Campaign query failed. This usually means account permissions or token configuration needs attention.', 'error');
    }
  }

  window.toggleCampaign = async function (campaignId, newStatus) {
    try {
      await apiPost('google-ads-campaigns', {
        action: 'updateCampaignStatus',
        campaignId,
        status: newStatus,
        account: getAccountParam()
      });
      await loadCampaigns();
    } catch (err) {
      alert('Failed to update campaign: ' + err.message);
    }
  };

  window.viewAdGroups = async function (campaignId, campaignName) {
    const section = document.getElementById('adgroups-section');
    const container = document.getElementById('adgroups-table-container');
    const nameEl = document.getElementById('adgroups-campaign-name');

    nameEl.textContent = campaignName;
    section.style.display = 'block';
    container.innerHTML = '<div class="loading-overlay"><span class="spinner"></span> Loading ad groups…</div>';

    try {
      const data = await apiGet(`google-ads-campaigns?campaignId=${campaignId}${accountQS()}`);
      const adGroups = data.adGroups || [];

      if (!adGroups.length) {
        container.innerHTML = '<p style="color:#6b7280;padding:1rem;">No ad groups in this campaign.</p>';
        return;
      }

      let html = `<table class="data-table">
        <thead><tr>
          <th>Ad Group</th><th>Status</th><th>Impressions</th>
          <th>Clicks</th><th>Cost</th><th>Conv.</th><th>Actions</th>
        </tr></thead><tbody>`;

      adGroups.forEach(ag => {
        const statusLower = resolveStatus(ag.status).toLowerCase();
        const toggleBtn = statusLower === 'enabled'
          ? `<button class="btn-sm pause" onclick="toggleAdGroup('${ag.id}','PAUSED')">Pause</button>`
          : `<button class="btn-sm enable" onclick="toggleAdGroup('${ag.id}','ENABLED')">Enable</button>`;

        html += `<tr>
          <td>${escapeHtml(ag.name)}</td>
          <td>${statusBadge(ag.status)}</td>
          <td>${fmt(ag.metrics.impressions)}</td>
          <td>${fmt(ag.metrics.clicks)}</td>
          <td>${fmtCurrency(ag.metrics.cost)}</td>
          <td>${fmt(ag.metrics.conversions)}</td>
          <td>${toggleBtn}</td>
        </tr>`;
      });

      html += '</tbody></table>';
      container.innerHTML = html;
    } catch (err) {
      container.innerHTML = `<p style="color:#dc2626;padding:1rem;">Error: ${escapeHtml(err.message)}</p>`;
    }
  };

  window.toggleAdGroup = async function (adGroupId, newStatus) {
    try {
      await apiPost('google-ads-campaigns', {
        action: 'updateAdGroupStatus',
        adGroupId,
        status: newStatus,
        account: getAccountParam()
      });
      // Reload the current ad groups view
      const name = document.getElementById('adgroups-campaign-name').textContent;
      // We can't easily get the campaign ID back, so reload campaigns
      await loadCampaigns();
    } catch (err) {
      alert('Failed to update ad group: ' + err.message);
    }
  };

  // ── Keywords ──────────────────────────────────────────────

  async function loadKeywords() {
    const container = document.getElementById('keywords-table-container');
    container.innerHTML = '<div class="loading-overlay"><span class="spinner"></span> Loading keywords…</div>';
    const dateRange = normalizeDateRange(getDateRange());

    try {
      const data = await apiGet(`google-ads-report?type=keywords&dateRange=${dateRange}${accountQS()}`);
      const keywords = data.keywords || [];

      if (!keywords.length) {
        container.innerHTML = '<p style="color:#6b7280;padding:1rem;">No keyword data for this date range.</p>';
        return;
      }

      let html = `<table class="data-table">
        <thead><tr>
          <th>Keyword</th><th>Match</th><th>Campaign</th><th>Ad Group</th>
          <th>Impressions</th><th>Clicks</th><th>CTR</th><th>CPC</th><th>Cost</th><th>Conv.</th>
        </tr></thead><tbody>`;

      keywords.forEach(k => {
        html += `<tr>
          <td style="font-weight:500;">${escapeHtml(k.keyword)}</td>
          <td>${escapeHtml(k.matchType)}</td>
          <td>${escapeHtml(k.campaign)}</td>
          <td>${escapeHtml(k.adGroup)}</td>
          <td>${fmt(k.impressions)}</td>
          <td>${fmt(k.clicks)}</td>
          <td>${fmtPct(k.ctr)}</td>
          <td>${fmtCurrency(k.cpc)}</td>
          <td>${fmtCurrency(k.cost)}</td>
          <td>${fmt(k.conversions)}</td>
        </tr>`;
      });

      html += '</tbody></table>';
      container.innerHTML = html;
    } catch (err) {
      container.innerHTML = `<p style="color:#dc2626;padding:1rem;">Error: ${escapeHtml(err.message)}</p>`;
    }
  }

  // ── Ad Copy Generator ─────────────────────────────────────

  window.generateCopy = async function () {
    const btn = document.getElementById('generate-btn');
    const resultDiv = document.getElementById('copy-result');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Generating…';
    resultDiv.style.display = 'none';

    const existingText = document.getElementById('copy-existing').value.trim();
    const existingHeadlines = existingText ? existingText.split('\n').filter(Boolean) : [];

    try {
      const data = await apiPost('google-ads-copy', {
        campaignType: document.getElementById('copy-campaign-type').value,
        loanProduct: document.getElementById('copy-loan-product').value,
        targetAudience: document.getElementById('copy-audience').value,
        tone: document.getElementById('copy-tone').value,
        existingHeadlines
      });

      const copy = data.adCopy || {};
      renderAdCopy(copy);
      resultDiv.style.display = 'block';
    } catch (err) {
      alert('Failed to generate ad copy: ' + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Generate Ad Copy with AI';
    }
  };

  function renderAdCopy(copy) {
    // RSA Headlines
    const rsaH = document.getElementById('rsa-headlines');
    const headlines = (copy.responsive_search_ad && copy.responsive_search_ad.headlines) || [];
    rsaH.innerHTML = headlines.map(h => `<span class="headline-chip">${escapeHtml(h)}</span>`).join('');

    // RSA Descriptions
    const rsaD = document.getElementById('rsa-descriptions');
    const descriptions = (copy.responsive_search_ad && copy.responsive_search_ad.descriptions) || [];
    rsaD.innerHTML = descriptions.map(d => `<div class="desc-block">${escapeHtml(d)}</div>`).join('');

    // Display Ad
    const dispEl = document.getElementById('display-copy');
    const disp = copy.display_ad || {};
    dispEl.innerHTML = `
      <div class="desc-block"><strong>Short:</strong> ${escapeHtml(disp.short_headline || '')}</div>
      <div class="desc-block"><strong>Long:</strong> ${escapeHtml(disp.long_headline || '')}</div>
      <div class="desc-block"><strong>Desc:</strong> ${escapeHtml(disp.description || '')}</div>
    `;

    // Sitelinks
    const slEl = document.getElementById('sitelinks');
    const sitelinks = copy.sitelink_extensions || [];
    slEl.innerHTML = sitelinks.map(s =>
      `<div class="desc-block"><strong>${escapeHtml(s.text)}</strong><br>${escapeHtml(s.description1 || '')} | ${escapeHtml(s.description2 || '')}</div>`
    ).join('');

    // Callouts
    const coEl = document.getElementById('callouts');
    const callouts = copy.callout_extensions || [];
    coEl.innerHTML = callouts.map(c => `<span class="headline-chip">${escapeHtml(c)}</span>`).join('');
  }

  // ── Campaign Builder (Phase 4a) ──────────────────────────

  let funnelPages = [];
  let builderLoaded = false;
  let lastBlueprint = null;

  function renderBuilderPageOptions() {
    const select = document.getElementById('builder-page-select');
    if (!select) return;
    if (!funnelPages.length) {
      select.innerHTML = '<option value="">No funnel pages found</option>';
      return;
    }
    select.innerHTML = funnelPages
      .map(p => `<option value="${escapeHtml(p.path)}">${escapeHtml(p.label)} (${escapeHtml(p.path)})</option>`)
      .join('');
  }

  async function ensureBuilderLoaded() {
    if (builderLoaded) return;
    const statusEl = document.getElementById('builder-status');
    if (!statusEl) return;
    try {
      const data = await apiGet('funnel-analyzer?list=1');
      funnelPages = Array.isArray(data.pages) ? data.pages : [];
      renderBuilderPageOptions();
      statusEl.textContent = funnelPages.length
        ? `Loaded ${funnelPages.length} funnel pages.`
        : 'No funnel pages found.';
      builderLoaded = true;
    } catch (err) {
      statusEl.textContent = `Failed to load funnel pages: ${err.message}`;
    }
  }

  function makeJobId() {
    return `bp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  async function pollBlueprint(jobId) {
    const maxAttempts = 80;
    const delayMs = 2500;
    for (let i = 0; i < maxAttempts; i++) {
      const data = await apiGet(`campaign-blueprint-status?jobId=${encodeURIComponent(jobId)}`);
      if (data.status === 'ready' || data.status === 'error') return data;
      await sleep(delayMs);
    }
    throw new Error('Timed out waiting for blueprint job to finish');
  }

  window.generateBlueprint = async function () {
    const btn = document.getElementById('builder-generate-btn');
    const select = document.getElementById('builder-page-select');
    const statusEl = document.getElementById('builder-status');
    const valEl = document.getElementById('builder-validation');
    const jsonEl = document.getElementById('builder-json');
    const path = select ? select.value : '';
    if (!path) {
      if (statusEl) statusEl.textContent = 'Choose a funnel page first.';
      return;
    }
    if (!btn || !statusEl || !valEl || !jsonEl) return;

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Generating…';
    statusEl.textContent = `Analyzing ${path}…`;
    valEl.style.display = 'none';
    jsonEl.style.display = 'none';
    jsonEl.textContent = '';

    try {
      const analysisRes = await apiGet(`funnel-analyzer?url=${encodeURIComponent(path)}`);
      const analysis = analysisRes.analysis;
      if (!analysis || !analysis.path) {
        throw new Error('Funnel analyzer did not return a valid analysis payload.');
      }

      const jobId = makeJobId();
      statusEl.textContent = `Queued background generation (job ${jobId}).`;
      await apiPost('campaign-blueprint-background', {
        jobId,
        analysis,
        account: getAccountParam()
      });

      statusEl.textContent = `Generating blueprint for ${path}…`;
      const result = await pollBlueprint(jobId);
      if (result.status === 'error') {
        throw new Error(result.error || 'Background job failed');
      }

      const validation = result.validation || { errors: [], warnings: [] };
      const errs = validation.errors || [];
      const warns = validation.warnings || [];
      valEl.style.display = 'block';
      valEl.style.color = errs.length ? '#991b1b' : '#065f46';
      let valHtml = `<strong>Validation: ${errs.length} errors, ${warns.length} warnings.</strong>`;
      if (errs.length) valHtml += '<ul style="margin:0.4rem 0 0;padding-left:1.25rem;">' + errs.map(e => `<li>${escapeHtml(e)}</li>`).join('') + '</ul>';
      if (warns.length) valHtml += '<ul style="margin:0.4rem 0 0;padding-left:1.25rem;color:#92400e;">' + warns.map(w => `<li>${escapeHtml(w)}</li>`).join('') + '</ul>';
      valEl.innerHTML = valHtml;

      jsonEl.style.display = 'block';
      jsonEl.textContent = JSON.stringify(result.blueprint || result, null, 2);
      statusEl.textContent = `Blueprint ready for ${path}.`;

      // Store blueprint and show the create button (only if validation passed)
      lastBlueprint = result.blueprint || null;
      const createBar = document.getElementById('builder-create-bar');
      const createResult = document.getElementById('builder-create-result');
      if (createBar) createBar.style.display = lastBlueprint ? 'block' : 'none';
      if (createResult) { createResult.style.display = 'none'; createResult.innerHTML = ''; }
    } catch (err) {
      statusEl.textContent = `Blueprint generation failed: ${err.message}`;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Generate Blueprint';
    }
  };

  // ── Campaign Blueprint → Create ──────────────────────────

  window.createBlueprintCampaign = async function () {
    const btn = document.getElementById('builder-create-btn');
    const resultEl = document.getElementById('builder-create-result');
    if (!lastBlueprint) {
      alert('No blueprint loaded. Generate a blueprint first.');
      return;
    }

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Creating…';
    resultEl.style.display = 'none';

    try {
      const data = await apiPost('campaign-blueprint-create', {
        blueprint: lastBlueprint,
        account: getAccountParam()
      });

      resultEl.style.display = 'block';
      resultEl.style.color = '#065f46';
      resultEl.innerHTML =
        `<strong>Campaign created!</strong> ID: <code>${escapeHtml(String(data.campaignId))}</code> &mdash; ` +
        `${data.summary.adGroupsCreated} ad groups, ` +
        `${data.summary.negativeKeywordsAdded} negative keywords, ` +
        `${data.summary.geoTargetsAdded} geo targets. ` +
        `Campaign is <strong>PAUSED</strong> &mdash; enable it in the Campaigns tab when ready.`;

      // Refresh campaigns tab so the new one appears
      loadCampaigns && loadCampaigns();
    } catch (err) {
      resultEl.style.display = 'block';
      resultEl.style.color = '#991b1b';
      resultEl.innerHTML = `<strong>Create failed:</strong> ${escapeHtml(err.message)}`;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Create Campaign in Google Ads';
    }
  };

  // ── Refresh All ───────────────────────────────────────────

  window.refreshAll = function () {
    showAlert('');
    loadOverview();
    loadDaily();
    loadCampaigns();
    loadKeywords();
  };

  // ── Date range change handler ─────────────────────────────

  document.getElementById('date-range').addEventListener('change', function () {
    if (authToken) refreshAll();
  });

  // ── Account switcher handler ──────────────────────────────
  const accountSelect = document.getElementById('account-select');
  if (accountSelect) {
    accountSelect.addEventListener('change', function () {
      if (authToken) refreshAll();
    });
  }

  // ── Auth key enter handler ────────────────────────────────

  document.getElementById('auth-key').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') window.authenticate();
  });

  // ── Auto-login if token stored ────────────────────────────

  const stored = getStoredToken();
  if (stored) {
    authToken = stored;
    showDashboard();
  }
})();
