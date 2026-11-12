# AI Bot Access Checker

Can ChatGPT, Claude, Perplexity and Google actually reach your page? This tool checks 13 AI and search crawlers against one URL and tells you, for each, whether **robots.txt** blocks it or whether your **server or firewall** refuses it while a normal browser gets the page.

- **Web version:** [seopaslaugos.io/en/tools/ai-bot-access-checker](https://seopaslaugos.io/en/tools/ai-bot-access-checker)
- **REST API:** `https://tools.seopaslaugos.io/v1/check?url=example.com` ([OpenAPI](https://tools.seopaslaugos.io/openapi.json))
- **Remote MCP server:** `https://tools.seopaslaugos.io/mcp` (Streamable HTTP, tool `check_ai_bot_access`)
- **Agent skill:** [`skills/ai-bot-access-check/SKILL.md`](skills/ai-bot-access-check/SKILL.md)

Free, no key, MIT licence.

## Why

robots.txt is only half of it. Shared-hosting security rules (ModSecurity), rate limiters that answer 429 to bots on uncached pages, and CDN bot settings (Cloudflare's AI crawler blocking) refuse AI crawlers before robots.txt is ever read, often by default. Site owners then wonder why ChatGPT says it "cannot access" their site. Most checkers only read robots.txt; this one also requests the page as each bot and compares the answer with a browser's.

## Bots checked

| Bot | Vendor | Used for |
|---|---|---|
| GPTBot | OpenAI | Training |
| OAI-SearchBot | OpenAI | ChatGPT search index |
| ChatGPT-User | OpenAI | Live visits when a user asks (OpenAI: robots.txt *may not apply*) |
| ClaudeBot | Anthropic | Training |
| Claude-SearchBot | Anthropic | Claude search index |
| Claude-User | Anthropic | Live visits when a user asks |
| PerplexityBot | Perplexity | Perplexity search index |
| Perplexity-User | Perplexity | Live visits when a user asks (Perplexity: *generally ignores* robots.txt) |
| Googlebot | Google | Google Search, AI Overviews, AI Mode |
| Google-Extended | Google | Gemini training opt-out (robots.txt token only; no effect on Search) |
| bingbot | Microsoft | Bing search index |
| Applebot-Extended | Apple | Apple model training opt-out (robots.txt token only; no effect on Apple search) |
| CCBot | Common Crawl | Open training corpus |

## Use it

### REST

```bash
curl "https://tools.seopaslaugos.io/v1/check?url=example.com&format=text"
curl "https://tools.seopaslaugos.io/v1/check?url=https://example.com/pricing&bots=GPTBot,ClaudeBot"
```

```text
AI bot access for https://www.example.lt/
Browser baseline: HTTP 200
robots.txt: found (HTTP 200)

GPTBot             BLOCKED (server/firewall) - Gets a Cloudflare block page (HTTP 403) instead of the page.
OAI-SearchBot      BLOCKED (server/firewall) - Gets a Cloudflare block page (HTTP 403) instead of the page.
Claude-User        ALLOWED
Googlebot          ALLOWED
...
```

### MCP (Claude Code, Cursor, ChatGPT, any MCP client)

```json
{
  "mcpServers": {
    "ai-bot-access-checker": { "type": "http", "url": "https://tools.seopaslaugos.io/mcp" }
  }
}
```

### Hermes Agent

```bash
hermes plugins install ai-bot-access-checker
```

The package is an [Agent Plugins](https://agent-plugins.org) v1 bundle: `plugin.json`, `mcp.json` (remote Streamable HTTP server, no keys, no local process) and the skill in `skills/`. The one tool is read-only; it sends HTTP requests to the URL you ask it to check, from `tools.seopaslaugos.io`.

### Agent skill

Copy `skills/ai-bot-access-check` into your agent's skills folder, or install it from ClawHub. The skill calls the REST API with curl, so it needs no MCP support.

## Results

| `access` | Meaning |
|---|---|
| `allowed` | robots.txt allows it and the server answers it like a browser |
| `blocked_by_robots` | A Disallow rule applies (rule and user-agent group included). For ChatGPT-User and Perplexity-User the vendors say robots.txt may be ignored; `robots.vendorNote` says so |
| `blocked_by_server` | robots.txt allows it, the server refuses the User-Agent: 403, 429, dropped connection, challenge or captcha page |
| `inconclusive` | The firewall refuses a fake Googlebot too, so it checks crawler IPs; the real crawler may get in |
| `suspicious` | HTTP 200 but under a fifth of the browser's response size |
| `page_error` | A normal browser fails as well |

## How it works and its limits

- robots.txt is parsed per [RFC 9309](https://www.rfc-editor.org/rfc/rfc9309): most specific user-agent group, merged duplicate groups, longest match wins, Allow wins ties, `*` and `$` wildcards; a 4xx robots.txt means no restrictions, a 5xx means full disallow.
- The page is requested once with a desktop Chrome User-Agent and once per bot with the bot's published User-Agent, from Cloudflare's network.
- Requests do **not** come from the vendors' IP ranges. Blocks by User-Agent (most hosting firewalls) are caught; firewalls that verify crawler IPs are reported as `inconclusive` instead of guessed.
- Rate limits: 20 checks a minute per caller IP, and 6 fresh checks a minute per checked website from all callers together, so the checker cannot be used to flood a site. Results are cached 10 minutes per URL.

## Security

- Only public `http`/`https` URLs on ports 80/443 with a domain name are checked. IP literals (dotted, decimal, octal, hex, IPv6), `localhost` and reserved TLDs, wildcard-DNS hosts that point at private addresses (`nip.io`, `sslip.io`, ...), URLs with credentials and the checker's own hosts are refused.
- Redirects are followed by hand (max 5) and every hop is validated the same way, so a public page cannot bounce the checker to an internal address, another port or its own API.
- At most 64 KiB of each response is read; each request times out after 10 s.
- robots.txt matching uses a linear wildcard matcher with a work budget and caps on lines, rules and pattern length, so a hostile robots.txt cannot stall the Worker; if the budget runs out the result says *inconclusive*.
- Text taken from the checked site (robots.txt rules, URLs, headers) is stripped of control and bidi characters and length-capped before it is returned to people or AI agents.
- MCP batches are capped at 10 messages and one `tools/call`; request bodies are capped at 16 KiB.
- No keys, cookies or user data are stored. Results are cached by URL only.

Found a problem? Open an issue or email seo@seopaslaugos.io.

## Run your own

```bash
npm install
npm test          # robots.txt parser tests
npx wrangler dev  # local Worker on :8787
```

Deploy with `npx wrangler deploy` after changing the route in `wrangler.toml`.

## Author

Built by **Mantas Tamošaitis**, SEO specialist in Lithuania, who works on Google and AI search visibility for service businesses and e-shops at [seopaslaugos.io](https://seopaslaugos.io/en). Issues and pull requests welcome.
