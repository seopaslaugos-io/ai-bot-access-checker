// Pure helpers for the popup: no DOM, no chrome.* calls, so they can be tested with Node.
// Labels and meanings follow the API's `access` values as documented in the repo README
// ("Results" table) and the text report (src/check.js toText).

export const API = 'https://tools.seopaslaugos.io/v1/check';
export const TOOL_PAGE = 'https://seopaslaugos.io/en/tools/ai-bot-access-checker';
export const SITE = 'https://seopaslaugos.io/en';

// access -> [tone, label, meaning]
export const ACCESS = {
  allowed: ['ok', 'Allowed', 'robots.txt allows it and the server answers it like a browser.'],
  blocked_by_robots: ['bad', 'Blocked by robots.txt', 'A Disallow rule in robots.txt applies to this bot.'],
  blocked_by_server: ['bad', 'Blocked by server/firewall', 'robots.txt allows it, but the server refuses this User-Agent (403, 429, dropped connection, challenge or captcha page).'],
  inconclusive: ['warn', 'Inconclusive', 'The firewall refuses a fake Googlebot too, so it checks crawler IPs; the real crawler may get in.'],
  suspicious: ['warn', 'Odd response', "HTTP 200, but under a fifth of the browser's response size: possibly a stripped or block page."],
  page_error: ['mute', 'Page error', 'A normal browser fails as well, so the page itself fails.'],
  unreachable: ['mute', 'Unreachable', 'Neither the bot nor a normal browser got an answer.'],
};

// Bot categories as the README describes them.
export const KINDS = [
  ['search', 'Search crawlers', 'Build the index AI answers cite'],
  ['user', 'User-triggered fetchers', 'Live visits when someone asks'],
  ['training', 'Training crawlers', 'Collect content for model training'],
];

