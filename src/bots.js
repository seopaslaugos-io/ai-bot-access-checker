// Crawlers checked. `token` is the robots.txt product token, `ua` the
// User-Agent string the vendor documents. `fetches: false` marks robots.txt-only
// control tokens: no crawler sends them as a User-Agent, so only robots.txt applies.

export const BOTS = [
  { id: 'gptbot', token: 'GPTBot', vendor: 'OpenAI', purpose: 'Training data for OpenAI models',
    ua: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.1; +https://openai.com/gptbot)' },
  { id: 'oai-searchbot', token: 'OAI-SearchBot', vendor: 'OpenAI', purpose: 'ChatGPT search index',
    ua: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot)' },
  { id: 'chatgpt-user', token: 'ChatGPT-User', vendor: 'OpenAI', purpose: 'Live page visits when a ChatGPT user asks',
    ua: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot' },
  { id: 'claudebot', token: 'ClaudeBot', vendor: 'Anthropic', purpose: 'Training data for Claude models',
    ua: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)' },
  { id: 'claude-searchbot', token: 'Claude-SearchBot', vendor: 'Anthropic', purpose: 'Claude search index',
    ua: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Claude-SearchBot/1.0; +Claude-SearchBot@anthropic.com)' },
  { id: 'claude-user', token: 'Claude-User', vendor: 'Anthropic', purpose: 'Live page visits when a Claude user asks',
    ua: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Claude-User/1.0; +Claude-User@anthropic.com)' },
  { id: 'perplexitybot', token: 'PerplexityBot', vendor: 'Perplexity', purpose: 'Perplexity search index',
    ua: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)' },
  { id: 'perplexity-user', token: 'Perplexity-User', vendor: 'Perplexity', purpose: 'Live page visits when a Perplexity user asks',
    ua: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Perplexity-User/1.0; +https://perplexity.ai/perplexity-user)' },
  { id: 'googlebot', token: 'Googlebot', vendor: 'Google', purpose: 'Google Search, including AI Overviews',
    ua: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' },
  { id: 'google-extended', token: 'Google-Extended', vendor: 'Google', purpose: 'Gemini training/grounding opt-out (robots.txt token only)',
    fetches: false },
  { id: 'bingbot', token: 'bingbot', vendor: 'Microsoft', purpose: 'Bing index, which also feeds Copilot and ChatGPT search',
    ua: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm) Chrome/116.0.1938.76 Safari/537.36' },
  { id: 'applebot-extended', token: 'Applebot-Extended', vendor: 'Apple', purpose: 'Apple Intelligence training opt-out (robots.txt token only)',
    fetches: false },
  { id: 'ccbot', token: 'CCBot', vendor: 'Common Crawl', purpose: 'Open web corpus used to train many models',
    ua: 'CCBot/2.0 (https://commoncrawl.org/faq/)' },
];

export const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
