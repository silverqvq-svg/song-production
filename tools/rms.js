'use strict';
// rms.js — raw RMS of a 16-bit stereo WAV, one line per file.
const fs = require('fs');
for (const p of process.argv.slice(2)) {
  const b = fs.readFileSync(p);
  let i = 12, off = -1, len = 0, ch = 2, bits = 16;
  while (i < b.length - 8) {
    const id = b.toString('ascii', i, i + 4), sz = b.readUInt32LE(i + 4);
    if (id === 'fmt ') { ch = b.readUInt16LE(i + 10); bits = b.readUInt16LE(i + 22); }
    else if (id === 'data') { off = i + 8; len = sz; }
    if (sz === 0) break;
    i += 8 + sz + (sz % 2);
  }
  const n = Math.floor(len / 2);
  let ss = 0;
  for (let k = 0; k < n; k++) { const v = b.readInt16LE(off + k * 2) / 32768; ss += v * v; }
  const rms = Math.sqrt(ss / n) || 1e-9;
  console.log(`${(20 * Math.log10(rms)).toFixed(2)}\t${p}`);
}
