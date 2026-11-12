import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normaliseUrl, clean, InputError } from '../src/check.js';
import { wildcardMatch, checkRobots } from '../src/robots.js';

const bad = [
  'http://127.0.0.1/', 'http://2130706433/', 'http://0x7f.0.0.1/', 'http://017700000001/', 'http://[::1]/',
  'http://localhost/', 'http://foo.localhost/', 'http://printer.local/', 'http://db.internal/', 'http://intranet/',
  'http://127.0.0.1.nip.io/', 'http://x.sslip.io/', 'http://app.lvh.me/', 'http://site.test/',
  'http://example.com:8080/', 'http://user:pw@example.com/', 'file:///etc/passwd', 'ftp://example.com/',
  'gopher://example.com/', 'javascript:alert(1)', 'https://tools.seopaslaugos.io/v1/check?url=x',
  'https://x.workers.dev/', 'https://exa mple.com/', 'https://example.com/\nX', 'a'.repeat(3000) + '.com', '',
];
test('refuses internal, odd and own targets', () => {
  for (const u of bad) assert.throws(() => normaliseUrl(u), InputError, u.slice(0, 60));
});

test('accepts normal sites', () => {
  for (const u of ['example.com', 'https://www.nytimes.com/section/x?a=1', 'http://sub.domain.co.uk:443/p', 'seopaslaugos.io/en']) {
    assert.ok(normaliseUrl(u) instanceof URL, u);
  }
});

test('clean strips control and bidi characters and caps length', () => {
  assert.equal(clean('a\nb‮c d'), 'a b c d');
  assert.equal(clean('x'.repeat(200), 10).length, 10);
  assert.equal(clean(null), null);
});

test('wildcard matcher semantics', () => {
  assert.ok(wildcardMatch('/shop', '/shop/cart'));
  assert.ok(!wildcardMatch('/shop$', '/shop/cart'));
  assert.ok(wildcardMatch('/*.pdf$', '/a/b.pdf'));
  assert.ok(!wildcardMatch('/*.pdf$', '/a/b.pdf?x'));
  assert.ok(wildcardMatch('/*?s=', '/?s=1'));
  assert.ok(wildcardMatch('*', '/anything'));
  assert.ok(wildcardMatch('', '/'));
});

test('hostile patterns finish fast', () => {
  const pat = '/' + 'a*'.repeat(500) + 'b';
  const path = '/' + 'a'.repeat(1800);
  const t = Date.now();
  assert.equal(wildcardMatch(pat, path), false);
  const robots = 'User-agent: *\n' + Array.from({ length: 3000 }, () => `Disallow: ${pat}`).join('\n');
  checkRobots(robots, 'GPTBot', path);
  assert.ok(Date.now() - t < 2000, `took ${Date.now() - t} ms`);
});
