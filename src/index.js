import { runCheck, toText, InputError, normaliseUrl } from './check.js';
import { BOTS } from './bots.js';
import { openapi } from './openapi.js';
export { HostLimit } from './hostlimit.js';

const TARGET_LIMIT = 6; // fresh checks per checked host per minute, all callers together

const VERSION = '1.2.0';
const DOCS = 'https://seopaslaugos.io/en/tools/ai-bot-access-checker';
const CACHE_SECONDS = 600;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version, Authorization',
  'Access-Control-Expose-Headers': 'Mcp-Session-Id',
};

const SECURITY = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Cache-Control': 'no-store',
};
const MAX_BODY_BYTES = 16 * 1024;

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS, ...SECURITY, ...extra },
  });
}

class LimitError extends Error {}

// Per caller IP: 20 checks a minute (wrangler.toml LIMITER).
async function limitCaller(env, request) {
  if (!env.LIMITER) return;
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const { success } = await env.LIMITER.limit({ key: ip });
  if (!success) throw new LimitError('Too many checks from your IP. Wait a minute and try again.');
}

// Per checked site: a few fresh checks a minute no matter how many callers or IPs ask, so
// the checker cannot be used to flood one website (each check sends ~14 requests to it).
async function limitTarget(env, host) {
  if (!env.HOST_LIMIT) return;
  const stub = env.HOST_LIMIT.get(env.HOST_LIMIT.idFromName(host));
  const r = await stub.take(TARGET_LIMIT, 60000);
  if (!r.ok) throw new LimitError(`${host} was checked ${TARGET_LIMIT} times in the last minute. Try again in ${r.retryAfter} s.`);
}

// Body reader with a hard size cap (requests are tiny; anything big is abuse).
async function readJson(request) {
  const len = Number(request.headers.get('content-length') || 0);
  if (len > MAX_BODY_BYTES) throw new InputError('Request body is too large.');
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) throw new InputError('Request body is too large.');
  return JSON.parse(text);
}

// Validates first, then serves from cache, and only on a miss spends the per-site budget.
// The cache key is the normalised URL so trivial spelling variants share one entry.
async function cachedCheck(rawUrl, bots, env, ctx) {
  const url = normaliseUrl(rawUrl);
  const botKey = (bots || []).map(b => String(b).toLowerCase().slice(0, 40)).sort().join(',');
  const key = new Request(
    'https://cache.internal/' + VERSION + '/v1/check?' + new URLSearchParams({ url: url.toString(), bots: botKey }).toString(),
  );
  const cache = caches.default;
  const hit = await cache.match(key);
  if (hit) return hit.json();
  await limitTarget(env, url.hostname.toLowerCase());
  const result = await runCheck(url.toString(), { bots });
  ctx.waitUntil(
    cache.put(key, new Response(JSON.stringify(result), { headers: { 'Cache-Control': `max-age=${CACHE_SECONDS}` } })),
  );
  return result;
}

function parseBots(v) {
  if (!v) return undefined;
  if (Array.isArray(v)) return v.slice(0, 20).map(String);
  return String(v).slice(0, 400).split(',').map(s => s.trim()).filter(Boolean);
}

function errorResponse(e) {
  if (e instanceof InputError) return json({ error: e.message }, 400);
  if (e instanceof LimitError) return json({ error: e.message }, 429, { 'Retry-After': '60' });
  console.error('check failed', e);
  return json({ error: 'Check failed. Try again in a minute.' }, 500);
}

/* ---------------- REST ---------------- */

async function handleCheck(request, env, ctx) {
  try {
    let url, bots, format;
    if (request.method === 'POST') {
      let body;
      try { body = await readJson(request); } catch (e) {
        if (e instanceof InputError) throw e;
        throw new InputError('Body must be JSON: {"url": "https://example.com/"}');
      }
      if (!body || typeof body !== 'object') throw new InputError('Body must be a JSON object.');
      url = body.url; bots = parseBots(body.bots); format = body.format;
    } else if (request.method === 'GET') {
      const q = new URL(request.url).searchParams;
      url = q.get('url'); bots = parseBots(q.get('bots')); format = q.get('format');
    } else {
      return json({ error: 'Use GET or POST.' }, 405, { Allow: 'GET, POST' });
    }
    await limitCaller(env, request);
    const result = await cachedCheck(url, bots, env, ctx);
    if (format === 'text') return new Response(toText(result), { headers: { 'Content-Type': 'text/plain; charset=utf-8', ...CORS, ...SECURITY } });
    return json(result);
  } catch (e) {
    return errorResponse(e);
  }
}

/* ---------------- MCP (Streamable HTTP, JSON responses) ---------------- */

const TOOL = {
  name: 'check_ai_bot_access',
  title: 'Check AI bot access',
  description:
    'Checks whether AI crawlers and search bots (GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-SearchBot, Claude-User, ' +
    'PerplexityBot, Perplexity-User, Googlebot, Google-Extended, bingbot, Applebot-Extended, CCBot) can reach a page. ' +
    'For each bot it reports the robots.txt rule that applies and whether the server or firewall blocks that User-Agent ' +
    '(403, 429, dropped connection, challenge or captcha page) compared with a normal browser. ' +
    'Use it when someone asks why ChatGPT, Claude, Perplexity or Google AI Overviews cannot see or cite their site.',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Page to check, for example https://example.com/ or example.com/pricing' },
      bots: {
        type: 'array',
        items: { type: 'string', enum: BOTS.map(b => b.token) },
        description: 'Optional subset of bots to check. Default: all.',
      },
    },
    required: ['url'],
  },
  annotations: { readOnlyHint: true, openWorldHint: true, destructiveHint: false, idempotentHint: true },
};

