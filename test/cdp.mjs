import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [file, size = '390,844', seconds = '45', hash = '#demo'] = process.argv.slice(2);
const profile = mkdtempSync(join(process.env.SCRATCH || tmpdir(), 'cdp-'));
const port = 9300 + Math.floor(Math.random() * 500);
const chrome = spawn('google-chrome', ['--headless=new', '--no-sandbox', '--disable-gpu', `--user-data-dir=${profile}`, `--remote-debugging-port=${port}`, `--window-size=${size}`, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target;
for (let i = 0; i < 50 && !target; i++) {
  await sleep(200);
  try {
    const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    target = list.find((t) => t.type === 'page');
  } catch (err) {}
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0;
const pending = new Map();
const errors = [];
ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg.result); pending.delete(msg.id); }
  if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') errors.push(msg.params.args.map((a) => a.value ?? a.description).join(' '));
});
const send = (method, params = {}) => new Promise((r) => { const n = ++id; pending.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });
await send('Runtime.enable');
await send('Page.enable');
await send('Page.navigate', { url: (file.startsWith('http') ? file : `file://${file}`) + hash });
const phases = [];
const total = Number(seconds);
for (let t = 0; t < total; t += 1) {
  await sleep(1000);
  const r = await send('Runtime.evaluate', { expression: 'document.body ? document.body.dataset.phase : "none"', returnByValue: true });
  const p = r.result.value;
  if (phases[phases.length - 1]?.[1] !== p) phases.push([t + 1, p]);
  if (p === 'sent' || (hash === '' && p === 'fell')) break;
}
const fonts = await send('Runtime.evaluate', { expression: '[...document.fonts].map(f => f.family + " " + f.weight + " " + f.status).join(", ")', returnByValue: true });
const art = await send('Runtime.evaluate', { expression: `(async () => { const node = document.getElementById('art'); if (!node) return 'none'; const data = JSON.parse(node.textContent); const out = []; for (const [k, src] of Object.entries(data)) { const img = new Image(); img.src = src; try { await img.decode(); out.push(k + ' ' + img.naturalWidth + 'x' + img.naturalHeight); } catch (e) { out.push(k + ' FAILED'); } } return out.join(', '); })()`, awaitPromise: true, returnByValue: true });
console.log('phases', JSON.stringify(phases));
console.log('art loaded', art.result.value);
console.log('fonts', fonts.result.value);
console.log('errors', errors.length ? errors : 'none');
ws.close();
chrome.kill();
