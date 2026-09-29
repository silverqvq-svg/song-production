'use strict';
// scattered.js — find short, high, sparse notes (the "plucked / EP-like" specks).
// Usage: node scattered.js [minPitch] [maxDurSec]
const { trackList, SECTIONS } = require('./compose.js');
const DIV = 480, BPM = 112;
const t2s = (t) => t * (60 / BPM) / DIV;

const MINP = Number(process.argv[2] || 76);
const MAXD = Number(process.argv[3] || 0.35);

const NM = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const nm = (p) => NM[p % 12] + (Math.floor(p / 12) - 1);

// section lookup by tick
const bounds = [];
{
  let c = 0;
  for (const s of SECTIONS) { bounds.push([c * DIV * 4, (c + s.bars) * DIV * 4, s.key]); c += s.bars; }
}
const secOf = (t) => (bounds.find(([a, b]) => t >= a && t < b) || [0, 0, '?'])[2];

console.log(`short (<= ${MAXD}s) notes at or above MIDI ${MINP} (${nm(MINP)})\n`);
console.log('track                 count  %ofTrack   pitch range   per section');
console.log('-'.repeat(96));

const tally = new Map();
for (const tr of trackList) {
  const open = new Map(), all = [], hit = [];
  for (const e of tr.events.slice().sort((a, b) => a.tick - b.tick || a.prio - b.prio)) {
    const hi = e.data[0] & 0xf0;
    if (hi === 0x90 && e.data[2] > 0) open.set(e.data[1], e.tick);
    else if (hi === 0x80 || (hi === 0x90 && e.data[2] === 0)) {
      const st = open.get(e.data[1]);
      if (st === undefined) continue;
      open.delete(e.data[1]);
      all.push([st, e.tick, e.data[1]]);
      const dur = t2s(e.tick - st);
      if (e.data[1] >= MINP && dur <= MAXD) hit.push([st, e.tick, e.data[1], dur]);
    }
  }
  if (!all.length) continue;
  if (!hit.length) { tally.set(tr.name, 0); continue; }
  tally.set(tr.name, hit.length);
  const ps = hit.map((h) => h[2]);
  const per = {};
  for (const h of hit) { const s = secOf(h[0]); per[s] = (per[s] || 0) + 1; }
  const perStr = Object.entries(per).map(([k, v]) => `${k}:${v}`).join(' ');
  console.log(`${tr.name.padEnd(21)} ${String(hit.length).padStart(5)}  ${(hit.length / all.length * 100).toFixed(0).padStart(5)}%   ` +
    `${nm(Math.min(...ps))}-${nm(Math.max(...ps))}`.padEnd(14) + `  ${perStr}`);
}

console.log('\n=== the worst offenders, with their first few timestamps ===');
const ranked = [...tally.entries()].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).slice(0, 5);
for (const [name, n] of ranked) {
  const tr = trackList.find((t) => t.name === name);
  const open = new Map(), hit = [];
  for (const e of tr.events.slice().sort((a, b) => a.tick - b.tick || a.prio - b.prio)) {
    const hi = e.data[0] & 0xf0;
    if (hi === 0x90 && e.data[2] > 0) open.set(e.data[1], e.tick);
    else if (hi === 0x80 || (hi === 0x90 && e.data[2] === 0)) {
      const st = open.get(e.data[1]);
      if (st === undefined) continue;
      open.delete(e.data[1]);
      if (e.data[1] >= MINP && t2s(e.tick - st) <= MAXD) hit.push([t2s(st), e.data[1]]);
    }
  }
  hit.sort((a, b) => a[0] - b[0]);
  const spread = hit.map(([t, p]) => `${t.toFixed(1)}s ${nm(p)}`).slice(0, 12).join(' | ');
  console.log(`\n${name}  (${n} hits)\n  ${spread}${hit.length > 12 ? ' ...' : ''}`);
}
