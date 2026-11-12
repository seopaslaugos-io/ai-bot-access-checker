import { runCheck, toText, InputError } from './check.js';
import { BOTS } from './bots.js';
import { openapi } from './openapi.js';

const VERSION = '1.0.0';
const DOCS = 'https://seopaslaugos.io/en/tools/ai-bot-access-checker';
const CACHE_SECONDS = 600;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version, Authorization',
  'Access-Control-Expose-Headers': 'Mcp-Session-Id',
};

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS, ...extra },
  });
}

async function limited(env, request) {
  if (!env.LIMITER) return false;
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const { success } = await env.LIMITER.limit({ key: ip });
  return !success;
}

// Cached wrapper so repeated checks of one URL do not hammer the target site.
async function cachedCheck(url, bots, ctx) {
  const key = new Request(
    'https://cache.internal/v1/check?' + new URLSearchParams({ url, bots: (bots || []).join(',') }).toString(),
  );
  const cache = caches.default;
  const hit = await cache.match(key);
  if (hit) return hit.json();
  const result = await runCheck(url, { bots });
  ctx.waitUntil(
    cache.put(key, new Response(JSON.stringify(result), { headers: { 'Cache-Control': `max-age=${CACHE_SECONDS}` } })),
  );
  return result;
}

function parseBots(v) {
  if (!v) return undefined;
  if (Array.isArray(v)) return v;
  return String(v).split(',').map(s => s.trim()).filter(Boolean);
}

/* ---------------- REST ---------------- */

async function handleCheck(request, env, ctx) {
  let url, bots, format;
  if (request.method === 'POST') {
    let body;
    try { body = await request.json(); } catch { return json({ error: 'Body must be JSON: {"url": "https://example.com/"}' }, 400); }
    url = body.url; bots = parseBots(body.bots); format = body.format;
  } else {
    const q = new URL(request.url).searchParams;
    url = q.get('url'); bots = parseBots(q.get('bots')); format = q.get('format');
  }
  if (await limited(env, request)) return json({ error: 'Too many checks from your IP. Wait a minute and try again.' }, 429);
  try {
    const result = await cachedCheck(url, bots, ctx);
    if (format === 'text') return new Response(toText(result), { headers: { 'Content-Type': 'text/plain; charset=utf-8', ...CORS } });
    return json(result);
  } catch (e) {
    if (e instanceof InputError) return json({ error: e.message }, 400);
    return json({ error: 'Check failed', detail: String(e?.message || e) }, 500);
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

async function rpc(msg, env, ctx) {
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
      if (params?.name !== TOOL.name) return err(-32602, `Unknown tool: ${params?.name}`);
      const a = params.arguments || {};
      try {
        const r = await cachedCheck(a.url, parseBots(a.bots), ctx);
        return ok({ content: [{ type: 'text', text: toText(r) }], structuredContent: r, isError: false });
      } catch (e) {
        const message = e instanceof InputError ? e.message : `Check failed: ${e?.message || e}`;
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
  if (request.method === 'DELETE') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'POST', ...CORS } });

  let body;
  try { body = await request.json(); } catch {
    return json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, 400);
  }
  const calls = Array.isArray(body) ? body : [body];
  if (calls.some(c => c?.method === 'tools/call') && (await limited(env, request))) {
    return json({ jsonrpc: '2.0', id: calls[0]?.id ?? null, error: { code: -32000, message: 'Too many checks from your IP. Wait a minute.' } }, 429);
  }
  const out = (await Promise.all(calls.map(c => rpc(c, env, ctx)))).filter(Boolean);
  if (!out.length) return new Response(null, { status: 202, headers: CORS });
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
    const { pathname } = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (pathname === '/mcp' || pathname === '/mcp/') return handleMcp(request, env, ctx);
    if (pathname === '/v1/check') return handleCheck(request, env, ctx);
    if (pathname === '/v1/bots') return json({ bots: BOTS.map(({ ua, ...b }) => ({ ...b, userAgent: ua || null })) });
    if (pathname === '/openapi.json') return json(openapi(VERSION));
    if (pathname === '/health') return json({ ok: true, version: VERSION });
    if (pathname === '/robots.txt') return new Response('User-agent: *\nAllow: /\n', { headers: { 'Content-Type': 'text/plain' } });
    if (pathname === '/') return new Response(HOME, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    return json({ error: 'Not found', docs: DOCS }, 404);
  },
};