const SERVER_INFO = { name: 'ai-bot-access-checker', title: 'AI Bot Access Checker', version: VERSION, websiteUrl: DOCS };

const INSTRUCTIONS =
  'One tool: check_ai_bot_access(url). It tells which AI and search crawlers can reach a page and, when one cannot, ' +
  'whether robots.txt or the server/firewall blocks it. Built by Mantas Tamošaitis, SEO specialist in Lithuania (seopaslaugos.io).';

async function rpc(msg, env, ctx, request) {
  if (!msg || typeof msg !== 'object') return { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid request' } };
  const { id, method, params } = msg;
  const ok = result => ({ jsonrpc: '2.0', id, result });
  const err = (code, message) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });

  switch (method) {
    case 'initialize': {
      const asked = params?.protocolVersion;
      const supported = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
      return ok({
        protocolVersion: supported.includes(asked) ? asked : supported[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: INSTRUCTIONS,
      });
    }
    case 'ping':
      return ok({});
    case 'tools/list':
      return ok({ tools: [TOOL] });
    case 'tools/call': {
      if (params?.name !== TOOL.name) return err(-32602, 'Unknown tool');
      const a = (params && typeof params.arguments === 'object' && params.arguments) || {};
      try {
        await limitCaller(env, request);
        const r = await cachedCheck(a.url, parseBots(a.bots), env, ctx);
        return ok({ content: [{ type: 'text', text: toText(r) }], structuredContent: r, isError: false });
      } catch (e) {
        const message = e instanceof InputError || e instanceof LimitError ? e.message : 'Check failed. Try again in a minute.';
        if (!(e instanceof InputError || e instanceof LimitError)) console.error('mcp check failed', e);
        return ok({ content: [{ type: 'text', text: message }], isError: true });
      }
    }
    case 'resources/list':
      return ok({ resources: [] });
    case 'prompts/list':
      return ok({ prompts: [] });
    default:
      if (id === undefined) return null; // notification
      return err(-32601, `Method not found: ${method}`);
  }
}

async function handleMcp(request, env, ctx) {
  if (request.method === 'GET') {
    return new Response('This MCP server answers POST requests only (no server-sent event stream).', {
      status: 405, headers: { Allow: 'POST', ...CORS },
    });
  }
  if (request.method === 'DELETE') return new Response(null, { status: 204, headers: { ...CORS, ...SECURITY } });
  if (request.method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'POST', ...CORS } });

  let body;
  try { body = await readJson(request); } catch {
    return json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, 400);
  }
  const calls = Array.isArray(body) ? body : [body];
  // Batches are capped and may hold at most one check, so a batch cannot bypass the rate limit.
  if (calls.length === 0 || calls.length > 10) {
    return json({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Send 1 to 10 messages per request.' } }, 400);
  }
  if (calls.filter(c => c?.method === 'tools/call').length > 1) {
    return json({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'One tools/call per request.' } }, 400);
  }
  const out = (await Promise.all(calls.map(c => rpc(c, env, ctx, request)))).filter(Boolean);
  if (!out.length) return new Response(null, { status: 202, headers: { ...CORS, ...SECURITY } });
  return json(Array.isArray(body) ? out : out[0]);
}

/* ---------------- Router ---------------- */

const HOME = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>AI Bot Access Checker API</title><link rel="canonical" href="${DOCS}">
<style>body{font:16px/1.6 system-ui,sans-serif;max-width:680px;margin:48px auto;padding:0 16px;color:#111}code{background:#f2f4f7;padding:2px 5px;border-radius:4px}</style></head>
<body><h1>AI Bot Access Checker API</h1>
<p>Checks whether GPTBot, ClaudeBot, PerplexityBot, Googlebot and other AI crawlers can reach a page, and whether robots.txt or the server blocks them.</p>
<ul><li>REST: <code>GET /v1/check?url=example.com</code> (<a href="/openapi.json">OpenAPI</a>)</li>
<li>MCP (Streamable HTTP): <code>https://tools.seopaslaugos.io/mcp</code></li></ul>
<p>Docs and the free web version: <a href="${DOCS}">seopaslaugos.io/en/tools/ai-bot-access-checker</a>.<br>
Built by Mantas Tamošaitis, SEO specialist in Lithuania, <a href="https://seopaslaugos.io/en">seopaslaugos.io</a>.</p></body></html>`;

export default {
  async fetch(request, env, ctx) {
    try {
      return await route(request, env, ctx);
    } catch (e) {
      console.error('unhandled', e);
      return json({ error: 'Internal error' }, 500);
    }
  },
};

async function route(request, env, ctx) {
  {
    const { pathname } = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (pathname === '/mcp' || pathname === '/mcp/') return handleMcp(request, env, ctx);
    if (pathname === '/v1/check') return handleCheck(request, env, ctx);
    if (pathname === '/v1/bots') return json({ bots: BOTS.map(({ ua, ...b }) => ({ ...b, userAgent: ua || null })) });
    if (pathname === '/openapi.json') return json(openapi(VERSION));
    if (pathname === '/health') return json({ ok: true, version: VERSION });
    if (pathname === '/robots.txt') return new Response('User-agent: *\nAllow: /\n', { headers: { 'Content-Type': 'text/plain' } });
    if (pathname === '/') return new Response(HOME, { headers: { 'Content-Type': 'text/html; charset=utf-8', ...SECURITY, 'Cache-Control': 'public, max-age=3600', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'" } });
    return json({ error: 'Not found', docs: DOCS }, 404);
  }
}
