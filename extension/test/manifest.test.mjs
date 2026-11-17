// Static checks for the MV3 package: manifest keys, permissions, local-only assets.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const m = JSON.parse(readFileSync(join(DIR, 'manifest.json'), 'utf8'));

test('manifest is valid MV3 with minimal permissions', () => {
  assert.equal(m.manifest_version, 3);
  assert.match(m.version, /^\d+(\.\d+){0,3}$/);
  assert.ok(m.name.length <= 45, 'name <= 45 chars (Edge limit)');
  assert.ok(m.description.length <= 132, `description <= 132 chars (is ${m.description.length})`);
  assert.deepEqual(m.permissions, ['activeTab']);
  assert.deepEqual(m.host_permissions, ['https://tools.seopaslaugos.io/*']);
  for (const k of ['background', 'content_scripts', 'web_accessible_resources', 'optional_permissions', 'content_security_policy', 'externally_connectable', 'browser_action', 'page_action']) {
    assert.ok(!(k in m), `no ${k}`);
  }
  const allowed = new Set(['manifest_version', 'name', 'short_name', 'version', 'description', 'homepage_url', 'icons', 'action', 'permissions', 'host_permissions', 'minimum_chrome_version']);
  for (const k of Object.keys(m)) assert.ok(allowed.has(k), `unexpected key ${k}`);
  assert.ok(existsSync(join(DIR, m.action.default_popup)));
  for (const [size, p] of [...Object.entries(m.icons), ...Object.entries(m.action.default_icon)]) {
    assert.ok(existsSync(join(DIR, p)), p);
    const out = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', join(DIR, p)], { encoding: 'utf8' });
    assert.match(out, new RegExp(`pixelWidth: ${size}\\b`));
    assert.match(out, new RegExp(`pixelHeight: ${size}\\b`));
  }
});

test('popup loads only local code (no remote scripts, styles or inline JS)', () => {
  const html = readFileSync(join(DIR, 'popup.html'), 'utf8');
  for (const [, src] of html.matchAll(/<(?:script|link|img)\b[^>]*(?:src|href)="([^"]+)"/g)) assert.ok(!/^(https?:)?\/\//.test(src), `remote asset ${src}`);
  assert.ok(!/<script(?![^>]*\bsrc=)[^>]*>/.test(html), 'no inline <script>');
  assert.ok(!/\son[a-z]+=/i.test(html), 'no inline event handlers');
  for (const f of ['popup.js', 'render.js']) {
    const js = readFileSync(join(DIR, f), 'utf8');
    assert.ok(!/\beval\(|new Function\(|importScripts\(|import\(\s*['"]https?:/.test(js), `no remote/dynamic code in ${f}`);
    for (const [u] of js.matchAll(/https?:\/\/[^\s'"`)]+/g)) assert.ok(/^https:\/\/(tools\.)?seopaslaugos\.io(\/|$)/.test(u), `unexpected URL ${u} in ${f}`);
  }
});
