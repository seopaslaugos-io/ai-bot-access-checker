export function openapi(version) {
  const botResult = {
    type: 'object',
    properties: {
      bot: { type: 'string', example: 'GPTBot' },
      vendor: { type: 'string', example: 'OpenAI' },
      purpose: { type: 'string' },
      robots: {
        type: 'object',
        properties: {
          allowed: { type: 'boolean' },
          group: { type: 'string', nullable: true, description: 'robots.txt user-agent group that applied' },
          rule: { type: 'string', nullable: true, example: 'Disallow: /' },
        },
      },
      server: {
        type: 'object',
        properties: {
          verdict: { type: 'string', enum: ['ok', 'blocked', 'inconclusive', 'suspicious', 'page_error', 'unreachable', 'not_applicable'] },
          status: { type: 'integer', example: 403 },
          note: { type: 'string' },
          ms: { type: 'integer' },
        },
      },
      access: {
        type: 'string',
        enum: ['allowed', 'blocked_by_robots', 'blocked_by_server', 'inconclusive', 'suspicious', 'page_error', 'unreachable'],
      },
    },
  };
  return {
    openapi: '3.0.3',
    info: {
      title: 'AI Bot Access Checker',
      version,
      description:
        'Checks whether AI crawlers and search bots (GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-SearchBot, Claude-User, ' +
        'PerplexityBot, Perplexity-User, Googlebot, Google-Extended, bingbot, Applebot-Extended, CCBot) can reach a page: the robots.txt ' +
        'rule that applies to each, and whether the server or firewall blocks that User-Agent compared with a normal browser. Free, no key. ' +
        'Built by Mantas Tamošaitis, SEO specialist in Lithuania (https://seopaslaugos.io/en).',
      contact: { name: 'Mantas Tamošaitis', url: 'https://seopaslaugos.io/en' },
      license: { name: 'MIT', url: 'https://opensource.org/licenses/MIT' },
    },
    externalDocs: { url: 'https://seopaslaugos.io/en/tools/ai-bot-access-checker', description: 'Docs and free web version' },
    servers: [{ url: 'https://tools.seopaslaugos.io' }],
    paths: {
      '/v1/check': {
        get: {
          operationId: 'checkAiBotAccess',
          summary: 'Check which AI bots can reach a URL',
          parameters: [
            { name: 'url', in: 'query', required: true, schema: { type: 'string' }, example: 'https://example.com/' },
            { name: 'bots', in: 'query', required: false, schema: { type: 'string' }, description: 'Comma-separated subset, e.g. GPTBot,ClaudeBot' },
            { name: 'format', in: 'query', required: false, schema: { type: 'string', enum: ['json', 'text'] } },
          ],
          responses: {
            200: {
              description: 'Check result',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      url: { type: 'string' },
                      checkedAt: { type: 'string', format: 'date-time' },
                      baseline: { type: 'object', description: 'Same page fetched with a desktop Chrome User-Agent' },
                      robotsTxt: { type: 'object', properties: { url: { type: 'string' }, state: { type: 'string', enum: ['found', 'missing', 'unavailable'] }, status: { type: 'integer' } } },
                      summary: { type: 'object', additionalProperties: { type: 'integer' } },
                      bots: { type: 'array', items: botResult },
                      limits: { type: 'string' },
                    },
                  },
                },
              },
            },
            400: { description: 'Invalid URL' },
            429: { description: 'Rate limited (per IP)' },
          },
        },
      },
      '/v1/bots': {
        get: { operationId: 'listBots', summary: 'List the bots checked and their User-Agent strings', responses: { 200: { description: 'Bot list' } } },
      },
    },
  };
}
