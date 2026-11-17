# AI Bot Access Checker: privacy

Applies to the browser extension, the `ai-bot-access-checker` npm CLI, the REST API and the MCP server at `tools.seopaslaugos.io`, all run by seopaslaugos.io (Mtdigital, MB, Lithuania).

**What is sent.** Only the address (URL) of the page you ask to check, plus the list of crawlers if you choose one. The extension reads the address of the active tab only when you open it and press Check.

**What happens to it.** tools.seopaslaugos.io requests that page and its robots.txt as a normal browser and as each AI or search crawler, and returns the result to you.

**What is kept.**
- The result is cached for 10 minutes, keyed by the checked URL, so repeated checks do not hit the site again.
- Your IP address is used for rate limiting (checks per minute). It is not stored with results.
- Cloudflare, which hosts the service, keeps standard request logs (including IP address and requested URL) for a short period for debugging and abuse prevention.

**What is not collected.** No accounts, no cookies, no analytics, no advertising or tracking, and nothing is sold or shared with third parties. The extension stores nothing in the browser.

**Contact.** seo@seopaslaugos.io · https://seopaslaugos.io/en
