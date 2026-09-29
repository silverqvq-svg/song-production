'use strict';
// analyze.js — objective mix report. Section boundaries are DERIVED from
// compose.js so they can never go stale again (that bug cost me a render).
const fs = require('fs');
const path = require('path');
const { SECTIONS } = require('./compose.js');

const file = process.argv[2] || path.join(require('./paths').OUT, 'midnight_signal.wav');
const BPM = 112;
const b = fs.readFileSync(file);

let i = 12, dataOff = -1, dataLen = 0, ch = 2, sr = 44100, bits = 16;
while (i < b.length - 8) {
  const id = b.toString('ascii', i, i + 4);
  const sz = b.readUInt32LE(i + 4);
  if (id === 'fmt ') { ch = b.readUInt16LE(i + 10); sr = b.readUInt32LE(i + 12); bits = b.readUInt16LE(i + 22); }
  else if (id === 'data') { dataOff = i + 8; dataLen = sz; }
  if (sz === 0) break;
  i += 8 + sz + (sz % 2);
}
const bpf = bits / 8;
const frames = Math.floor(dataLen / (bpf * ch));
const L = new Float32Array(frames), R = new Float32Array(frames);
for (let x = 0; x < frames; x++) {
  L[x] = b.readInt16LE(dataOff + x * bpf * ch) / 32768;
  R[x] = b.readInt16LE(dataOff + x * bpf * ch + bpf) / 32768;
}

const db = (v) => v > 0 ? (20 * Math.log10(v)).toFixed(1) : '-inf';
let pk = 0, sq = 0, lr = 0, ll = 0, rr = 0, diff = 0, clip = 0;
for (let x = 0; x < frames; x++) {
  const l = L[x], r = R[x];
  const a = Math.max(Math.abs(l), Math.abs(r));
  if (a > pk) pk = a;
  if (a >= 0.9995) clip++;
  sq += (l * l + r * r) / 2;
  lr += l * r; ll += l * l; rr += r * r;
  const d = l - r; diff += d * d;
}
const rms = Math.sqrt(sq / frames);
const corr = lr / Math.sqrt(ll * rr);
const side = 100 * Math.sqrt(diff / (ll + rr));

console.log(`file      : ${path.basename(file)}`);
console.log(`format    : ${ch}ch ${sr}Hz ${bits}bit  ${(frames / sr).toFixed(1)}s`);
console.log(`peak      : ${pk.toFixed(4)}  (${db(pk)} dBFS)`);
console.log(`rms       : ${rms.toFixed(4)}  (${db(rms)} dBFS)`);
console.log(`crest     : ${(20 * Math.log10(pk / rms)).toFixed(1)} dB   (higher = more dynamic)`);
console.log(`clipped   : ${clip} frames (${(100 * clip / frames).toFixed(4)}%)`);
console.log(`stereo    : L/R corr = ${corr.toFixed(3)}   side energy = ${side.toFixed(1)}%`);

function bandEnergy(lowHz, highHz) {
  let lp1 = 0, lp2 = 0, e = 0;
  const aLow = Math.exp(-2 * Math.PI * lowHz / sr);
  const aHigh = Math.exp(-2 * Math.PI * highHz / sr);
  for (let x = 0; x < frames; x++) {
    const m = (L[x] + R[x]) * 0.5;
    lp1 = lp1 * aLow + m * (1 - aLow);
    lp2 = lp2 * aHigh + m * (1 - aHigh);
    const bandv = lowHz <= 0 ? lp2 : (lp2 - lp1);
    e += bandv * bandv;
  }
  return Math.sqrt(e / frames);
}
const bands = [['sub <120', 0, 120], ['low 120-350', 120, 350], ['lowmid 350-1.2k', 350, 1200],
               ['mid 1.2k-3k', 1200, 3000], ['high 3k-8k', 3000, 8000], ['air >8k', 8000, 20000]];
console.log('--- band energy ---');
for (const [nm, lo, hi] of bands) console.log(`  ${nm.padEnd(16)} ${db(bandEnergy(lo, hi))} dB`);

// ---- sections derived from compose.js (never stale again) ----
const SPB = 60 / BPM;
const barS = 4 * SPB;
console.log('--- section dynamics & timing ---');
let acc = 0;
const rows = [];
for (const s of SECTIONS) {
  const a = Math.floor(acc * barS * sr);
  const z = Math.min(frames, Math.floor((acc + s.bars) * barS * sr));
  let e = 0, p = 0;
  for (let x = a; x < z; x++) {
    e += (L[x] * L[x] + R[x] * R[x]) / 2;
    const av = Math.max(Math.abs(L[x]), Math.abs(R[x]));
    if (av > p) p = av;
  }
  const r = Math.sqrt(e / Math.max(1, z - a));
  const t0 = acc * barS, t1 = (acc + s.bars) * barS;
  const mm = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  rows.push({ key: s.key, bar: acc, bars: s.bars,
              rms: 20 * Math.log10(r + 1e-9), pk: 20 * Math.log10(p + 1e-9),
              t: `${mm(t0)}-${mm(t1)}` });
  acc += s.bars;
}
const maxR = Math.max(...rows.map(r => r.rms));
for (const r of rows) {
  const graph = '#'.repeat(Math.max(0, Math.round(r.rms - maxR + 26)));
  console.log(`  ${r.key.padEnd(9)} bar ${String(r.bar).padStart(3)} +${String(r.bars).padStart(2)}  ${r.t.padStart(11)}  rms ${r.rms.toFixed(1).padStart(6)}  peak ${r.pk.toFixed(1).padStart(5)}  ${graph}`);
}
console.log(`  (all relative to the loudest section = ${maxR.toFixed(1)} dBFS)`);
