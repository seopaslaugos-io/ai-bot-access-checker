// Crawlers checked. `token` is the robots.txt product token, `ua` the User-Agent string the
// vendor documents. `fetches: false` marks robots.txt-only control tokens: no crawler sends them
// as a User-Agent, so only robots.txt applies. `category` follows the three kinds of AI access:
//   training  - collects content for model training
//   search    - builds an AI search index that answers cite
//   user      - fetches a page live because a user asked
// `robots` is what the vendor itself says about robots.txt for that bot:
//   'honors'  - follows robots.txt
//   'may_not' - vendor says robots.txt rules may not apply / are generally ignored
// Sources (checked 2026-11-12):
//   OpenAI      https://developers.openai.com/api/docs/bots
//   Anthropic   https://support.claude.com/en/articles/8896518
//   Perplexity  https://docs.perplexity.ai/guides/bots
//   Google      https://developers.google.com/search/docs/crawling-indexing/google-common-crawlers
//   Apple       https://support.apple.com/en-us/119829

export const BOTS = [
  { id: 'gptbot', token: 'GPTBot', vendor: 'OpenAI', category: 'training', robots: 'honors',
    purpose: 'Collects content that may be used to train OpenAI models',
    ua: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.4; +https://openai.com/gptbot' },
  { id: 'oai-searchbot', token: 'OAI-SearchBot', vendor: 'OpenAI', category: 'search', robots: 'honors',
    purpose: 'Shows websites in ChatGPT search answers',
    ua: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; OAI-SearchBot/1.4; +https://openai.com/searchbot' },
  { id: 'chatgpt-user', token: 'ChatGPT-User', vendor: 'OpenAI', category: 'user', robots: 'may_not',
    robotsNote: 'OpenAI says robots.txt rules may not apply to ChatGPT-User, because a user starts the visit.',
    purpose: 'Visits a page when a ChatGPT user asks about it',
    ua: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot' },
  { id: 'claudebot', token: 'ClaudeBot', vendor: 'Anthropic', category: 'training', robots: 'honors',
    purpose: 'Collects content for training Claude models',
    ua: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)' },
  { id: 'claude-searchbot', token: 'Claude-SearchBot', vendor: 'Anthropic', category: 'search', robots: 'honors',
    purpose: 'Indexes pages for Claude search results',
    ua: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Claude-SearchBot/1.0; +Claude-SearchBot@anthropic.com)' },
  { id: 'claude-user', token: 'Claude-User', vendor: 'Anthropic', category: 'user', robots: 'honors',
    purpose: 'Fetches a page when a Claude user asks about it',
    ua: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Claude-User/1.0; +Claude-User@anthropic.com)' },
  { id: 'perplexitybot', token: 'PerplexityBot', vendor: 'Perplexity', category: 'search', robots: 'honors',
    purpose: 'Shows and links websites in Perplexity search results',
    ua: 'Mozilla/5.0 (compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)' },
  { id: 'perplexity-user', token: 'Perplexity-User', vendor: 'Perplexity', category: 'user', robots: 'may_not',
    robotsNote: 'Perplexity says Perplexity-User generally ignores robots.txt, because a user requested the fetch.',
    purpose: 'Visits a page when a Perplexity user asks about it',
    ua: 'Mozilla/5.0 (compatible; Perplexity-User/1.0; +https://perplexity.ai/perplexity-user)' },
  { id: 'googlebot', token: 'Googlebot', vendor: 'Google', category: 'search', robots: 'honors',
    purpose: 'Google Search, including AI Overviews and AI Mode',
    ua: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' },
  { id: 'google-extended', token: 'Google-Extended', vendor: 'Google', category: 'training', robots: 'honors', fetches: false,
    purpose: 'Opt-out of Gemini model training (robots.txt token only; no effect on Google Search)' },
  { id: 'bingbot', token: 'bingbot', vendor: 'Microsoft', category: 'search', robots: 'honors',
    purpose: 'Bing search index',
    ua: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm) Chrome/116.0.1938.76 Safari/537.36' },
  { id: 'applebot-extended', token: 'Applebot-Extended', vendor: 'Apple', category: 'training', robots: 'honors', fetches: false,
    purpose: 'Opt-out of Apple foundation model training (robots.txt token only; no effect on Apple search)' },
  { id: 'ccbot', token: 'CCBot', vendor: 'Common Crawl', category: 'training', robots: 'honors',
    purpose: 'Open web archive that many AI models are trained on',
    ua: 'CCBot/2.0 (https://commoncrawl.org/faq/)' },
];

export const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
