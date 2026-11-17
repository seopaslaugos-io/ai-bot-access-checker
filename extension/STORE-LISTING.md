# Store listing: AI Bot Access Checker (browser extension)

One package for both stores: `dist/ai-bot-access-checker-1.0.0.zip` (build with `./build.sh`).
Nothing here is published yet.

## Name

AI Bot Access Checker  *(21 characters; Edge allows 45, Chrome 75)*

## Short description / summary

Chrome "Summary" (max 132) and the manifest `description`:

> Check if GPTBot, ClaudeBot, PerplexityBot, Googlebot and 9 more AI crawlers can reach the page you are on.

*(106 characters)*

## Full description

> Can ChatGPT, Claude, Perplexity and Google actually reach this page?
>
> Click the icon on any web page and press Check. The extension checks 13 AI and search crawlers against that page and shows, for each one, whether it is:
>
> • Allowed: robots.txt allows it and the server answers it like a browser
> • Blocked by robots.txt: a Disallow rule applies (the rule and the user-agent group are shown)
> • Blocked by server/firewall: robots.txt allows it, but the server refuses the bot's User-Agent (403, 429, dropped connection, challenge or captcha page)
> • Inconclusive: the firewall also refuses a fake Googlebot, so it checks crawler IPs and the real crawler may still get in
>
> Bots are grouped the way they are used:
> • Search crawlers (OAI-SearchBot, Claude-SearchBot, PerplexityBot, Googlebot, bingbot) build the index AI answers cite
> • User-triggered fetchers (ChatGPT-User, Claude-User, Perplexity-User) open a page live when someone asks about it
> • Training crawlers (GPTBot, ClaudeBot, Google-Extended, Applebot-Extended, CCBot) collect content for model training
>
> Why it matters: robots.txt is only half of it. Hosting firewalls (ModSecurity), rate limiters and CDN bot settings such as Cloudflare's AI crawler blocking often refuse AI crawlers before robots.txt is ever read. Most checkers only read robots.txt; this one also requests the page as each bot and compares the answer with a normal browser's.
>
> The top of the result shows the browser baseline (what a normal browser gets) and the robots.txt state, and warns when Cloudflare "Managed robots.txt" adds AI-bot rules or the page is noindex. Expand any bot for the exact reason. "Full report" opens the same check on the web version.
>
> How it works: the check runs on the free AI Bot Access Checker API (tools.seopaslaugos.io). Requests are sent from Cloudflare with each bot's published User-Agent, not from the vendors' own IP ranges, so firewalls that verify crawler IPs are reported as Inconclusive instead of guessed.
>
> Private by design: the extension sends only the address of the page you check, and only when you press Check. No account, no tracking, no analytics, nothing stored in your browser.
>
> Free and open source (MIT): https://github.com/seopaslaugos-io/ai-bot-access-checker
> Made by seopaslaugos.io, Mantas Tamošaitis, SEO specialist in Lithuania.

## Category

- Chrome Web Store: **Developer Tools** (alternative: Tools)
- Edge Add-ons: **Developer tools**

Language: English.

## Single purpose (Chrome "Single purpose description")

> Checks whether AI and search crawlers (GPTBot, ClaudeBot, PerplexityBot, Googlebot and others) can access the web page open in the current tab, by robots.txt and by the server's actual response.

## Permission justifications

**activeTab**
> Used only to read the address (URL) of the current tab when the user clicks the extension icon, so the popup can show it and check that page. The extension does not read page content, does not run scripts in the page and has no access to other tabs.

**Host permission `https://tools.seopaslaugos.io/*`**
> The popup sends the page address to the extension's own checking API at tools.seopaslaugos.io and displays the answer. The permission is limited to that one host. It is also needed to read the Retry-After header of rate-limit answers, so the popup can tell the user how long to wait.

**Remote code**
> No. All HTML, CSS and JavaScript ship in the package. The API returns JSON data only, which is rendered as escaped text.

## Privacy practices (Chrome "Privacy" tab / Edge "Privacy" section)

What is sent: only the URL of the page the user chooses to check, and only when they press Check. It goes over HTTPS to `tools.seopaslaugos.io/v1/check`. Nothing else: no page content, cookies, history, identifiers or settings.

What is stored: nothing in the browser (no `storage` permission, no cookies, no localStorage). On the server, results are cached for 10 minutes keyed by the checked URL only; the caller's IP address is used for the per-IP rate limit (20 checks a minute) and is not stored with results.

Data-usage checkboxes (Chrome):
- **Web history**: tick it (conservative reading: the URL of the checked page leaves the device). The other categories (personally identifiable info, health, financial, authentication, personal communications, location, user activity, website content) are **not** collected.
- Certify all three: not sold or transferred to third parties outside the approved use; not used for purposes unrelated to the single purpose; not used to determine creditworthiness or for lending.

Privacy policy URL: **required** once a data category is ticked. Use https://github.com/seopaslaugos-io/ai-bot-access-checker/blob/main/PRIVACY.md (published 2026-11-17). Short version:

> **AI Bot Access Checker: privacy.** The browser extension, CLI and API send only the address of the page you ask to check to tools.seopaslaugos.io, which requests that page and its robots.txt as a browser and as each AI crawler and returns the result. Results are cached for 10 minutes by URL so repeated checks do not hit the site again. Your IP address is used only for rate limiting and is not stored with results. No accounts, cookies, analytics or tracking. Contact: seo@seopaslaugos.io.

Edge asks the same in its own wording: "Does your product access, collect, or transmit personal information?" Answer **Yes** (the page URL is transmitted) and give the same privacy policy URL.

## Links

- Homepage / website: https://seopaslaugos.io/en/tools/ai-bot-access-checker
- Support: https://github.com/seopaslaugos-io/ai-bot-access-checker/issues (or seo@seopaslaugos.io)

## Screenshots (1280x800, PNG)

Taken from the real popup running live checks (`node store/shoot.mjs <url> <out.png> [caption] [sub] [--expand Bot] [--scroll px]`):

1. `store/screenshot-1-allowed.png`: https://seopaslaugos.io/, all 13 bots allowed.
2. `store/screenshot-2-blocked.png`: https://www.theguardian.com/, mixed result (robots.txt blocks plus a server/firewall block on Perplexity-User, expanded to show the reason).

Optional extras worth adding later: a Cloudflare-managed robots.txt example (the yellow warning) and an Inconclusive example. Results change as sites change their settings, so retake rather than edit.

Store icon: `icons/icon-128.png`. Chrome also accepts an optional 440x280 small promo tile; Edge an optional 1400x560 large promo tile. Neither has been made.
