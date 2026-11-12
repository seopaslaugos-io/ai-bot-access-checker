import { BOTS, BROWSER_UA } from './bots.js';
import { checkRobots } from './robots.js';

const TIMEOUT_MS = 10000;
const BODY_LIMIT = 65536;

// Markers of interstitial / block pages that some hosts serve with HTTP 200.
const BLOCK_MARKERS = [
  [/<title>\s*Just a moment\.\.\.\s*<\/title>/i, 'Cloudflare challenge page'],
  [/challenges\.cloudflare\.com|cf-chl-|_cf_chl_opt/i, 'Cloudflare challenge page'],
  [/<title>\s*Attention Required!/i, 'Cloudflare block page'],
  [/Sorry, you have been blocked/i, 'Cloudflare block page'],
  [/<title>\s*Access denied/i, 'Access denied page'],
  [/Request unsuccessful\. Incapsula incident/i, 'Imperva/Incapsula block page'],
  [/Mod_Security|ModSecurity/i, 'ModSecurity block page'],
  [/<title>\s*403 Forbidden/i, '403 page'],
  [/sgcaptcha|\.well-known\/sgcaptcha/i, 'SiteGround captcha'],
  [/hcaptcha\.com\/1\/api\.js|g-recaptcha|recaptcha\/api\.js/i, 'Captcha page'],
];

export class InputError extends Error {}

export function normaliseUrl(input) {
  let raw = String(input || '').trim();
  if (!raw) throw new InputError('Give a URL, for example https://example.com/');
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) raw = 'https://' + raw;
  let u;
  try {
    u = new URL(raw);
  } catch {
    throw new InputError(`Not a valid URL: ${input}`);
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new InputError('Only http and https URLs can be checked.');
  if (u.username || u.password) throw new InputError('URLs with credentials are not accepted.');
  if (u.port && u.port !== '80' && u.port !== '443') throw new InputError('Only the default ports 80 and 443 are checked.');
  const h = u.hostname.toLowerCase();
  if (
    h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal') ||
    /^\d+\.\d+\.\d+\.\d+$/.test(h) || h.includes(':') || !h.includes('.')
  ) {
    throw new InputError('Give a public domain name, not an IP address or local host.');
  }
  u.hash = '';
  return u;
}

async function readLimited(res) {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (size < BODY_LIMIT) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.byteLength;
    }
  } finally {
    try { await reader.cancel(); } catch {}
  }
  const buf = new Uint8Array(Math.min(size, BODY_LIMIT));
  let off = 0;
  for (const c of chunks) {
    const n = Math.min(c.byteLength, buf.length - off);
    buf.set(c.subarray(0, n), off);
    off += n;
    if (off >= buf.length) break;
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(buf);
}

async function probe(url, ua) {
  const started = Date.now();
  try {
    const res = await fetch(url.toString(), {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'User-Agent': ua,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en,lt;q=0.8',
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cf: { cacheTtl: 0, cacheEverything: false },
    });
    const body = await readLimited(res);
    let marker = null;
    for (const [re, label] of BLOCK_MARKERS) {
      if (re.test(body)) { marker = label; break; }
    }
    if (!marker && res.headers.get('cf-mitigated') === 'challenge') marker = 'Cloudflare challenge page';
    return {
      status: res.status,
      finalUrl: res.url,
      bytes: body.length,
      marker,
      xRobotsTag: res.headers.get('x-robots-tag'),
      ms: Date.now() - started,
      body,
    };
  } catch (e) {
    const timeout = e && (e.name === 'TimeoutError' || e.name === 'AbortError');
    return { status: 0, error: timeout ? `No answer within ${TIMEOUT_MS / 1000} s` : `Connection failed (${e?.message || e})`, ms: Date.now() - started };
  }
}

function metaRobots(body) {
  const out = [];
  const re = /<meta\b[^>]*>/gi;
  let m;
  while ((m = re.exec(body || ''))) {
    const tag = m[0];
    const name = /name\s*=\s*["']?([^"'\s>]+)/i.exec(tag)?.[1]?.toLowerCase();
    if (name !== 'robots') continue;
    const content = /content\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1];
    if (content) out.push(content);
  }
  return out;
}

const isOk = s => s >= 200 && s < 400;

