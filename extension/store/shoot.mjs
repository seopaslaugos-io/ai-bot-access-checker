// Takes a 1280x800 store screenshot of the real popup running a live check.
// Usage: node extension/store/shoot.mjs <page-url> <out.png> [caption] [--expand Bot1,Bot2] [--scroll px]
// Needs Google Chrome. Serves extension/ on a local port, opens store/frame.html in headless
// Chrome, waits for the popup to finish the live API call, and saves the PNG.
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { extname, join, normalize, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); if (i < 0) return null; const v = args[i + 1]; args.splice(i, 2); return v; };
const expand = (opt('--expand') || '').split(',').filter(Boolean);
const scroll = Number(opt('--scroll') || 0);
const [pageUrl, out, caption, sub] = args;
if (!pageUrl || !out) { console.error('usage: shoot.mjs <page-url> <out.png> [caption] [sub]'); process.exit(2); }

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };
const server = createServer(async (req, res) => {
  const p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^\/+/, '');
  const file = join(ROOT, p);
  if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' }).end(body);
  } catch { res.writeHead(404).end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const profile = mkdtempSync(join(tmpdir(), 'abc-shot-'));
const chrome = spawn(CHROME, [
  '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
  '--window-size=1280,800', '--force-device-scale-factor=1', '--hide-scrollbars', '--no-first-run', 'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });
const wsUrl = await new Promise((ok, fail) => {
  let buf = '';
  chrome.stderr.on('data', d => { buf += d; const m = /DevTools listening on (ws:\/\/\S+)/.exec(buf); if (m) ok(m[1]); });
  setTimeout(() => fail(new Error('Chrome did not start')), 15000);
});

const browser = new WebSocket(wsUrl);
await new Promise(r => browser.addEventListener('open', r, { once: true }));
let seq = 0;
const pending = new Map();
browser.addEventListener('message', ev => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { const { ok, fail } = pending.get(m.id); pending.delete(m.id); m.error ? fail(new Error(m.error.message)) : ok(m.result); }
});
const send = (method, params = {}, sessionId) => new Promise((ok, fail) => {
  const id = ++seq; pending.set(id, { ok, fail });
  browser.send(JSON.stringify({ id, method, params, sessionId }));
});

const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
const s = (m, p) => send(m, p, sessionId);
await s('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
const q = new URLSearchParams({ url: pageUrl });
if (caption) q.set('caption', caption);
if (sub) q.set('sub', sub);
await s('Page.navigate', { url: `http://127.0.0.1:${port}/store/frame.html?${q}` });

const evaluate = async (expr) => (await s('Runtime.evaluate', { expression: expr, returnByValue: true })).result.value;
const started = Date.now();
let state = null;
while (Date.now() - started < 40000) {
  state = await evaluate(`(() => { const d = document.getElementById('popup')?.contentDocument; const r = d && d.getElementById('result');
    return r ? (r.querySelector('.group') ? 'ok' : r.querySelector('.alert') ? 'error' : 'wait') : 'wait'; })()`);
  if (state !== 'wait') break;
  await new Promise(r => setTimeout(r, 500));
}
if (state === 'wait') throw new Error('popup did not finish within 40 s');

await evaluate(`(() => { const d = document.getElementById('popup').contentDocument;
  for (const name of ${JSON.stringify(expand)}) {
    const el = [...d.querySelectorAll('details.bot')].find(x => x.querySelector('strong')?.textContent === name);
    if (el) el.open = true;
  }
  d.querySelector('main').scrollTop = ${scroll};
})()`);
await new Promise(r => setTimeout(r, 300));
const { data } = await s('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: 1280, height: 800, scale: 1 } });
await writeFile(out, Buffer.from(data, 'base64'));
console.log(`${state}: ${out}`);

browser.close();
chrome.kill();
server.close();