export const esc = s =>
  String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function isCheckable(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

export function apiUrl(url, { fresh = false } = {}) {
  return `${API}?url=${encodeURIComponent(url)}${fresh ? '&fresh=1' : ''}`;
}

// The web tool reads ?url= and runs the check on load.
export function reportUrl(url) {
  return url && isCheckable(url) ? `${TOOL_PAGE}?url=${encodeURIComponent(url)}` : TOOL_PAGE;
}

// Seconds to wait: the API message names exact seconds for the per-site limit ("Try again in 42 s.");
// otherwise use the Retry-After header (seconds or HTTP date); otherwise 60.
export function retrySeconds(header, message) {
  const m = /(\d+)\s*s\b/.exec(message || '');
  if (m) return Number(m[1]);
  if (header) {
    const n = Number(header);
    if (Number.isFinite(n) && n >= 0) return Math.ceil(n);
    const t = Date.parse(header);
    if (!Number.isNaN(t)) return Math.max(0, Math.ceil((t - Date.now()) / 1000));
  }
  return 60;
}

// Error text for a failed API answer. status 0 = network failure.
export function errorMessage(status, body, retryAfter) {
  const apiMsg = body && typeof body.error === 'string' ? body.error : '';
  if (status === 429) {
    const s = retrySeconds(retryAfter, apiMsg);
    return { title: `Rate limit reached: wait ${s} s`, text: apiMsg || 'Too many checks. Wait a minute and try again.', wait: s };
  }
  if (status === 0) return { title: 'Checker unreachable', text: 'The checker could not be reached. Check your connection and try again in a minute.' };
  if (status === 400) return { title: 'This page cannot be checked', text: apiMsg || 'The checker refused this URL.' };
  return { title: 'Check failed', text: apiMsg || `The checker answered HTTP ${status}. Try again in a minute.` };
}

// Detail text for one bot row (shown on hover and when the row is expanded).
export function detail(x) {
  const parts = [];
  if (x.access === 'blocked_by_robots') {
    const r = x.robots || {};
    parts.push(`${r.rule || 'Disallowed'}${r.group ? ` (user-agent group "${r.group}")` : ''}`);
    if (r.source === 'cloudflare_managed') parts.push('This rule is added by Cloudflare "Managed robots.txt", not by the site files.');
    if (r.vendorNote) parts.push(r.vendorNote);
    if (x.server && (x.server.verdict === 'blocked' || x.server.verdict === 'inconclusive')) parts.push(`Server: ${x.server.note}`);
  } else if (x.server && x.server.verdict === 'not_applicable') {
    parts.push('robots.txt rule only; this token never visits the page.');
  } else if (x.server && x.server.verdict !== 'ok') {
    parts.push(x.server.note || x.server.verdict);
  } else if (x.server) {
    parts.push(`Server answered HTTP ${x.server.status}.`);
  }
  return parts.join(' ');
}

const pill = (tone, label) => `<span class="pill pill-${tone}"><span class="dot" aria-hidden="true"></span>${esc(label)}</span>`;

function row(x) {
  const [tone, label, meaning] = ACCESS[x.access] || ['mute', x.access, ''];
  const d = detail(x);
  const tip = [label + ': ' + meaning, d].filter(Boolean).join('\n');
  return `<details class="bot" title="${esc(tip)}">
  <summary><span class="bot-name"><strong>${esc(x.bot)}</strong><span class="vendor">${esc(x.vendor)}</span></span>${pill(tone, label)}</summary>
  <div class="bot-detail"><p>${esc(d)}</p><p class="muted">${esc(x.purpose)}</p></div>
</details>`;
}

const isOk = s => s >= 200 && s < 400;

// Full result HTML for one API response.
export function renderResult(r) {
  const b = r.baseline || {};
  const rt = r.robotsTxt || {};
  const bots = Array.isArray(r.bots) ? r.bots : [];
  const blocked = bots.filter(x => x.access === 'blocked_by_robots' || x.access === 'blocked_by_server').length;
  const allowed = bots.filter(x => x.access === 'allowed').length;

  const baseTone = isOk(b.status) ? 'ok' : 'mute';
  const robotsTone = rt.state === 'found' || rt.state === 'missing' ? 'ok' : 'bad';
  const robotsText = { found: 'found', missing: 'none (no restrictions)', unavailable: 'unavailable (bots assume full disallow)' }[rt.state] || rt.state;
  const checked = r.checkedAt ? new Date(r.checkedAt) : null;
  const time = checked && !Number.isNaN(+checked) ? checked.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

  const alerts = [];
  if (b.noindex) alerts.push(['bad', 'The page itself is noindex (meta robots or X-Robots-Tag).']);
  if (rt.cloudflareManaged) {
    alerts.push(['warn', `Cloudflare "Managed robots.txt" is on: Cloudflare adds its own AI-bot rules to this robots.txt${rt.ownRules ? '' : ' (the site has no rules of its own)'}. Change it in Cloudflare, not in the site files.`]);
  }

  const groups = KINDS.map(([k, label, sub]) => {
    const list = bots.filter(x => x.category === k);
    if (!list.length) return '';
    return `<section class="group"><h2>${esc(label)}<span class="sub">${esc(sub)}</span></h2>${list.map(row).join('')}</section>`;
  }).join('');
  const other = bots.filter(x => !KINDS.some(([k]) => k === x.category));
  const otherHtml = other.length ? `<section class="group"><h2>Other</h2>${other.map(row).join('')}</section>` : '';

  return `<div class="facts">
  <div class="fact"><span class="fact-label">Browser baseline</span>${pill(baseTone, b.status ? `HTTP ${b.status}` : b.error || 'no answer')}</div>
  <div class="fact"><span class="fact-label">robots.txt</span>${pill(robotsTone, `${robotsText}${rt.status ? ` · HTTP ${rt.status}` : ''}`)}</div>
</div>
${alerts.map(([tone, text]) => `<p class="alert alert-${tone}">${esc(text)}</p>`).join('')}
<p class="summary"><strong>${allowed} of ${bots.length}</strong> bots allowed${blocked ? ` · <strong class="t-bad">${blocked}</strong> blocked` : ''}${time ? ` <span class="muted">· checked ${esc(time)}${r.cached ? ' (saved result, up to 10 min old)' : ''}</span>` : ''}</p>
${groups}${otherHtml}`;
}
