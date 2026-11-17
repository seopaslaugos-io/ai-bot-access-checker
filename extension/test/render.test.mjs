// Runs the popup's render logic against the live API (one real check + one refused URL).
// node --test extension/test/render.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apiUrl, errorMessage, renderResult, reportUrl, isCheckable, retrySeconds, ACCESS } from '../render.js';

test('url helpers', () => {
  assert.equal(isCheckable('https://example.com/a'), true);
  assert.equal(isCheckable('chrome://extensions'), false);
  assert.equal(isCheckable('file:///tmp/x.html'), false);
  assert.equal(reportUrl('https://a.lt/x?y=1'), 'https://seopaslaugos.io/en/tools/ai-bot-access-checker?url=https%3A%2F%2Fa.lt%2Fx%3Fy%3D1');
  assert.equal(apiUrl('https://a.lt/', { fresh: true }), 'https://tools.seopaslaugos.io/v1/check?url=https%3A%2F%2Fa.lt%2F&fresh=1');
  assert.equal(retrySeconds('60', ''), 60);
  assert.equal(retrySeconds('60', 'x.lt was checked 6 times in the last minute. Try again in 42 s.'), 42);
  assert.equal(retrySeconds(null, ''), 60);
  const ip = errorMessage(429, { error: 'Too many checks from your IP. Wait a minute and try again.' }, '60');
  assert.equal(ip.title, 'Rate limit reached: wait 60 s');
  assert.equal(ip.wait, 60);
  assert.equal(errorMessage(429, { error: 'x.lt was checked 6 times in the last minute. Try again in 42 s.' }, '60').wait, 42);
  assert.equal(errorMessage(0).title, 'Checker unreachable');
});

test('renders a real API response', async () => {
  const res = await fetch(apiUrl('https://seopaslaugos.io/'));
  assert.equal(res.status, 200);
  const r = await res.json();
  const html = renderResult(r);
  for (const b of r.bots) {
    assert.ok(html.includes(`<strong>${b.bot}</strong>`), `row for ${b.bot}`);
    assert.ok(ACCESS[b.access], `known access value ${b.access}`);
    assert.ok(html.includes(ACCESS[b.access][1]), `label for ${b.access}`);
  }
  for (const h of ['Search crawlers', 'User-triggered fetchers', 'Training crawlers', 'Browser baseline', 'robots.txt']) assert.ok(html.includes(h), h);
  assert.ok(!/undefined|NaN/.test(html), 'no undefined/NaN in output');
});

test('renders a real API error', async () => {
  const res = await fetch(apiUrl('http://localhost/'));
  assert.equal(res.status, 400);
  const e = errorMessage(res.status, await res.json(), res.headers.get('Retry-After'));
  assert.equal(e.title, 'This page cannot be checked');
  assert.match(e.text, /public domain name/);
});
