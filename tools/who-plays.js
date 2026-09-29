'use strict';
// who-plays.js — list every note sounding in a given time window, track by track.
// Usage: node who-plays.js <startSec> <endSec>
const { trackList } = require('./compose.js');
const DIV = 480, BPM = 112;
const t2s = (t) => t * (60 / BPM) / DIV;

const a = Number(process.argv[2] || 3), b = Number(process.argv[3] || 4);
const name = (p) => {
  const N = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  return N[p % 12] + (Math.floor(p / 12) - 1);
};

console.log(`window ${a}s - ${b}s  (beats ${(a / (60 / BPM)).toFixed(2)} - ${(b / (60 / BPM)).toFixed(2)})`);
console.log('');

for (const tr of trackList) {
  const ons = new Map();          // pitch -> start tick
  const hits = [];                // notes sounding inside the window
  const evs = tr.events.slice().sort((x, y) => x.tick - y.tick || x.prio - y.prio);
  for (const e of evs) {
    const hi = e.data[0] & 0xf0;
    if (hi === 0x90 && e.data[2] > 0) ons.set(e.data[1], e.tick);
    else if (hi === 0x80 || (hi === 0x90 && e.data[2] === 0)) {
      const st = ons.get(e.data[1]);
      if (st === undefined) continue;
      ons.delete(e.data[1]);
      const s0 = t2s(st), s1 = t2s(e.tick);
      if (s1 > a && s0 < b) hits.push({ p: e.data[1], v: e.data[2], s0, s1 });
    }
  }
  for (const [p, st] of ons) {
    const s0 = t2s(st);
    if (s0 < b) hits.push({ p, v: 0, s0, s1: Infinity });
  }
  if (!hits.length) continue;
  hits.sort((x, y) => x.s0 - y.s0);
  // also report onsets just before the window so we can see what "enters"
  console.log(`${tr.name}  (${hits.length} notes sounding)`);
  for (const h of hits.slice(0, 24)) {
    const tag = h.s0 >= a ? 'ENTER' : '     ';
    console.log(`   ${tag} ${h.s0.toFixed(2)}s-${h.s1 === Infinity ? '  .  ' : h.s1.toFixed(2)}s  ${name(h.p).padEnd(4)} (${h.p})`);
  }
  console.log('');
}
