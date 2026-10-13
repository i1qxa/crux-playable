import { readFileSync, writeFileSync } from 'node:fs';

const [input, output, metaOut, startArg, lenArg, fadeArg = '1.0', padArg = '0.5'] = process.argv.slice(2);
const buf = readFileSync(input);
const dataAt = buf.indexOf('data') + 8;
const rate = buf.readUInt32LE(24);
const n = (buf.length - dataAt) >> 1;
const x = new Float32Array(n);
for (let i = 0; i < n; i++) x[i] = buf.readInt16LE(dataAt + i * 2) / 32768;

const s = Math.round(Number(startArg) * rate);
const L = Math.round(Number(lenArg) * rate);
const F = Math.round(Number(fadeArg) * rate);
const P = Math.round(Number(padArg) * rate);
if (s + L + F > n) throw new Error('segment exceeds source');

const y = new Float32Array(L);
for (let i = 0; i < L; i++) y[i] = x[s + i];
for (let i = 0; i < F; i++) {
  const t = i / F;
  const fin = Math.sin(t * Math.PI / 2);
  const fout = Math.cos(t * Math.PI / 2);
  y[i] = x[s + i] * fin + x[s + L + i] * fout;
}
let peak = 0;
for (const v of y) peak = Math.max(peak, Math.abs(v));
const gain = peak > 0 ? 0.89 / peak : 1;

const total = L + 2 * P;
const out = Buffer.alloc(44 + total * 2);
out.write('RIFF', 0);
out.writeUInt32LE(36 + total * 2, 4);
out.write('WAVE', 8);
out.write('fmt ', 12);
out.writeUInt32LE(16, 16);
out.writeUInt16LE(1, 20);
out.writeUInt16LE(1, 22);
out.writeUInt32LE(rate, 24);
out.writeUInt32LE(rate * 2, 28);
out.writeUInt16LE(2, 32);
out.writeUInt16LE(16, 34);
out.write('data', 36);
out.writeUInt32LE(total * 2, 40);
for (let i = 0; i < total; i++) {
  const v = y[((i - P) % L + L) % L] * gain;
  out.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(v * 32767))), 44 + i * 2);
}
writeFileSync(output, out);
writeFileSync(metaOut, JSON.stringify({ loopStart: P / rate, loopEnd: (P + L) / rate }));
console.log(`rate=${rate} loop=${(L / rate).toFixed(3)}s pad=${(P / rate).toFixed(2)}s peakGain=${gain.toFixed(2)}`);
