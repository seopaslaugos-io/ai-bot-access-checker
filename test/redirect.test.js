import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchChecked } from '../src/check.js';

function mockFetch(map) {
  const seen = [];
  globalThis.fetch = async (url) => {
    seen.push(url);
    const loc = map[url];
    if (loc) return new Response(null, { status: 302, headers: { Location: loc } });
    return new Response('ok', { status: 200 });
  };
  return seen;
}

test('follows public redirects', async () => {
  mockFetch({ 'https://a.com/': 'https://www.a.com/', 'https://www.a.com/': '/home' });
  const { finalUrl } = await fetchChecked(new URL('https://a.com/'), 'UA');
  assert.equal(finalUrl, 'https://www.a.com/home');
});

test('refuses redirects to internal addresses, other ports and our API', async () => {
  for (const target of ['http://127.0.0.1/', 'http://169.254.169.254/latest/meta-data', 'http://localhost:8080/', 'https://a.com:8443/', 'https://tools.seopaslaugos.io/v1/check?url=x', 'file:///etc/passwd']) {
    const seen = mockFetch({ 'https://a.com/': target });
    await assert.rejects(fetchChecked(new URL('https://a.com/'), 'UA'), /non-public|invalid redirect/, target);
    assert.equal(seen.length, 1, `must not request ${target}`);
  }
});

test('stops redirect loops', async () => {
  mockFetch({ 'https://a.com/': 'https://a.com/x', 'https://a.com/x': 'https://a.com/' });
  await assert.rejects(fetchChecked(new URL('https://a.com/'), 'UA'), /redirects/);
});
