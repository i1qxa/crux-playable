import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [file, W = 390, H = 844, hashArg = ''] = process.argv.slice(2).map((v, i) => (i === 1 || i === 2 ? Number(v) : v));
const profile = mkdtempSync(join(process.env.SCRATCH || tmpdir(), 'cdp-'));
const port = 9300 + Math.floor(Math.random() * 500);
const chrome = spawn('google-chrome', ['--headless=new', '--no-sandbox', '--disable-gpu', `--user-data-dir=${profile}`, `--remote-debugging-port=${port}`, `--window-size=${W},${H}`, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target;
for (let i = 0; i < 50 && !target; i++) {
  await sleep(200);
  try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page'); } catch (err) {}
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0;
const pending = new Map();
const errors = [];
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description);
});
const send = (method, params = {}) => new Promise((r) => { const n = ++id; pending.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });
const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result.value;
await send('Runtime.enable');
await send('Page.enable');
await send('Page.addScriptToEvaluateOnNewDocument', { source: `
  window.__opened = [];
  window.mraid = { getState: () => 'default', isViewable: () => true, addEventListener: () => {}, open: (u) => window.__opened.push(u) };
` });
await send('Page.navigate', { url: `file://${file}${hashArg}` });
await sleep(1500);
await ev(`(() => {
  const u = Crux.Spotter.prototype.update;
  Crux.Spotter.prototype.update = function (dt) { this.e.__rival = true; return u.call(this, dt); };
  const o = Crux.Engine.prototype.step;
  Crux.Engine.prototype.step = function (dt) { if (!this.__rival) window.__e = this; return o.call(this, dt); };
})()`);
await sleep(300);
await ev(`(() => { window.__log = []; const c = document.getElementById('game'); for (const t of ['pointerdown', 'pointerup', 'pointercancel', 'lostpointercapture']) c.addEventListener(t, (e) => window.__log.push(t + ':' + e.pointerId + ':' + Math.round(e.clientY))); })()`);

const L = await ev(`(() => {
  const W = innerWidth, H = innerHeight, portrait = H >= W * 1.1;
  let u, wall;
  if (portrait) { u = Math.max(0.75, Math.min(1.5, W / 390)); wall = { x: 0, y: 56 * u, w: W, h: H - 56 * u - 156 * u }; }
  else { u = Math.max(0.7, Math.min(1.4, H / 430)); const sw = Math.min(W * 0.31, 300 * u); wall = { x: sw, y: 0, w: W - sw * 2, h: H }; }
  const s = Math.min(wall.w / 300, wall.h / 430);
  return { u, wall, s, worldLeft: 180 - wall.w / s / 2, portrait, W, H };
})()`);
const scr = async (x, y) => {
  const cam = await ev('window.__e.camera');
  return { x: L.wall.x + (x - L.worldLeft) * L.s, y: L.wall.y + (y - cam) * L.s };
};
const mouse = (type, p) => send('Input.dispatchMouseEvent', { type, x: p.x, y: p.y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1 });
async function drag(from, to) {
  await mouse('mousePressed', from);
  await sleep(30);
  if (process.env.TRACE) console.log('  events', await ev('window.__log.join(" ")'));
  if (process.env.TRACE) console.log('  after press: drag=', await ev('JSON.stringify(window.__e.drag)'), 'aim=', await ev('!!window.__e.aim'), 'limbs=', await ev('JSON.stringify(window.__e.limbs.map(l => [Math.round(l.x), Math.round(l.y)]))'));
  for (let i = 1; i <= 8; i++) {
    await mouse('mouseMoved', { x: from.x + (to.x - from.x) * i / 8, y: from.y + (to.y - from.y) * i / 8 });
    await sleep(16);
  }
  await mouse('mouseReleased', to);
  await sleep(120);
}
const limbHolds = () => ev('window.__e.limbs.map(l => l.hold).join(",")');

console.log('start', await limbHolds());
const pickTarget = (limb, loose) => ev(`(() => { const s = new Crux.Spotter(window.__e); return s.bestHand(${limb}, ${loose}); })()`);
const free = await ev('window.__e.limbs[1].hold === null');
let tapTarget = await pickTarget(1, free);
if (tapTarget !== null) {
  const h = await ev(`[window.__e.holds[${tapTarget}].x, window.__e.holds[${tapTarget}].y]`);
  const tp = await scr(h[0], h[1]);
  await mouse('mousePressed', tp); await sleep(40); await mouse('mouseReleased', tp); await sleep(200);
  console.log(`tap hold ${tapTarget}:`, await limbHolds());
}
await sleep(1200);
const upper = await ev('window.__e.limbs[0].y <= window.__e.limbs[1].y ? 0 : 1');
const upperHold = await ev(`window.__e.limbs[${upper}].hold`);
const dragTarget = await pickTarget(upper, false);
if (dragTarget !== null) {
  const from = await ev(`[window.__e.limbs[${upper}].x, window.__e.limbs[${upper}].y]`);
  const h = await ev(`[window.__e.holds[${dragTarget}].x, window.__e.holds[${dragTarget}].y]`);
  const a = await scr(from[0], from[1]);
  const b = await scr(h[0], h[1]);
  await drag(a, b);
  console.log(`drag ${upper ? 'RH' : 'LH'} ${upperHold} -> ${dragTarget} (screen y ${Math.round(a.y)} -> ${Math.round(b.y)}):`, await limbHolds());
}
console.log('tide running', await ev('window.__e.tideRunning'), 'tideY', await ev('Math.round(window.__e.tideY)'));

if (L.portrait) {
  const ctaX = L.W - 12 * L.u - 41 * L.u, ctaY = 28 * L.u;
  await mouse('mousePressed', { x: ctaX, y: ctaY }); await sleep(40); await mouse('mouseReleased', { x: ctaX, y: ctaY }); await sleep(100);
} else {
  const sw = Math.min(L.W * 0.31, 300 * L.u);
  const p = { x: L.W - sw / 2, y: L.H - 14 * L.u - 24 * L.u };
  await mouse('mousePressed', p); await sleep(40); await mouse('mouseReleased', p); await sleep(100);
}
console.log('cta opened', await ev('JSON.stringify(window.__opened)'));
console.log('chalk before', await ev('window.__e.chalk'));
await ev('window.__e.letGo()');
await sleep(1800);
console.log('after letGo phase', await ev('document.body.dataset.phase'));
{
  for (let y = L.H * 0.3; y < L.H; y += 8) {
    const p = { x: L.W / 2, y };
    await mouse('mousePressed', p); await mouse('mouseReleased', p);
    if (await ev('document.body.dataset.phase') === 'play') { console.log('retry hit at y', Math.round(y), 'phase play, opened', await ev('window.__opened.length')); break; }
  }
}
console.log('music decode', await ev(`(async () => { const m = JSON.parse(document.getElementById('music').textContent); const b = Uint8Array.from(atob(m.data), (c) => c.charCodeAt(0)).buffer; const ctx = new OfflineAudioContext(1, 22050, 22050); const buf = await ctx.decodeAudioData(b); return buf.duration.toFixed(2) + 's loop ' + m.loopStart + '-' + m.loopEnd.toFixed(2); })()`.replace('returnByValue', '')));
console.log('errors', errors.length ? errors : 'none');
ws.close();
chrome.kill();
