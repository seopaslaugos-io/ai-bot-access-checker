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
| ChatGPT-User | OpenAI | Live visits when a user asks |
| ClaudeBot | Anthropic | Training |
| Claude-SearchBot | Anthropic | Claude search index |
| Claude-User | Anthropic | Live visits when a user asks |
| PerplexityBot | Perplexity | Perplexity search index |
| Perplexity-User | Perplexity | Live visits when a user asks |
| Googlebot | Google | Google Search, AI Overviews, AI Mode |
| Google-Extended | Google | Gemini opt-out (robots.txt token only) |
| bingbot | Microsoft | Bing, Copilot, and ChatGPT search via Bing |
| Applebot-Extended | Apple | Apple Intelligence opt-out (robots.txt token only) |
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

### Agent skill

Copy `skills/ai-bot-access-check` into your agent's skills folder, or install it from ClawHub. The skill calls the REST API with curl, so it needs no MCP support.

## Results

| `access` | Meaning |
|---|---|
| `allowed` | robots.txt allows it and the server answers it like a browser |
| `blocked_by_robots` | A Disallow rule applies (rule and user-agent group included) |
| `blocked_by_server` | robots.txt allows it, the server refuses the User-Agent: 403, 429, dropped connection, challenge or captcha page |
| `inconclusive` | The firewall refuses a fake Googlebot too, so it checks crawler IPs; the real crawler may get in |
| `suspicious` | HTTP 200 but under a fifth of the browser's response size |
| `page_error` | A normal browser fails as well |

## How it works and its limits

- robots.txt is parsed per [RFC 9309](https://www.rfc-editor.org/rfc/rfc9309): most specific user-agent group, merged duplicate groups, longest match wins, Allow wins ties, `*` and `$` wildcards; a 4xx robots.txt means no restrictions, a 5xx means full disallow.
- The page is requested once with a desktop Chrome User-Agent and once per bot with the bot's published User-Agent, from Cloudflare's network.
- Requests do **not** come from the vendors' IP ranges. Blocks by User-Agent (most hosting firewalls) are caught; firewalls that verify crawler IPs are reported as `inconclusive` instead of guessed.
- Rate limit 20 checks/minute per IP; results cached 10 minutes per URL.

## Run your own

```bash
npm install
npm test          # robots.txt parser tests
npx wrangler dev  # local Worker on :8787
```

Deploy with `npx wrangler deploy` after changing the route in `wrangler.toml`.

## Author

Built by **Mantas Tamošaitis**, SEO specialist in Lithuania, who works on Google and AI search visibility for service businesses and e-shops at [seopaslaugos.io](https://seopaslaugos.io/en). Issues and pull requests welcome.
