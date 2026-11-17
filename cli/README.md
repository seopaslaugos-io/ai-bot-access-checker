# ai-bot-access-checker

Can ChatGPT, Claude, Perplexity and Google actually reach your page? This CLI checks 13 AI and search crawlers against one URL and tells you, for each, whether **robots.txt** blocks it or whether your **server or firewall** refuses it while a normal browser gets the page.

Zero dependencies. Node 18 or newer. Free, no key, MIT.

```bash
npx ai-bot-access-checker https://example.com/
```

## What it checks

| Bot | Vendor | Used for |
|---|---|---|
| OAI-SearchBot | OpenAI | ChatGPT search index |
| Claude-SearchBot | Anthropic | Claude search index |
| PerplexityBot | Perplexity | Perplexity search index |
| Googlebot | Google | Google Search, AI Overviews, AI Mode |
| bingbot | Microsoft | Bing search index |
| ChatGPT-User | OpenAI | Live visits when a user asks |
| Claude-User | Anthropic | Live visits when a user asks |
| Perplexity-User | Perplexity | Live visits when a user asks |
| GPTBot | OpenAI | Training |
| ClaudeBot | Anthropic | Training |
| Google-Extended | Google | Gemini training opt-out (robots.txt token only) |
| Applebot-Extended | Apple | Apple model training opt-out (robots.txt token only) |
| CCBot | Common Crawl | Open training corpus |

For each bot it reads robots.txt (RFC 9309) and requests the page with the bot's published User-Agent, then compares the answer with a desktop browser's. Results:

| Result | Meaning |
|---|---|
| `ALLOWED` | robots.txt allows it and the server answers it like a browser |
| `BLOCKED (robots.txt)` | A Disallow rule applies; the rule and user-agent group are shown, and `[added by Cloudflare]` when Cloudflare "Managed robots.txt" wrote it |
| `BLOCKED (server/firewall)` | robots.txt allows it, the server refuses the User-Agent: 403, 429, dropped connection, challenge or captcha page |
| `INCONCLUSIVE` | The firewall refuses a fake Googlebot too, so it checks crawler IPs; the real crawler may get in |
| `CHECK (odd response)` | HTTP 200 but under a fifth of the browser's response size |
| `PAGE ERROR` | A normal browser fails as well |

The checks run on the free API at `tools.seopaslaugos.io`, from Cloudflare's network, not from the vendors' own IP ranges. Blocks by User-Agent (most hosting firewalls) are caught; firewalls that verify crawler IPs are reported as inconclusive instead of guessed.

## Install and use

Run it without installing:

```bash
npx ai-bot-access-checker https://example.com/pricing
```

Or install it globally (adds `ai-bot-access-checker` and the short alias `ai-bot-check`):

```bash
npm install -g ai-bot-access-checker
ai-bot-check example.com
```

Options:

```text
ai-bot-access-checker <url> [--bots GPTBot,ClaudeBot] [--json] [--fresh]

  --bots <list>   Only check these bots (comma-separated robots.txt tokens)
  --json          Print the raw API JSON
  --fresh         Skip the 10-minute result cache and re-check now
  --no-color      Plain output (also when NO_COLOR is set or output is not a terminal)
```

Example output (a real check of theguardian.com on 17 November 2026, footer lines trimmed):

```text
AI bot access for https://www.theguardian.com/
Browser baseline: HTTP 200
robots.txt: found (HTTP 200)

Search crawlers - build the index AI answers cite
  OAI-SearchBot      ALLOWED
  Claude-SearchBot   BLOCKED (robots.txt) - Disallow: / (group "claude-searchbot")
  PerplexityBot      BLOCKED (robots.txt) - Disallow: / (group "perplexitybot")
  Googlebot          ALLOWED
  bingbot            ALLOWED

User-triggered fetchers - live visits when someone asks
  ChatGPT-User       ALLOWED
  Claude-User        BLOCKED (robots.txt) - Disallow: / (group "claude-user")
  Perplexity-User    BLOCKED (server/firewall) - This User-Agent is refused (403) while a normal browser gets HTTP 200.

Training crawlers - collect content for model training
  GPTBot             ALLOWED
  ClaudeBot          BLOCKED (robots.txt) - Disallow: / (group "claudebot")
  Google-Extended    ALLOWED
  Applebot-Extended  BLOCKED (robots.txt) - Disallow: / (group "applebot-extended")
  CCBot              BLOCKED (robots.txt) - Disallow: / (group "ccbot")

6 of 13 allowed, 7 blocked.
```

## Exit codes

| Code | Meaning |
|---|---|
| `0` | No bot is blocked |
| `1` | At least one bot is blocked by robots.txt or by the server/firewall |
| `2` | Error: bad input, rate limit (HTTP 429), network or API failure |

Inconclusive, odd-response and page-error results do not fail the run on their own.

## CI example

Fail a deploy when a search or answer crawler loses access, while training crawlers may stay blocked on purpose:

```yaml
# .github/workflows/ai-bots.yml
name: AI bot access
on:
  schedule: [{ cron: "0 6 * * *" }]
  workflow_dispatch:
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npx -y ai-bot-access-checker https://example.com/ --fresh --bots OAI-SearchBot,ChatGPT-User,Claude-SearchBot,Claude-User,PerplexityBot,Googlebot,bingbot
```

Exit code 2 (for example a rate limit) also fails the step; retry after the wait it prints.

## Limits

- 20 checks a minute per IP address, and 6 fresh checks a minute per checked website from all callers together, so the checker cannot be used to flood a site. A 429 answer prints how long to wait.
- Results are cached for 10 minutes per URL; `--fresh` skips the cache.
- Only public `http`/`https` URLs on ports 80/443 with a domain name are checked.
- Only the URL you pass is sent to the API. Nothing is stored except the 10-minute result cache.

## Other ways to run the same check

- **Web version:** [seopaslaugos.io/en/tools/ai-bot-access-checker](https://seopaslaugos.io/en/tools/ai-bot-access-checker)
- **REST API:** `https://tools.seopaslaugos.io/v1/check?url=example.com` ([OpenAPI](https://tools.seopaslaugos.io/openapi.json))
- **Remote MCP server** for Claude Code, Cursor, ChatGPT and other MCP clients: `https://tools.seopaslaugos.io/mcp` (Streamable HTTP, tool `check_ai_bot_access`)
- **Source:** [github.com/seopaslaugos-io/ai-bot-access-checker](https://github.com/seopaslaugos-io/ai-bot-access-checker)

Made by [seopaslaugos.io](https://seopaslaugos.io/en), Mantas Tamošaitis, SEO specialist in Lithuania.
