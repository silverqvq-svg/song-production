'use strict';
// decay.js <drums.wav> [kickPitch] [snarePitch]
// Time-locks every kick/snare onset and averages the envelope that follows, so
// "the hits get out of the way faster" becomes a number instead of a feeling.
const fs = require('fs');
const { trackList } = require('./compose.js');
const DIV = 480, BPM = 112;
const t2s = (t) => t * (60 / BPM) / DIV;

function readWav(p) {
  const b = fs.readFileSync(p);
  let i = 12, off = -1, len = 0, ch = 2, bits = 16, sr = 44100;
  while (i < b.length - 8) {
    const id = b.toString('ascii', i, i + 4), sz = b.readUInt32LE(i + 4);
    if (id === 'fmt ') { ch = b.readUInt16LE(i + 10); sr = b.readUInt32LE(i + 12); }
    else if (id === 'data') { off = i + 8; len = sz; }
    if (sz === 0) break;
    i += 8 + sz + (sz % 2);
  }
  const n = Math.floor(len / 2 / ch);
  const L = new Float32Array(n);
  for (let k = 0; k < n; k++) L[k] = b.readInt16LE(off + k * ch * 2) / 32768;
  return { L, sr };
}

const { L, sr } = readWav(process.argv[2]);
const START = Number(process.argv[3] || 0);      // seconds into the song that the file begins
const drums = trackList.find((t) => t.name === 'Drums');
const hits = { kick: [], snare: [] };
for (const e of drums.events) {
  if ((e.data[0] & 0xf0) !== 0x90 || e.data[2] === 0) continue;
  const s = Math.round((t2s(e.tick) - START) * sr);
  if (e.data[1] === 36) hits.kick.push(s);
  else if (e.data[1] === 38) hits.snare.push(s);
}

const OFFS = [0.003, 0.010, 0.020, 0.035, 0.060, 0.100, 0.150, 0.220, 0.300];
const WIN = Math.round(0.008 * sr);          // 8 ms window per measurement

for (const [name, list] of Object.entries(hits)) {
  const used = list.filter((o) => o >= 0 && o + 0.35 * sr < L.length);
  if (!used.length) continue;
  const curve = OFFS.map((off) => {
    let sum = 0;
    for (const o of used) {
      const s0 = o + Math.round(off * sr);
      let peak = 0;
      for (let k = 0; k < WIN; k++) { const a = Math.abs(L[s0 + k]); if (a > peak) peak = a; }
      sum += peak;
    }
    return sum / used.length;
  });
  const ref = curve[0];
  console.log(`\n${name}  (${used.length} hits averaged)`);
  console.log('  ms after hit : ' + OFFS.map((o) => `${(o * 1000).toFixed(0)}`.padStart(7)).join(''));
  console.log('  dBFS         : ' + curve.map((v) => (20 * Math.log10(v || 1e-9)).toFixed(1).padStart(7)).join(''));
  console.log('  rel to 3ms   : ' + curve.map((v) => (20 * Math.log10(v / ref || 1e-9)).toFixed(1).padStart(7)).join(''));
}
