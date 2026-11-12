import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkRobots } from '../src/robots.js';

test('specific group beats *', () => {
  const t = 'User-agent: *\nDisallow: /\n\nUser-agent: GPTBot\nAllow: /\n';
  assert.equal(checkRobots(t, 'GPTBot', '/x').allowed, true);
  assert.equal(checkRobots(t, 'ClaudeBot', '/x').allowed, false);
});

test('consecutive user-agent lines share rules; groups merge', () => {
  const t = 'User-agent: GPTBot\nUser-agent: ClaudeBot\nDisallow: /private\n\nUser-agent: claudebot\nDisallow: /tmp\n';
  assert.equal(checkRobots(t, 'GPTBot', '/private/a').allowed, false);
  assert.equal(checkRobots(t, 'ClaudeBot', '/tmp/a').allowed, false);
  assert.equal(checkRobots(t, 'GPTBot', '/tmp/a').allowed, true);
});

test('longest match wins, allow wins ties', () => {
  const t = 'User-agent: *\nDisallow: /shop\nAllow: /shop/public\nDisallow: /a\nAllow: /a\n';
  assert.equal(checkRobots(t, 'X', '/shop/cart').allowed, false);
  assert.equal(checkRobots(t, 'X', '/shop/public/1').allowed, true);
  assert.equal(checkRobots(t, 'X', '/a').allowed, true);
});

test('wildcards and $', () => {
  const t = 'User-agent: *\nDisallow: /*.pdf$\nDisallow: /*?s=\n';
  assert.equal(checkRobots(t, 'X', '/file.pdf').allowed, false);
  assert.equal(checkRobots(t, 'X', '/file.pdf?x=1').allowed, true);
  assert.equal(checkRobots(t, 'X', '/?s=test').allowed, false);
});

test('empty disallow allows all; no group allows all', () => {
  assert.equal(checkRobots('User-agent: *\nDisallow:\n', 'X', '/').allowed, true);
  assert.equal(checkRobots('User-agent: Foo\nDisallow: /\n', 'GPTBot', '/').allowed, true);
});

test('prefix token match and case', () => {
  const t = 'user-agent: claude\ndisallow: /\n';
  assert.equal(checkRobots(t, 'ClaudeBot', '/').allowed, false);
  assert.equal(checkRobots(t, 'Claude-User', '/').allowed, false);
});

test('comments, CRLF and rules before any group', () => {
  const t = 'Disallow: /\r\n# hi\r\nUser-agent: * # all\r\nDisallow: /x # no\r\n';
  assert.equal(checkRobots(t, 'X', '/').allowed, true);
  assert.equal(checkRobots(t, 'X', '/x').allowed, false);
});

test('sitemap line between groups does not merge them', () => {
  const t = 'User-agent: GPTBot\nDisallow: /\nSitemap: https://x/s.xml\nUser-agent: *\nAllow: /\n';
  assert.equal(checkRobots(t, 'GPTBot', '/').allowed, false);
  assert.equal(checkRobots(t, 'Other', '/').allowed, true);
});
