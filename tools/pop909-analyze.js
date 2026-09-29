'use strict';
// pop909-analyze.js — extract real-world pop melody + harmony statistics from
// POP909 (909 songs) so my writing can be checked against data, not my taste.
const fs = require('fs');
const path = require('path');
const { parseMidi } = require('./midiparse.js');

const BASE = path.join(require('./paths').ASSETS, 'pop909', 'POP909');
const songs = fs.readdirSync(BASE).filter(d => /^\d+$/.test(d)).sort();

const durHist = new Map();      // note length in beats -> count
const intervalHist = new Map(); // semitone interval -> count
const onsetHist = new Map();    // 16th position within the beat -> count
const qualityHist = new Map();
const contour = { up: 0, down: 0, same: 0 };
const ranges = [];
const rootsHist = new Map();
let totalNotes = 0, totalSongs = 0, beatsTotal = 0;
const prog4 = new Map();        // 4-chord windows

const BEAT = (t, div) => t / div;

for (const id of songs) {
  const dir = path.join(BASE, id);
  let mid;
  try { mid = parseMidi(fs.readFileSync(path.join(dir, `${id}.mid`))); } catch { continue; }
  totalSongs++;

  // melody = the track with the most notes that is NOT the densest (piano).
  // POP909 convention: track names MELODY / BRIDGE / PIANO.
  let mel = null;
  for (const t of mid.tracks) {
    if (/melod/i.test(t.name)) { mel = t; break; }
  }
  if (!mel) {
    const sorted = mid.tracks.slice().sort((a, b) => a.notes.length - b.notes.length);
    mel = sorted.find(t => t.notes.length > 20) || null;
  }
  if (!mel || mel.notes.length < 10) continue;

  const notes = mel.notes.slice().sort((a, b) => a.tick - b.tick);
  const div = mid.division;
  const pitches = notes.map(n => n.pitch);
  ranges.push(Math.max(...pitches) - Math.min(...pitches));
  totalNotes += notes.length;

  let prev = null;
  for (const nt of notes) {
    const lenB = +(BEAT(nt.len, div)).toFixed(3);
    const bucket = lenB <= 0.3 ? '0.25' : lenB <= 0.6 ? '0.5' : lenB <= 0.9 ? '0.75'
                 : lenB <= 1.3 ? '1.0' : lenB <= 1.8 ? '1.5' : lenB <= 2.5 ? '2.0' : '3.0+';
    durHist.set(bucket, (durHist.get(bucket) || 0) + 1);

    const pos16 = Math.round((nt.tick / div) * 4) % 4;   // 16th within the beat
    onsetHist.set(pos16, (onsetHist.get(pos16) || 0) + 1);

    if (prev !== null) {
      const iv = nt.pitch - prev;
      const key = Math.abs(iv) > 12 ? (iv > 0 ? '>+12' : '<-12') : String(iv);
      intervalHist.set(key, (intervalHist.get(key) || 0) + 1);
      if (iv > 0) contour.up++; else if (iv < 0) contour.down++; else contour.same++;
    }
    prev = nt.pitch;
  }
  const lastTick = notes[notes.length - 1].tick + notes[notes.length - 1].len;
  beatsTotal += lastTick / div;

  // ---- chords ----
  const cp = path.join(dir, `${id}_chord_audio.txt`);
  if (fs.existsSync(cp)) {
    const seq = [];
    for (const line of fs.readFileSync(cp, 'utf8').split(/\r?\n/)) {
      const p = line.split('\t');
      if (p.length < 3) continue;
      const [root, qual] = p[2].split(':');
      if (!root || root === 'N') continue;
      qualityHist.set(qual, (qualityHist.get(qual) || 0) + 1);
      rootsHist.set(root, (rootsHist.get(root) || 0) + 1);
      seq.push(`${root}:${qual}`);
    }
    for (let i = 0; i + 3 < seq.length; i++) {
      const w = seq.slice(i, i + 4).join(' ');
      prog4.set(w, (prog4.get(w) || 0) + 1);
    }
  }
}

const pct = (v, tot) => `${(100 * v / tot).toFixed(1)}%`;
const top = (m, n = 12) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);

console.log(`=== POP909: ${totalSongs} songs, ${totalNotes} melody notes ===\n`);

console.log('--- melody note length (beats) ---');
for (const [k, v] of top(durHist, 8)) console.log(`  ${k.padEnd(6)} ${String(v).padStart(7)}  ${pct(v, totalNotes)}`);