function serverVerdict(bot, base) {
  if (bot.status === 0) {
    if (base.status === 0) return { verdict: 'unreachable', note: bot.error };
    return { verdict: 'blocked', note: `${bot.error} for this bot, while a normal browser gets HTTP ${base.status}. The server or firewall drops this User-Agent.` };
  }
  if (bot.marker && !(base.marker === bot.marker)) {
    return { verdict: 'blocked', note: `Gets a ${bot.marker} (HTTP ${bot.status}) instead of the page.` };
  }
  if (!isOk(bot.status)) {
    if (isOk(base.status)) {
      const why = bot.status === 429 ? 'rate-limited (429)' : bot.status === 403 ? 'refused (403)' : `answered HTTP ${bot.status}`;
      return { verdict: 'blocked', note: `This User-Agent is ${why} while a normal browser gets HTTP ${base.status}.` };
    }
    return { verdict: 'page_error', note: `HTTP ${bot.status}; a normal browser also gets HTTP ${base.status}, so the page itself fails.` };
  }
  if (base.bytes > 2000 && bot.bytes < base.bytes * 0.2) {
    return { verdict: 'suspicious', note: `HTTP ${bot.status}, but the response is ${bot.bytes} bytes against ${base.bytes} for a browser: possibly a stripped or block page.` };
  }
  return { verdict: 'ok', note: `HTTP ${bot.status}` };
}

export async function runCheck(input, { bots: onlyBots } = {}) {
  const url = normaliseUrl(input);
  const origin = url.origin;
  const pathAndQuery = url.pathname + url.search;

  let list = BOTS;
  if (Array.isArray(onlyBots) && onlyBots.length) {
    const want = new Set(onlyBots.map(b => String(b).toLowerCase()));
    list = BOTS.filter(b => want.has(b.id) || want.has(b.token.toLowerCase()));
    if (!list.length) throw new InputError(`Unknown bots: ${onlyBots.join(', ')}. Known: ${BOTS.map(b => b.token).join(', ')}`);
  }

  const robotsUrl = new URL('/robots.txt', origin);
  const [robotsRes, base] = await Promise.all([probe(robotsUrl, BROWSER_UA), probe(url, BROWSER_UA)]);

  let robotsText = '';
  let robotsState;
  if (robotsRes.status >= 200 && robotsRes.status < 300 && !robotsRes.marker) {
    robotsText = robotsRes.body;
    robotsState = 'found';
  } else if (robotsRes.status >= 400 && robotsRes.status < 500) {
    robotsState = 'missing'; // RFC 9309: 4xx = no restrictions
  } else {
    robotsState = 'unavailable'; // 5xx / network: crawlers treat the site as fully disallowed
  }

  const results = await Promise.all(
    list.map(async b => {
      let robots;
      if (robotsState === 'found') robots = checkRobots(robotsText, b.token, pathAndQuery);
      else if (robotsState === 'missing') robots = { group: null, allowed: true, rule: null };
      else robots = { group: null, allowed: false, rule: 'robots.txt unreachable: crawlers assume everything is disallowed' };

      const row = {
        bot: b.token,
        vendor: b.vendor,
        purpose: b.purpose,
        robots: { allowed: robots.allowed, group: robots.group, rule: robots.rule },
      };
      if (b.fetches === false) {
        row.server = { verdict: 'not_applicable', note: 'Control token only: it is set in robots.txt and never sent as a User-Agent.' };
      } else {
        const p = await probe(url, b.ua);
        const v = serverVerdict(p, base);
        row.server = { verdict: v.verdict, status: p.status, note: v.note, ms: p.ms };
      }
      row.access = !robots.allowed
        ? 'blocked_by_robots'
        : row.server.verdict === 'blocked'
          ? 'blocked_by_server'
          : row.server.verdict === 'ok' || row.server.verdict === 'not_applicable'
            ? 'allowed'
            : row.server.verdict;
      return row;
    }),
  );

  // Firewalls with verified-bot rules (Cloudflare, Akamai, Sucuri...) block requests that claim to be
  // Googlebot or bingbot from IPs outside Google/Microsoft. If our spoofed Googlebot is blocked, the
  // site is checking IPs, so a block on any spoofed bot says nothing about the real crawler.
  const g = results.find(r => r.bot === 'Googlebot');
  const ipVerifying = g && g.server.verdict === 'blocked';
  for (const r of results) {
    if (r.server.verdict !== 'blocked') continue;
    if (r.bot === 'Googlebot' || r.bot === 'bingbot') {
      r.server.verdict = 'inconclusive';
      r.server.note += ` Firewalls often refuse requests that claim to be ${r.bot} from IPs outside ${r.bot === 'Googlebot' ? 'Google' : 'Microsoft'}, so the real crawler may still get in: confirm with URL Inspection in ${r.bot === 'Googlebot' ? 'Google Search Console' : 'Bing Webmaster Tools'}.`;
    } else if (ipVerifying) {
      r.server.verdict = 'inconclusive';
      r.server.note += ' The firewall also refuses a fake Googlebot, so it checks crawler IPs: the real crawler may be treated differently. Check the firewall\'s bot settings or its logs for this bot.';
    }
    if (r.server.verdict === 'inconclusive' && r.access === 'blocked_by_server') r.access = 'inconclusive';
  }

  const meta = metaRobots(base.body);
  const xrt = base.xRobotsTag;
  const noindex = [...meta, xrt || ''].some(v => /noindex|none/i.test(v));

  const counts = results.reduce((a, r) => ((a[r.access] = (a[r.access] || 0) + 1), a), {});
  return {
    url: url.toString(),
    checkedAt: new Date().toISOString(),
    baseline: {
      userAgent: 'Desktop Chrome',
      status: base.status,
      error: base.error || null,
      finalUrl: base.finalUrl || null,
      marker: base.marker || null,
      metaRobots: meta,
      xRobotsTag: xrt || null,
      noindex,
    },
    robotsTxt: { url: robotsUrl.toString(), state: robotsState, status: robotsRes.status },
    summary: counts,
    bots: results,
    limits:
      'Requests are sent from Cloudflare with each bot\'s User-Agent, not from the vendors\' own IP ranges. ' +
      'This catches robots.txt rules and firewalls that block by User-Agent. Firewalls that verify the real bot IP ' +
      '(for example Cloudflare "Block AI bots" or verified-bot rules) can treat a spoofed request differently from the real crawler.',
    by: 'AI Bot Access Checker by Mantas Tamošaitis, SEO specialist, Lithuania: https://seopaslaugos.io/en/tools/ai-bot-access-checker',
  };
}

