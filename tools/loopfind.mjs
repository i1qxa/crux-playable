import { readFileSync } from 'node:fs';

const buf = readFileSync(process.argv[2]);
const dataAt = buf.indexOf('data') + 8;
const rate = buf.readUInt32LE(24);
const n = (buf.length - dataAt) >> 1;
const x = new Float32Array(n);
for (let i = 0; i < n; i++) x[i] = buf.readInt16LE(dataAt + i * 2) / 32768;
const minLen = Number(process.argv[3] || 12), maxLen = Number(process.argv[4] || 70);

const hop = Math.round(rate * 0.005);
const env = new Float32Array(Math.floor(n / hop));
for (let k = 0; k < env.length; k++) {
  let s = 0;
  for (let j = k * hop; j < (k + 1) * hop; j++) s += x[j] * x[j];
  env[k] = Math.sqrt(s / hop);
}
let mean = env.reduce((a, b) => a + b, 0) / env.length;
for (let k = 0; k < env.length; k++) env[k] -= mean;

function ncc(arr, a, b, len) {
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < len; i++) {
    const p = arr[a + i], q = arr[b + i];
    sab += p * q; saa += p * p; sbb += q * q;
  }
  return sab / Math.sqrt(saa * sbb + 1e-12);
}

const coarse = [];
const span = Math.round(8 / 0.005);
for (let lag = Math.round(minLen / 0.005); lag <= Math.round(maxLen / 0.005); lag++) {
  const starts = [2, 6].map((t) => Math.round(t / 0.005)).filter((s) => s + lag + span < env.length);
  if (!starts.length) continue;
  const v = Math.min(...starts.map((s) => ncc(env, s, s + lag, span)));
  coarse.push([lag, v]);
}
const peaks = coarse.filter(([lag, v], i) => i > 0 && i < coarse.length - 1 && v >= coarse[i - 1][1] && v >= coarse[i + 1][1]).sort((a, b) => b[1] - a[1]).slice(0, 6);

for (const [lag, v] of peaks) {
  const approx = lag * hop;
  let bL = approx, bC = -Infinity;
  const start = Math.round(rate * 3);
  for (let d = -hop * 3; d <= hop * 3; d++) {
    const c = ncc(x, start, start + approx + d, Math.round(rate * 0.5));
    if (c > bC) { bC = c; bL = approx + d; }
  }
  const checks = [1, 3, 5, 8, 12, 16].map((t) => Math.round(rate * t)).filter((s) => s + bL + rate < n);
  const score = checks.map((s) => ncc(x, s, s + bL, Math.round(rate * 0.75)));
  console.log(`len=${(bL / rate).toFixed(4)}s samples=${bL} envCorr=${v.toFixed(3)} sampleCorr min=${Math.min(...score).toFixed(4)} avg=${(score.reduce((a, b) => a + b, 0) / score.length).toFixed(4)}`);
}
