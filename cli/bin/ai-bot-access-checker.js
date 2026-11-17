#!/usr/bin/env node
// AI Bot Access Checker CLI: asks the free API at tools.seopaslaugos.io whether AI and search
// crawlers can reach a URL. Zero dependencies, Node >= 18 (global fetch).
//
// Exit codes: 0 = no bot blocked, 1 = at least one bot blocked (robots.txt or server/firewall),
// 2 = error (bad input, rate limit, network or API failure).

import { readFileSync } from 'node:fs';

const API = 'https://tools.seopaslaugos.io/v1/check';
const WEB = 'https://seopaslaugos.io/en/tools/ai-bot-access-checker';
const { version: VERSION } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

const HELP = `AI Bot Access Checker ${VERSION}
Can GPTBot, ClaudeBot, PerplexityBot, Googlebot and 9 more AI crawlers reach a page?

Usage
  ai-bot-access-checker <url> [--bots GPTBot,ClaudeBot] [--json] [--fresh]

Options
  --bots <list>   Only check these bots (comma-separated robots.txt tokens)
  --json          Print the raw API JSON
  --fresh         Skip the 10-minute result cache and re-check now
  --no-color      Plain output (also when NO_COLOR is set or output is not a terminal)
  -h, --help      Show this help
  -v, --version   Show the version

Exit codes
  0  no bot is blocked
  1  at least one bot is blocked by robots.txt or by the server/firewall
  2  error (bad input, rate limit, network or API failure)

Bots: GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-SearchBot, Claude-User,
PerplexityBot, Perplexity-User, Googlebot, Google-Extended, bingbot, Applebot-Extended, CCBot

Web version: ${WEB}`;

function parseArgs(argv) {
  const o = { url: null, bots: null, json: false, fresh: false, color: true, help: false, version: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') o.help = true;
    else if (a === '-v' || a === '--version') o.version = true;
    else if (a === '--json') o.json = true;
    else if (a === '--fresh') o.fresh = true;
    else if (a === '--no-color') o.color = false;
    else if (a === '--bots') {
      if (argv[i + 1] === undefined || argv[i + 1].startsWith('--')) throw new UsageError('--bots needs a list, for example --bots GPTBot,ClaudeBot');
      o.bots = argv[++i];
    } else if (a.startsWith('--bots=')) o.bots = a.slice(7);
    else if (a.startsWith('-')) throw new UsageError(`Unknown option ${a}`);
    else if (!o.url) o.url = a;
    else throw new UsageError(`Unexpected argument ${a}`);
  }
  return o;
}

class UsageError extends Error {}

// access -> [label, colour]; wording follows the API's text report and README "Results" table.
const ACCESS = {
  allowed: ['ALLOWED', 'green'],
  blocked_by_robots: ['BLOCKED (robots.txt)', 'red'],
  blocked_by_server: ['BLOCKED (server/firewall)', 'red'],
  inconclusive: ['INCONCLUSIVE (firewall checks bot IPs)', 'yellow'],
  suspicious: ['CHECK (odd response)', 'yellow'],
  page_error: ['PAGE ERROR', 'gray'],
  unreachable: ['UNREACHABLE', 'gray'],
};
const KINDS = [
  ['search', 'Search crawlers', 'build the index AI answers cite'],
  ['user', 'User-triggered fetchers', 'live visits when someone asks'],
  ['training', 'Training crawlers', 'collect content for model training'],
];
const BLOCKED = new Set(['blocked_by_robots', 'blocked_by_server']);

function painter(enabled) {
  const codes = { red: 31, green: 32, yellow: 33, gray: 90, bold: 1, dim: 2 };
  const p = {};
  for (const [k, c] of Object.entries(codes)) p[k] = s => (enabled ? `\x1b[${c}m${s}\x1b[0m` : String(s));
  return p;
}

function reason(b) {
  if (b.access === 'blocked_by_robots') {
    const r = b.robots || {};
    let t = `${r.rule || 'Disallowed'}${r.group ? ` (group "${r.group}")` : ''}`;
    if (r.source === 'cloudflare_managed') t += ' [added by Cloudflare]';
    if (r.vendorNote) t += ` NOTE: ${r.vendorNote}`;
    return t;
  }
  if (b.server && b.server.verdict !== 'ok' && b.server.verdict !== 'not_applicable') return b.server.note || '';
  return '';
}

