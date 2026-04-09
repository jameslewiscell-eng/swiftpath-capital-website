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
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`API error ${res.status}: ${text}`);
    }
    return res.json();
  }

  function getDateRange() {
    return document.getElementById('date-range').value;
  }

  function getAccountParam() {
    const el = document.getElementById('account-select');
    return el ? el.value : '';
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

  // ── Tabs ──────────────────────────────────────────────────

  window.switchTab = function (tabId) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));

    const btn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
    if (btn) btn.classList.add('active');

    const panel = document.getElementById(`panel-${tabId}`);
    if (panel) panel.classList.add('active');
  };

  // ── Overview ──────────────────────────────────────────────

  async function loadOverview() {
    const dateRange = getDateRange();
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
    }
  }

  async function loadDaily() {
    const container = document.getElementById('daily-table-container');
    container.innerHTML = '<div class="loading-overlay"><span class="spinner"></span> Loading…</div>';
    const dateRange = getDateRange();

    try {
      const data = await apiGet(`google-ads-report?type=daily&dateRange=${dateRange}${accountQS()}`);
      const rows = data.daily || [];

      if (!rows.length) {
        container.innerHTML = '<p style="color:#6b7280;padding:1rem;">No data for this date range.</p>';
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
        return;
      }

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
    const dateRange = getDateRange();

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

  // ── Refresh All ───────────────────────────────────────────

  window.refreshAll = function () {
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
