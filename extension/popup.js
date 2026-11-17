import { apiUrl, errorMessage, esc, isCheckable, renderResult, reportUrl } from './render.js';

const $ = id => document.getElementById(id);
const urlEl = $('url');
const btn = $('check');
const statusEl = $('status');
const resultEl = $('result');
const reportEl = $('report');

let pageUrl = null;
let cooldown = null;

// The active tab's URL. activeTab grants it when the user opens the popup.
// Outside the extension (local preview / tests) the URL comes from ?url= instead.
async function activeUrl() {
  if (globalThis.chrome?.tabs?.query) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab?.url || '';
  }
  return new URLSearchParams(location.search).get('url') || '';
}

function showError({ title, text, wait }) {
  statusEl.textContent = '';
  resultEl.innerHTML = `<div class="alert alert-bad"><strong>${esc(title)}</strong><br>${esc(text)}</div>`;
  if (wait) startCooldown(wait);
}

function startCooldown(seconds) {
  clearInterval(cooldown);
  let left = seconds;
  btn.disabled = true;
  btn.textContent = `Wait ${left} s`;
  cooldown = setInterval(() => {
    left -= 1;
    if (left <= 0) {
      clearInterval(cooldown);
      btn.disabled = false;
      btn.textContent = 'Check';
    } else {
      btn.textContent = `Wait ${left} s`;
    }
  }, 1000);
}

async function check(fresh = false) {
  if (!pageUrl) return;
  btn.disabled = true;
  btn.setAttribute('aria-busy', 'true');
  btn.textContent = 'Checking…';
  statusEl.textContent = 'Checking 13 bots… this takes 5–15 seconds.';
  resultEl.innerHTML = '';
  let res;
  let body = null;
  try {
    res = await fetch(apiUrl(pageUrl, { fresh }), { headers: { Accept: 'application/json' } });
    try { body = await res.json(); } catch { body = null; }
  } catch {
    res = null;
  }
  btn.removeAttribute('aria-busy');
  btn.textContent = 'Check';
  btn.disabled = false;

  if (!res) return showError(errorMessage(0));
  if (!res.ok || !body || !Array.isArray(body.bots)) {
    return showError(errorMessage(res.ok ? 500 : res.status, body, res.headers.get('Retry-After')));
  }
  statusEl.textContent = '';
  resultEl.innerHTML = renderResult(body);
  if (body.cached) {
    const again = document.createElement('button');
    again.type = 'button';
    again.className = 'link';
    again.textContent = 'Check again now';
    again.addEventListener('click', () => check(true));
    resultEl.querySelector('.summary')?.append(' ', again);
  }
}

btn.addEventListener('click', () => check(false));

(async () => {
  const url = await activeUrl().catch(() => '');
  if (!url) {
    urlEl.textContent = 'No page address available.';
    return;
  }
  urlEl.textContent = url;
  urlEl.title = url;
  if (!isCheckable(url)) {
    statusEl.textContent = 'This page cannot be checked: only http and https pages can be checked.';
    return;
  }
  pageUrl = url;
  reportEl.href = reportUrl(url);
  btn.disabled = false;
  // Local preview / tests only: ?run=1 starts the check on load.
  if (!globalThis.chrome?.tabs && new URLSearchParams(location.search).get('run') === '1') check(false);
})();
