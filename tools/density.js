'use strict';
// density.js — how crowded is the arrangement? For each bar, count the notes
// SOUNDING at once, and how much the melody collides with the guitar bed.
const { trackList, SECTIONS } = require('./compose.js');
const DIV = 480, BPM = 112;
const t2s = (t) => t * (60 / BPM) / DIV;
const barOf = (t) => t / (DIV * 4);

// collapse each track into [startTick, endTick) spans
const spans = new Map();
for (const tr of trackList) {
  const open = new Map(), out = [];
  for (const e of tr.events.slice().sort((a, b) => a.tick - b.tick || a.prio - b.prio)) {
    const hi = e.data[0] & 0xf0;
    if (hi === 0x90 && e.data[2] > 0) open.set(e.data[1], e.tick);
    else if (hi === 0x80 || (hi === 0x90 && e.data[2] === 0)) {
      const st = open.get(e.data[1]);
      if (st === undefined) continue;
      open.delete(e.data[1]);
      out.push([st, e.tick, e.data[1]]);
    }
  }
  spans.set(tr.name, out);
}

const GUITARS = ['Guitar L', 'Guitar R', 'Ac.Gtr', 'Ac.Gtr Strum'];
const LEAD = 'Lead (vocal guide)';

console.log('=== peak simultaneous notes per section ===');
console.log('section      bar   all  drums bass  keys gtrs  lead  guitars-at-once');
let cursor = 0;
for (const s of SECTIONS) {
  const start = cursor; cursor += s.bars;
  const t0 = start * DIV * 4, t1 = (start + s.bars) * DIV * 4;
  let peakAll = 0, peakGtr = 0, peakLead = 0, peakKeys = 0, peakDrums = 0, peakBass = 0;
  const STEP = DIV / 4;                       // scan at 16th-note resolution
  for (let t = t0; t < t1; t += STEP) {
    const live = (n) => (spans.get(n) || []).filter(([a, b]) => a <= t && b > t).length;
    const g = GUITARS.reduce((a, n) => a + live(n), 0);
    const k = live('Ac.Piano') + live('E.Piano');
    peakAll = Math.max(peakAll, g + k + live(LEAD) + live('Bass') + live('Drums'));
    peakGtr = Math.max(peakGtr, g);
    peakLead = Math.max(peakLead, live(LEAD));
    peakKeys = Math.max(peakKeys, k);
    peakDrums = Math.max(peakDrums, live('Drums'));
    peakBass = Math.max(peakBass, live('Bass'));
  }
  console.log(
    `${s.key.padEnd(10)} ${String(start).padStart(3)}   ${String(peakAll).padStart(3)}` +
    `  ${String(peakDrums).padStart(5)} ${String(peakBass).padStart(4)}` +
    ` ${String(peakKeys).padStart(5)} ${String(peakGtr).padStart(5)} ${String(peakLead).padStart(5)}` +
    `   ${peakGtr}`);
}

console.log('\n=== where the melody sits versus the guitar bed (whole song) ===');
const lead = spans.get(LEAD) || [];
const inLead = (t) => lead.some(([a, b]) => a <= t && b > t);
for (const g of GUITARS) {
  const sp = spans.get(g) || [];
  if (!sp.length) continue;
  const ps = sp.map((x) => x[2]).sort((a, b) => a - b);
  // how often is this guitar sounding while the melody is also sounding?
  let overlap = 0, total = 0;
  for (let t = 0; t < 74 * DIV * 4; t += DIV / 4) {
    const on = sp.some(([a, b]) => a <= t && b > t);
    if (on) { total++; if (inLead(t)) overlap++; }
  }
  // scan step is a 16th, so 16 samples per bar
  console.log(`${g.padEnd(12)} range ${ps[0]}-${ps[ps.length - 1]}  median ${ps[ps.length >> 1]}` +
    `   sounding ${(total / 16 / 74 * 100).toFixed(0)}% of bars, ` +
    `${total ? (overlap / total * 100).toFixed(0) : 0}% of that WITH the melody`);
}
const lp = lead.map((x) => x[2]).sort((a, b) => a - b);
console.log(`${LEAD.padEnd(12)} range ${lp[0]}-${lp[lp.length - 1]}  median ${lp[lp.length >> 1]}`);
