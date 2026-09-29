'use strict';
// spectrum.js — spectral centroid + high-frequency ratio for each WAV.
// Brightness is what makes an instrument fight for space, so this ranks the
// candidates by how much top-end they bring.
const fs = require('fs');

function readWav(p) {
  const b = fs.readFileSync(p);
  let i = 12, off = -1, len = 0, ch = 2, bits = 16, sr = 44100;
  while (i < b.length - 8) {
    const id = b.toString('ascii', i, i + 4), sz = b.readUInt32LE(i + 4);
    if (id === 'fmt ') { ch = b.readUInt16LE(i + 10); sr = b.readUInt32LE(i + 12); bits = b.readUInt16LE(i + 22); }
    else if (id === 'data') { off = i + 8; len = sz; }
    if (sz === 0) break;
    i += 8 + sz + (sz % 2);
  }
  const n = Math.floor(len / 2 / ch);
  const L = new Float32Array(n);
  for (let k = 0; k < n; k++) L[k] = b.readInt16LE(off + k * ch * 2) / 32768;
  return { L, sr };
}

function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k], ui = im[i + k];
        const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr; im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
        const ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr;
      }
    }
  }
}

const N = 4096;
const win = new Float32Array(N);
for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1));

console.log('file                                 centroid   >2k     >4k    >8k   (energy share)');
const rows = [];
for (const p of process.argv.slice(2)) {
  const { L, sr } = readWav(p);
  let frames = 0;
  const acc = new Float64Array(N / 2);
  // sample 60 frames spread across the file, only where there is signal
  for (let f = 0; f < 60; f++) {
    const s = Math.floor((L.length - N) * (f / 60));
    if (s < 0) break;
    let e = 0;
    for (let i = 0; i < N; i++) e += L[s + i] * L[s + i];
    if (e / N < 1e-5) continue;               // silence
    const re = new Float64Array(N), im = new Float64Array(N);
    for (let i = 0; i < N; i++) re[i] = L[s + i] * win[i];
    fft(re, im);
    for (let k = 0; k < N / 2; k++) acc[k] += re[k] * re[k] + im[k] * im[k];
    frames++;
  }
  if (!frames) { console.log(`${p}  (silent)`); continue; }
  let tot = 0, cen = 0;
  for (let k = 0; k < N / 2; k++) { tot += acc[k]; cen += acc[k] * (k * sr / N); }
  const band = (hz) => {
    let s = 0;
    for (let k = Math.ceil(hz * N / sr); k < N / 2; k++) s += acc[k];
    return tot > 0 ? s / tot : 0;
  };
  const name = p.split(/[\\/]/).pop().replace(/\.wav$/, '');
  rows.push({ name, cen: cen / tot, b2: band(2000), b4: band(4000), b8: band(8000) });
}
rows.sort((a, b) => a.cen - b.cen);
for (const r of rows) {
  console.log(`${r.name.padEnd(36)} ${r.cen.toFixed(0).padStart(6)} Hz  ` +
    `${(r.b2 * 100).toFixed(1).padStart(5)}% ${(r.b4 * 100).toFixed(1).padStart(6)}% ` +
    `${(r.b8 * 100).toFixed(1).padStart(6)}%`);
}