console.log('\n--- where notes START within the beat (16th position) ---');
for (let i = 0; i < 4; i++) {
  const v = onsetHist.get(i) || 0;
  console.log(`  ${['1 (downbeat)','e','&','a'][i].padEnd(14)} ${String(v).padStart(7)}  ${pct(v, totalNotes)}`);
}
const onBeat = (onsetHist.get(0) || 0) + (onsetHist.get(2) || 0);
console.log(`  -> on the 8th grid: ${pct(onBeat, totalNotes)}   off (16ths): ${pct(totalNotes - onBeat, totalNotes)}`);

console.log('\n--- melodic intervals (semitones to previous note) ---');
for (const [k, v] of top(intervalHist, 14)) console.log(`  ${k.padEnd(6)} ${String(v).padStart(7)}  ${pct(v, totalNotes - totalSongs)}`);

const cs = contour.up + contour.down + contour.same;
console.log('\n--- contour ---');
console.log(`  up ${pct(contour.up, cs)}   down ${pct(contour.down, cs)}   repeat ${pct(contour.same, cs)}`);
ranges.sort((a, b) => a - b);
console.log(`  melody range: median ${ranges[Math.floor(ranges.length / 2)]} semitones `
          + `(p10 ${ranges[Math.floor(ranges.length * 0.1)]}, p90 ${ranges[Math.floor(ranges.length * 0.9)]})`);

console.log('\n--- chord qualities used ---');
const qTot = [...qualityHist.values()].reduce((a, b) => a + b, 0);
for (const [k, v] of top(qualityHist, 12)) console.log(`  ${k.padEnd(8)} ${String(v).padStart(6)}  ${pct(v, qTot)}`);

console.log('\n--- most common 4-chord windows ---');
for (const [k, v] of top(prog4, 14)) console.log(`  ${String(v).padStart(5)}  ${k}`);

// ==========================================================================
// Same metrics applied to MY melody, so the comparison is apples-to-apples.
// ==========================================================================
console.log('\n\n========== MY MELODY, same metrics ==========');
{
  const mid = parseMidi(fs.readFileSync(path.join(require('./paths').OUT, 'midnight_signal.mid')));
  const mel = mid.tracks.find(t => /lead/i.test(t.name));
  if (!mel) { console.log('no lead track'); process.exit(0); }
  const notes = mel.notes.slice().sort((a, b) => a.tick - b.tick);
  const div = mid.division;
  const d = new Map(), o = new Map(), iv = new Map();
  const co = { up: 0, down: 0, same: 0 };
  let prev = null;
  for (const nt of notes) {
    const lenB = +(nt.len / div).toFixed(3);
    const b = lenB <= 0.3 ? '0.25' : lenB <= 0.6 ? '0.5' : lenB <= 0.9 ? '0.75'
            : lenB <= 1.3 ? '1.0' : lenB <= 1.8 ? '1.5' : lenB <= 2.5 ? '2.0' : '3.0+';
    d.set(b, (d.get(b) || 0) + 1);
    o.set(Math.round((nt.tick / div) * 4) % 4, (o.get(Math.round((nt.tick / div) * 4) % 4) || 0) + 1);
    if (prev !== null) {
      const v = nt.pitch - prev;
      const k = Math.abs(v) > 12 ? (v > 0 ? '>+12' : '<-12') : String(v);
      iv.set(k, (iv.get(k) || 0) + 1);
      if (v > 0) co.up++; else if (v < 0) co.down++; else co.same++;
    }
    prev = nt.pitch;
  }
  const N = notes.length;
  const ps = notes.map(n => n.pitch);
  console.log(`notes = ${N}   range = ${Math.max(...ps) - Math.min(...ps)} semitones (real median 18)`);
  console.log('--- length ---');
  for (const k of ['0.25','0.5','0.75','1.0','1.5','2.0','3.0+'])
    console.log(`  ${k.padEnd(6)} ${String(d.get(k)||0).padStart(5)}  ${pct(d.get(k)||0, N)}`);
  console.log('--- onset within beat  (real: 23/27/23/27) ---');
  for (let i = 0; i < 4; i++)
    console.log(`  ${['1','e','&','a'][i].padEnd(2)} ${String(o.get(i)||0).padStart(5)}  ${pct(o.get(i)||0, N)}`);
  const ob = (o.get(0)||0) + (o.get(2)||0);
  console.log(`  -> on the 8th grid: ${pct(ob, N)}  (real 46.0%)   off: ${pct(N-ob, N)}  (real 54.0%)`);
  console.log('--- intervals (real: 0=23.2  -2=19.3  +2=16.8) ---');
  for (const [k, v] of top(iv, 10)) console.log(`  ${k.padEnd(6)} ${String(v).padStart(5)}  ${pct(v, N-1)}`);
  const c = co.up + co.down + co.same;
  console.log(`--- contour: up ${pct(co.up,c)} down ${pct(co.down,c)} repeat ${pct(co.same,c)}  (real 36.8/40.1/23.2)`);
}