function format(r, color = false) {
  const c = painter(color);
  const out = [];
  const base = r.baseline || {};
  const rt = r.robotsTxt || {};
  out.push(c.bold(`AI bot access for ${r.url}`));
  out.push(c.dim(`Checked at ${r.checkedAt}${r.cached ? ' (saved result, up to 10 min old; use --fresh to re-check)' : ''}`));
  out.push(`Browser baseline: ${base.status ? 'HTTP ' + base.status : base.error || 'no answer'}${base.noindex ? c.red(' (page is noindex)') : ''}`);
  out.push(`robots.txt: ${rt.state} (HTTP ${rt.status || 'none'})`);
  if (rt.cloudflareManaged) {
    out.push(c.yellow(`  Cloudflare "Managed robots.txt" is on: Cloudflare adds its own AI-bot rules to this file${rt.ownRules ? '' : ' (the site has no rules of its own)'}. Change it in Cloudflare, not in the site files.`));
  }
  const bots = Array.isArray(r.bots) ? r.bots : [];
  const width = Math.max(18, ...bots.map(b => b.bot.length + 2));
  const kinds = [...KINDS, ...[...new Set(bots.map(b => b.category))].filter(k => !KINDS.some(([x]) => x === k)).map(k => [k, k, ''])];
  for (const [k, label, sub] of kinds) {
    const list = bots.filter(b => b.category === k);
    if (!list.length) continue;
    out.push('');
    out.push(`${c.bold(label)}${sub ? c.dim(` - ${sub}`) : ''}`);
    for (const b of list) {
      const [txt, col] = ACCESS[b.access] || [String(b.access).toUpperCase(), 'gray'];
      const why = reason(b);
      out.push(`  ${b.bot.padEnd(width)}${c[col](txt)}${why ? c.dim(` - ${why}`) : ''}`);
    }
  }
  const s = r.summary || {};
  const blocked = bots.filter(b => BLOCKED.has(b.access)).length;
  out.push('');
  out.push(`${s.allowed || 0} of ${bots.length} allowed${blocked ? c.red(`, ${blocked} blocked`) : ''}.`);
  if (bots.some(b => b.access === 'inconclusive')) {
    out.push(c.dim('INCONCLUSIVE: the firewall also refuses a fake Googlebot, so it checks crawler IPs; the real crawler may still get in. Check the firewall\'s bot settings or logs.'));
  }
  if (r.limits) out.push(c.dim(`Note: ${r.limits}`));
  out.push(c.dim(`Full report: ${WEB}?url=${encodeURIComponent(r.url)}`));
  return out.join('\n');
}

async function main() {
  let o;
  try {
    o = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(`Error: ${e.message}\nRun ai-bot-access-checker --help for usage.`);
    return 2;
  }
  if (o.help) { console.log(HELP); return 0; }
  if (o.version) { console.log(VERSION); return 0; }
  if (!o.url) { console.error(`Error: give a URL, for example https://example.com/\n\n${HELP}`); return 2; }

  const q = new URLSearchParams({ url: o.url });
  if (o.bots) q.set('bots', o.bots);
  if (o.fresh) q.set('fresh', '1');

  let res, body;
  try {
    res = await fetch(`${API}?${q}`, {
      headers: { Accept: 'application/json', 'User-Agent': `ai-bot-access-checker-cli/${VERSION}` },
      signal: AbortSignal.timeout(60000),
    });
  } catch (e) {
    const t = e && (e.name === 'TimeoutError' || e.name === 'AbortError');
    console.error(`Error: ${t ? 'the checker did not answer within 60 s' : `could not reach the checker (${e?.cause?.code || e?.message || e})`}. Try again in a minute.`);
    return 2;
  }
  try { body = await res.json(); } catch { body = null; }

  if (res.status === 429) {
    // The per-site message names exact seconds; Retry-After is the upper bound.
    const msg = body?.error || 'Too many checks.';
    const wait = Number(/(\d+)\s*s\b/.exec(msg)?.[1]) || Number(res.headers.get('retry-after')) || 60;
    console.error(`Rate limit reached (HTTP 429): ${msg}`);
    console.error(`Retry after ${wait} s.`);
    console.error('Limits: 20 checks a minute per IP address, 6 fresh checks a minute per checked website.');
    return 2;
  }
  if (!res.ok || !body || !Array.isArray(body.bots)) {
    console.error(`Error: ${body?.error || `the checker answered HTTP ${res.status}`}`);
    return 2;
  }

  const color = o.color && !o.json && process.stdout.isTTY && !('NO_COLOR' in process.env);
  console.log(o.json ? JSON.stringify(body, null, 2) : format(body, color));
  return body.bots.some(b => BLOCKED.has(b.access)) ? 1 : 0;
}

main().then(
  code => { process.exitCode = code; },
  e => { console.error(`Error: ${e?.message || e}`); process.exitCode = 2; },
);