export function toText(r) {
  const label = {
    allowed: 'ALLOWED',
    blocked_by_robots: 'BLOCKED (robots.txt)',
    blocked_by_server: 'BLOCKED (server/firewall)',
    suspicious: 'CHECK (odd response)',
    inconclusive: 'INCONCLUSIVE (firewall checks bot IPs)',
    page_error: 'PAGE ERROR',
    unreachable: 'UNREACHABLE',
  };
  const lines = [];
  lines.push(`AI bot access for ${r.url}`);
  lines.push(`Browser baseline: ${r.baseline.status ? 'HTTP ' + r.baseline.status : r.baseline.error}${r.baseline.noindex ? ' (page is noindex)' : ''}`);
  lines.push(`robots.txt: ${r.robotsTxt.state} (HTTP ${r.robotsTxt.status || 'none'})`);
  lines.push('');
  for (const b of r.bots) {
    let why = '';
    if (b.access === 'blocked_by_robots') why = ` - ${b.robots.rule}${b.robots.group ? ` (group "${b.robots.group}")` : ''}`;
    else if (b.access === 'inconclusive') why = ` - HTTP ${b.server.status}`;
    else if (b.server.verdict !== 'ok' && b.server.verdict !== 'not_applicable') why = ` - ${b.server.note}`;
    lines.push(`${b.bot.padEnd(18)} ${label[b.access] || b.access}${why}`);
  }
  lines.push('');
  if (r.bots.some(b => b.access === 'inconclusive')) {
    lines.push(
      'INCONCLUSIVE: the firewall refuses requests that claim to be a crawler from IPs outside the vendor\'s range ' +
      '(a fake Googlebot is refused too), so it cannot be told from outside whether the real crawler gets in. ' +
      'Check the firewall\'s bot settings or logs, and URL Inspection in Search Console / Bing Webmaster Tools.',
    );
  }
  lines.push(`Note: ${r.limits}`);
  lines.push(r.by);
  return lines.join('\n');
}
