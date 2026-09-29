'use strict';
// ---------------------------------------------------------------
// compose.js v2 — "Midnight Signal" / modern city pop
// Rewritten after research: real harmonic variation, groove
// variation, off-beat anticipation, and a genuine dynamic arc.
//
// Key: F major -> final chorus modulates up a whole step to G
// Tempo: 112 BPM, 4/4
// ---------------------------------------------------------------
const fs = require('fs');
const path = require('path');
const { Track, n, B, writeFile } = require('./midi.js');

const OUT = require('./paths').OUT;   // <root>/out
fs.mkdirSync(OUT, { recursive: true });

// ============================ HARMONY ============================
const IV = {
  'maj':[0,4,7], 'maj7':[0,4,7,11], 'maj9':[0,4,7,11,14],
  '69':[0,4,7,9,14], 'maj7#11':[0,4,7,11,18],
  'm7':[0,3,7,10], 'm9':[0,3,7,10,14], 'm11':[0,3,7,10,14,17],
  'm7b5':[0,3,6,10],
  '7':[0,4,7,10], '9':[0,4,7,10,14], '13':[0,4,7,10,14,21],
  '7#9':[0,4,7,10,15], '7b13':[0,4,7,10,20], '7sus4':[0,5,7,10],
  'dim7':[0,3,6,9],
};

function parse(sym) {
  const m = /^([A-G][#b]?)(.*)$/.exec(sym);
  if (!m) throw new Error('bad chord: ' + sym);
  let rest = m[2], bass = null;
  const s = rest.indexOf('/');
  if (s >= 0) { bass = rest.slice(s + 1); rest = rest.slice(0, s); }
  return { root: m[1], quality: rest || 'maj', bass, sym };
}
const pc = (name) => ((n(name + '4') % 12) + 12) % 12;

function voicing(sym, center = 64, dropRoot = false) {
  const c = parse(sym);
  const rpc = pc(c.root);
  const iv = IV[c.quality] || IV.maj7;
  let notes = iv.map(i => rpc + i);
  if (dropRoot) notes = notes.slice(1);              // rootless voicing (bass covers it)
  let avg = notes.reduce((a, b) => a + b, 0) / notes.length;
  while (avg < center - 6) { notes = notes.map(x => x + 12); avg += 12; }
  while (avg > center + 6) { notes = notes.map(x => x - 12); avg -= 12; }
  return notes;
}
const bassPitch = (sym, oct = 2) => { const c = parse(sym); return n((c.bass || c.root) + oct); };
const top4 = (sym, center = 67) => voicing(sym, center).slice(-4);
/** safe voicing index — slash chords like Bb/C only have 3 tones, so raw
 *  v[i] can be undefined and silently became pitch 0 in the MIDI. */
const vAt = (v, i) => v[Math.min(Math.max(i, 0), v.length - 1)];

// ============================ SONG MAP ============================
// Each entry: { key, bars, dyn, layers, chords[] }
// Chord strings with a space split the bar into equal parts.
const SECTIONS = [
  // ---- rewritten against the two references -------------------------------
  // ZUTOMAYO「消えてしまいそうです」(106bpm): verse is literally IV - I - vi,
  //   three chords, looped. YORUSHIKA「千鳥」(120bpm): intro is I - ii - iii - vi.
  // Lesson: modern j-pop is harmonically SIMPLE and repeats. All the 9ths,
  // 13ths and #9s I had were the 80s jazz-pop signature, not this.
  // ------------------------------------------------------------------------
  { key:'intro', bars:4, dyn:0.82, chords:[
    'Bbmaj7','Fmaj7 Dm7','Bbmaj7','Fmaj7'] },              // IV | I vi

  { key:'verse', bars:8, dyn:0.90, chords:[
    'Bbmaj7','Fmaj7 Dm7','Bbmaj7','Fmaj7',                 // IV | I vi  (x1)
    'Bbmaj7','Bbm7', 'Am7 D7','Gm7 C7'] },                 // IVm borrow + turnaround

  { key:'pre', bars:4, dyn:0.80, chords:['Dm7','G7','C7','Bb/C'] },  // descending-fifths chain

  // CHORUS 1 (variant 1): deliberately RESTRAINED — no cutting guitar, no
  // strings, 8th-note piano. It has to leave headroom or 2 and 3 cannot grow.
  { key:'chorus', bars:8, dyn:1.10, variant:1, chords:[
    'Bbmaj7','C7','Am7','Dm7', 'Bbmaj7','C7','Fmaj7','C7'] },

  { key:'inter', bars:4, dyn:1.02, chords:['Bbmaj7','C7','Am7','Dm7'] },

  { key:'verse', bars:8, dyn:0.93, chords:[
    'Bbmaj7','Fmaj7 Dm7','Bbmaj7','Fmaj7',
    'Bbmaj7','Bbm7', 'Am7 D7','Gm7 C7'] },
  { key:'pre', bars:4, dyn:0.82, chords:['Dm7','G7','C7','Bb/C'] },
  // CHORUS 2 (variant 2): cutting guitar + strings return, 16th piano,
  // 2-part harmony, octave-doubled lead
  { key:'chorus', bars:8, dyn:1.14, variant:2, chords:[
    'Bbmaj7','C7','Am7','Dm7', 'Bbmaj7','C7','Fmaj7','C7'] },

  { key:'bridge', bars:8, dyn:0.92, chords:[
    'Dm7','Dm7/C','Bbmaj7','Bbm7', 'Gm7','A7','Dm7','D7'] },

  // CHORUS 3 (variant 3): everything, plus octave-doubled lead, 3-part
  // harmony, 16th piano with octaves, countermelody, extra percussion.
  { key:'chorusG', bars:12, dyn:1.18, variant:3, chords:[
    'Cmaj7','D7','Bm7','Em7', 'Cmaj7','D7','Gmaj7','D7',
    'Cmaj7','D7','Gmaj7','Gmaj7'] },

  { key:'outro', bars:6, dyn:0.90, chords:[
    'Gmaj7','F#7','Bm7','Am7 D7','Gmaj7','Gmaj7'] },
];

const bars = [];
for (const s of SECTIONS) {
  for (let i = 0; i < s.bars; i++) {
    const parts = s.chords[i].split(/\s+/);
    bars.push({
      sec: s.key, idx: i, dyn: s.dyn, isLast: i === s.bars - 1,
      variant: s.variant || 0,
      chords: parts.map(p => ({ sym: p, beats: 4 / parts.length })),
    });
  }
}
const TOTAL_BARS = bars.length;
const barTick = (b) => b * 4 * 480;
const beatTick = (b, beat) => barTick(b) + Math.round(beat * 480);

// ---- groove feel: light 16th swing + humanization ----
// SWING 0.5 = dead straight. 0.54 gives the lazy push city pop has without
// turning into a shuffle.
const SWING = 0.52;
const sPos = (step) => Math.floor(step / 2) * 0.5 + (step % 2 ? SWING * 0.5 : 0);
const sTick = (bar, step) => barTick(bar) + Math.round(sPos(step) * 480);

let humSeed = 20260928;
function hum(amt) {                       // 1.0 +/- amt, deterministic
  humSeed = (humSeed * 1103515245 + 12345) & 0x7fffffff;
  return 1 + (humSeed / 0x3fffffff - 1) * amt;
}

// ============================ TRACKS ============================
// channel, name, GM program, pan  (pan layout preserved from v1)
// Strum patch: 25 = GM #26 Acoustic Guitar (steel), 24 = GM #25 (nylon, darker).
// Overridable so I can A/B the two without editing the file.
const STRUM_PROG = Number(process.env.SP_STRUM_PROG ?? 25);
const T = {
  lead:   new Track('Lead (vocal guide)', 0, 11, 64),   // GM #12 Vibraphone. Was GM #81
                                                        // Lead 2 sawtooth — its 14% of
                                                        // energy above 2 kHz read as BRASS
                                                        // and the user rejected it.
                                                        // was 81 = GM #82 CALLIOPE
                                                        // (a steam-organ!) — that was
                                                        // the "comical brass"
  bass:   new Track('Bass',               1, 33, 64),
  ep:     new Track('E.Piano',            2,  4, 46),
  piano:  new Track('Ac.Piano',           3,  0, 82),
  gtrL:   new Track('Guitar L',           4, 27, 30),
  gtrR:   new Track('Guitar R',           5, 27, 98),
  acgtr:  new Track('Ac.Gtr',            14, 25, 26),   // steel-string acoustic, LEFT
  // Was 'E.Gtr Lead' (GM #28 electric, up to C7). The user picked it out by ear
  // as "scattered high plucks" and asked for a low, barely-there acoustic strum
  // instead. Register now sits around G3 and the part is deliberately sparse.
  strum:  new Track('Ac.Gtr Strum',      15, STRUM_PROG, 72),
  strL:   new Track('Strings L',          6, 48,  4),
  strR:   new Track('Strings R',          7, 48,124),
  brass:  new Track('Synth Pad',           8, 89, 64),   // was Synth Brass — the
                                                          // single most "80s" marker
  drums:  new Track('Drums',              9, -1, 64),
  harm:   new Track('Harmony Vox',       10, 53, 92),
  shaker: new Track('Shaker',            11, -1, 86),
  tamb:   new Track('Tambourine',        12, -1, 38),
  conga:  new Track('Congas',            13, -1, 58),
};

// ============================ DRUM KIT ============================
const K=36, SN=38, CL=39, CH=42, PH=44, OH=46, CR=49, RD=51, TAMB=54, SHA=82;
const TOM = { lo:45, mid:47, hi:50 };
const A16 = [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15];

// 16-step grids. k=kick s=snare h=closed hat o=open hat g=ghost r=ride cl=clap
// Aimed at MODERN j-pop-leaning city pop, not 80s retro:
//   backbeat-driven with claps, 32nd hat rolls, stop-time breaks, sparse verses
const G8  = [0,2,4,6,8,10,12,14];
const G16 = A16;

const GROOVE = {
  none:  { k:[], s:[], h:[], o:[], g:[], cl:[], r:[] },
  hats:  { k:[], s:[], h:G16, o:[], g:[], cl:[], r:[] },
  light: { k:[0,8], s:[4,12], h:G8, o:[], g:[], cl:[], r:[] },

  // ---- VERSE : relaxed, lots of space for the topline
  v1: { k:[0,6,10],       s:[4,12], h:G16, g:[3,15],      cl:[], r:[] },
  v2: { k:[0,6,11,14],    s:[4,12], h:G16, g:[3,9], o:[14], cl:[], r:[] },
  v3: { k:[0,6,10],       s:[4,12], h:G8,  g:[3,7,9,15],  cl:[], r:[] },   // sparser
  v4: { k:[0,6,10,13],    s:[4,12], h:G16, g:[3,9,15],    cl:[], r:[2,6] },

  // ---- PRE : tighter, four-on-the-floor lift, claps creep in
  p1: { k:[0,4,8,12],       s:[4,12], h:G16, o:[14], g:[3,9], cl:[12], r:[] },
  p2: { k:[0,4,6,8,12,14],  s:[4,12], h:G16, o:[2,6,10,14], g:[3,9,11], cl:[4,12], r:[] },

  // ---- CHORUS : claps double the backbeat (the modern pop staple)
  c1: { k:[0,6,8,14],       s:[4,12], h:G16, o:[2,6,10,14], g:[3,9,11], cl:[4,12], r:[] },
  c2: { k:[0,3,6,8,11,14],  s:[4,12], h:G16, o:[2,6,10,14], g:[3,7,9,11], cl:[4,12], r:[] },
  c3: { k:[0,6,8,11,14],    s:[4,12], h:G16, o:[2,4,6,10,14], g:[3,9], cl:[4,12], r:[] },

  // ---- stop-time / breakdown: drums drop so the next hit lands
  brk: { k:[0], s:[], h:[0,2,4], o:[], g:[], cl:[], r:[] },
  stp: { k:[0], s:[], h:[], o:[], g:[], cl:[], r:[] },

  // ---- BRIDGE
  bA: { k:[0,10], s:[8],    h:[0,4,8,12], o:[6], g:[], cl:[], r:[] },   // half-time
  bB: { k:[0,6,8],          s:[4,12], h:G16, g:[3,9], cl:[], r:[] },
  bC: { k:[0,6,8,14],       s:[4,12], h:G16, o:[6,14], g:[3,9,11], cl:[12], r:[] },

  o1: { k:[0,6,10], s:[4,12], h:G16, o:[14], g:[], cl:[], r:[] },
  o2: { k:[0,8],    s:[4,12], h:G8,  o:[],   g:[], cl:[], r:[] },
  o3: { k:[], s:[], h:[0,4,8,12], o:[], g:[], cl:[], r:[] },
};

/** base grid per section */
function baseGroove(bar) {
  const b = bars[bar];
  switch (b.sec) {
    case 'intro':  return [GROOVE.none, GROOVE.hats, GROOVE.hats, GROOVE.light][b.idx];
    case 'verse':  return [GROOVE.v1, GROOVE.v2, GROOVE.v1, GROOVE.v3,
                           GROOVE.v1, GROOVE.v2, GROOVE.v4, GROOVE.v3][b.idx];
    case 'pre':    return [GROOVE.p1, GROOVE.p1, GROOVE.p2,
                           GROOVE.stp][b.idx];
    case 'chorus': return [GROOVE.c1, GROOVE.c2, GROOVE.c1, GROOVE.c3,
                           GROOVE.c1, GROOVE.c2, GROOVE.c3, GROOVE.c2][b.idx];
    case 'inter':  return [GROOVE.c2, GROOVE.c3, GROOVE.c1, GROOVE.brk][b.idx];
    case 'bridge': return [GROOVE.bA, GROOVE.bA, GROOVE.bA, GROOVE.bA,
                           GROOVE.bB, GROOVE.bB, GROOVE.bC, GROOVE.brk][b.idx];
    case 'chorusG':return [GROOVE.c2, GROOVE.c3, GROOVE.c1, GROOVE.c2,
                           GROOVE.c3, GROOVE.c1, GROOVE.c2, GROOVE.c3,
                           GROOVE.c1, GROOVE.c2, GROOVE.brk, GROOVE.c3][b.idx];
    case 'outro':  return [GROOVE.o1, GROOVE.o1, GROOVE.o2, GROOVE.o2,
                           GROOVE.o3, GROOVE.o3][b.idx];
    default: return GROOVE.v1;
  }
}

/** grooveFor = base grid + per-bar variation layered on top.
 *  These are the things that stop the kit sounding like a loop:
 *    (a) the syncopated kicks shift by a 16th on alternate bars
 *    (b) a half-time drop bar as a breath before the next section
 *    (c) ride texture instead of closed hat in the 2nd verse / 2nd chorus
 *    (d) kick drop-outs on the first half of every 8th bar
 */
function grooveFor(bar) {
  const b = bars[bar];
  let g = baseGroove(bar);
  if (!g || !g.h) return g;

  // (a) kick displacement — downbeat stays nailed, the off-kicks move
  const disp = bar % 4 === 1 ? 1 : bar % 4 === 3 ? -1 : 0;
  if (disp && g.k && g.k.length) {
    g = { ...g, k: g.k.map(s => (s === 0 || s === 8) ? s : Math.max(1, Math.min(15, s + disp))) };
  }

  // (b) half-time drop
  if ((b.sec === 'verse' && b.idx === 6) || (b.sec === 'pre' && b.idx === 1)) {
    return { k: [0, 10], s: [8], h: [0,4,8,12], o: [6], g: [], cl: [], r: [] };
  }

  // (c) ride texture
  if ((b.sec === 'verse' && b.dyn > 0.91 && b.idx < 4) ||
      (b.sec === 'chorus' && b.variant === 2 && b.idx < 4)) {
    g = { ...g, r: [0,2,4,6,8,10,12,14], h: (g.h || []).filter(s => s % 4 === 2) };
  }

  // (d) kick drop-out on the front half of bar 9 / 17 / 25 ...
  if (bar > 0 && bar % 8 === 1 && g.k) {
    g = { ...g, k: g.k.filter(s => s >= 4) };
  }

  return g;
}

/** 32nd hat roll into a downbeat — everywhere in modern j-pop */
function hatRoll(t, base, d, fromStep) {
  for (let i = 0; fromStep * 8 + i < 128; i++) {
    const tick = base + Math.round((fromStep + i * 0.125) * 480);
    if (tick >= base + 1920) break;
    t.note(tick, CH, 44, (50 + i * 2.4) * d * hum(0.12));
  }
}

/** flam: a quiet grace note ~26 ticks before the main hit */
function flam(t, tick, note, vel, d) {
  t.note(tick - 26, note, 56, Math.round(vel * 0.42 * d));
  t.note(tick, note, 110, Math.round(vel * d));
}

// --- fills: expanded vocabulary (7 kinds, chosen by position) ---
function fill(t, base, d, kind, bar) {
  const f = (step) => base + step * 120;
  switch (kind) {
    case 0:                                   // tom cascade
      t.note(f(12), TOM.hi, 110, 96*d);  t.note(f(13), TOM.mid, 110, 92*d);
      t.note(f(14), TOM.lo, 110, 96*d);  t.note(f(15), SN, 110, 100*d);
      break;
    case 1:                                   // rising snare 16ths
      for (let s = 8; s < 16; s++) t.note(f(s), SN, 66, (56 + s*4.5)*d);
      break;
    case 2:                                   // kick doubles + snare pickup
      t.note(f(10), K, 100, 104*d); t.note(f(12), K, 100, 104*d);
      t.note(f(13), SN, 90, 76*d);  t.note(f(14), SN, 90, 84*d);
      t.note(f(15), SN, 90, 96*d);
      break;
    case 3:                                   // FLAM cascade — snare drags
      flam(t, f(12), SN, 92, d);
      flam(t, f(13), TOM.hi, 88, d);
      flam(t, f(14), SN, 96, d);
      flam(t, f(15), TOM.mid, 94, d);
      break;
    case 4:                                   // hat roll into the downbeat
      for (let i = 0; i < 8; i++) t.note(f(12) + i * 60, CH, 40, (46 + i*5)*d);
      t.note(f(14), SN, 90, 84*d);
      t.note(f(15), TOM.lo, 100, 92*d);
      break;
    case 5:                                   // kick triplet + snare pickup
      t.note(f(12), K, 80, 106*d);
      t.note(f(12) + 80, K, 80, 100*d);
      t.note(f(12) + 160, K, 160, 102*d);
      t.note(f(14), SN, 80, 88*d);
      t.note(f(15), SN, 80, 100*d);
      break;
    default:                                  // ghost-led tom run
      t.note(f(11), SN, 80, 44*d);  t.note(f(12), TOM.hi, 110, 90*d);
      t.note(f(13), TOM.mid, 110, 88*d); t.note(f(14), SN, 110, 98*d);
      t.note(f(15), TOM.lo, 110, 92*d);
      break;
  }
}

function renderDrums() {
  const t = T.drums;
  for (let bar = 0; bar < TOTAL_BARS; bar++) {
    const b = bars[bar], g = grooveFor(bar), d = b.dyn;
    const base = barTick(bar);
    const entering = (sec) => bars[bar - 1] && bars[bar - 1].sec !== sec && b.sec === sec;

    if (entering('chorus'))  t.note(base, CR, 480, 112);
    if (entering('chorusG')) t.note(base, CR, 480, 120);
    if (b.sec === 'inter' && b.idx === 0) t.note(base, CR, 480, 106);
    if (b.sec === 'bridge' && b.idx === 5) t.note(base, CR, 480, 104);
    if (b.sec === 'outro' && b.idx === 0) t.note(base, CR, 480, 96);
    // chorus 3 gets extra crashes so the final repeat feels biggest
    if (b.variant >= 3 && (b.idx === 4 || b.idx === 8)) t.note(base, CR, 480, 108);

    for (const s of (g.k  || [])) t.note(base + s*120, K, 110, (s === 0 ? 114 : 100) * d * hum(0.06));
    (g.s || []).forEach((s, i) => {
      const tick = base + s * 120;
      // flam on the first backbeat of a section — a humanising grace note
      if (i === 0 && b.idx === 0 && b.sec !== 'intro') flam(t, tick, SN, 104, d);
      else t.note(tick, SN, 110, 104 * d * hum(0.07));
    });
    for (const s of (g.g  || [])) t.note(base + s*120, SN, 84, 30 * d * hum(0.30));
    for (const s of (g.cl || [])) t.note(base + s*120, CL, 80, 96 * d * hum(0.06));
    for (const s of (g.h  || [])) {
      const v = s % 4 === 0 ? 86 : s % 4 === 2 ? 66 : 50;
      t.note(sTick(bar, s), CH, 76, v * d * hum(0.14));
    }
    for (const s of (g.o  || [])) t.note(base + s*120, OH, 210, 78 * d * hum(0.08));
    for (const s of (g.r  || [])) t.note(base + s*120, RD, 200, 70 * d * hum(0.09));

    const quiet = ['stp','brk'].includes(g === GROOVE.stp ? 'stp' : g === GROOVE.brk ? 'brk' : '');
    if (!quiet && bar < TOTAL_BARS - 1) {
      // 32nd hat roll on the last beat of every 4-bar phrase
      if (bar % 4 === 3 && b.sec !== 'intro' && b.sec !== 'outro' && !b.isLast) {
        hatRoll(t, base, d, 12);
      }
      if (b.isLast) fill(t, base, d, 3, bar);                              // section end: flams
      else if (bar % 8 === 7) fill(t, base, d, Math.floor(bar / 8) % 4, bar);
      else if (bar % 4 === 3) fill(t, base, d, 4 + (Math.floor(bar / 4) % 2), bar);  // mini-fill
    }
  }
}

// ============================ PERCUSSION ============================
function renderPerc() {
  for (let bar = 0; bar < TOTAL_BARS; bar++) {
    const b = bars[bar], base = barTick(bar), d = b.dyn;
    const on = !(b.sec === 'intro' && b.idx < 2) &&
               !(b.sec === 'bridge' && b.idx < 3) &&
               !(b.sec === 'outro' && b.idx >= 4);
    if (!on) continue;
    for (let s = 0; s < 16; s++)
      T.shaker.note(sTick(bar, s), SHA, 56, (s % 4 === 0 ? 76 : 54) * d * hum(0.16));
    T.tamb.note(base + 4*120, TAMB, 130, 80*d);
    T.tamb.note(base + 12*120, TAMB, 130, 80*d);
    // off-beat tambourine push into the next bar
    if (b.sec === 'chorus' || b.sec === 'chorusG' || b.sec === 'pre')
      T.tamb.note(base + 14*120, TAMB, 110, 66*d);
    if (['chorus','inter','chorusG'].includes(b.sec)) {
      // REMOVED the conga pairs that were here (steps 6-7 and 13-14). A sine
      // with a pitch envelope in adjacent pairs reads as retro electronic toms
      // — the user identified it as the 云宫迅音 sound. Replaced with tight
      // closed-hat 16th accents, which is what modern j-pop actually does.
      for (const s of [6, 7, 13, 14]) {
        T.drums.note(base + s * 120, CH, 46, 60 * d * hum(0.10));
      }
    }
  }
}

// ============================ LAYER MAP ============================
// which instruments are active — this is where the dynamic ARC lives
function layers(bar) {
  const b = bars[bar], k = b.sec, i = b.idx;
  const L = { bass:0, ep:0, pno:0, gtrL:0, gtrR:0, str:0, brass:0, lead:0, harm:0 };
  const set = (o) => Object.assign(L, o);
  switch (k) {
    case 'intro':
      if (i < 2)      set({ ep:1, str:0.6 });
      else            set({ bass:1, ep:1, gtrL:1, str:0.8, lead:1 });
      break;
    case 'verse':
      // NO pad/brass in the verse any more — the user found it comical there.
      // The verse is carried by EP + piano + guitar, like the reference tracks.
      if (b.dyn > 0.91) set({ bass:1, ep:1, pno:1, gtrL:1, gtrR:1, str:0.75, lead:1 });
      else              set({ bass:1, ep:1, pno:1, gtrR:1, str:0.55, lead:1 });
      break;
    case 'pre':
      set({ bass:1, ep:1, gtrL:1, gtrR:1, str:1, brass:1, lead:1 });
      break;
    case 'chorus':
      // orchestration arc across the three choruses
      if (b.variant >= 3)       set({ bass:1, ep:1, pno:1, gtrL:1, gtrR:1, str:1.15, brass:1, lead:1, harm:1 });
      else if (b.variant === 2) set({ bass:1, ep:1, pno:1, gtrL:1, gtrR:1, str:1,    brass:1, lead:1, harm:1 });
      else                      set({ bass:1, ep:1, pno:1, gtrR:1, str:0, brass:0.8, lead:1, harm:0 });
      break;
    case 'inter':
      set({ bass:1, ep:1, pno:1, gtrL:1, gtrR:1, str:1, brass:1, lead:1 });
      break;
    case 'bridge':
      // strip to nothing, then rebuild
      if (i < 2)      set({ bass:1, ep:1, pno:1, str:1.2, lead:1 });
      else if (i < 4) set({ bass:1, ep:1, pno:1, str:1.3, brass:0.8, lead:1 });
      else            set({ bass:1, ep:1, pno:1, gtrR:1, str:1.2, brass:1, lead:1 });
      break;
    case 'chorusG':
      set({ bass:1, ep:1, pno:1, gtrL:1, gtrR:1, str:1.15, brass:1, lead:1, harm:1 });
      break;
    case 'outro':
      if (i < 4) set({ bass:1, ep:1, pno:1, str:1, lead:1 });
      else       set({ ep:1, str:0.7, lead:1 });
      break;
  }
  return L;
}

// ============================ BASS ============================
// chord tones for a bass line
function ct(sym, oct = 2) {
  const c = parse(sym);
  const iv = IV[c.quality] || IV.maj7;
  const r = bassPitch(sym, oct);
  return { r, third: r + iv[1], fifth: r + (iv[2] !== undefined ? iv[2] : 7), oct: r + 12 };
}

// VERSE: flowing arpeggiated line through the chord tones, syncopated, with
// a chromatic approach that pushes into the next bar. Two alternating
// patterns so it breathes over a 2-bar phrase.
const VLINE_A = [
  [0.00,'r',0.80],[0.75,'fifth',0.45],[1.50,'oct',0.55],[2.00,'r',0.55],
  [2.75,'third',0.50],[3.25,'fifth',0.45],[3.75,'appr',0.45],
];
const VLINE_B = [
  [0.00,'r',0.50],[0.50,'third',0.45],[1.00,'fifth',0.45],[1.50,'oct',0.60],
  [2.25,'fifth',0.45],[2.75,'third',0.45],[3.25,'r',0.45],[3.75,'appr',0.50],
];

function renderBass() {
  const t = T.bass;
  for (let bar = 0; bar < TOTAL_BARS; bar++) {
    const b = bars[bar];
    if (!layers(bar).bass) continue;
    const d = b.dyn;
    const verse = (b.sec === 'verse' || b.sec === 'bridge');
    let cur = 0;
    for (let ci = 0; ci < b.chords.length; ci++) {
      const ch = b.chords[ci];
      const T3 = ct(ch.sym, 2);
      const nextSym = (ci + 1 < b.chords.length)
        ? b.chords[ci + 1].sym
        : bars[Math.min(bar + 1, TOTAL_BARS - 1)].chords[0].sym;
      const nr = bassPitch(nextSym, 2);
      const appr = nr + (nr > T3.r ? -1 : 1);          // chromatic approach
      const bt = (x) => beatTick(bar, cur + x);

      if (verse) {
        const line = (bar % 2 === 0) ? VLINE_A : VLINE_B;
        for (const [beat, which, dur] of line) {
          if (beat >= ch.beats) continue;
          const p = which === 'appr' ? appr : T3[which];
          t.note(bt(beat), p, B(dur), (which === 'r' ? 108 : 94) * d);
        }
      } else if (ch.beats >= 4) {
        const dense = ['chorus','chorusG','pre','inter'].includes(b.sec);
        if (dense) {
          t.note(bt(0),    T3.r,     200, 108*d);
          t.note(bt(0.75), T3.r,      90,  78*d);
          t.note(bt(1.5),  T3.fifth, 130,  92*d);
          t.note(bt(2),    T3.r,     200, 100*d);
          t.note(bt(3),    T3.oct,   130,  94*d);
          t.note(bt(3.5),  appr,     110,  90*d);
        } else {
          t.note(bt(0),    T3.r,     260, 106*d);
          t.note(bt(1.5),  T3.oct,   130,  88*d);
          t.note(bt(2),    T3.r,     180,  96*d);
          t.note(bt(2.75), T3.fifth,  90,  76*d);
          t.note(bt(3.5),  appr,     110,  88*d);
        }
      } else {
        t.note(bt(0),   T3.r,     200, 104*d);
        t.note(bt(1.0), T3.fifth, 180,  92*d);
        t.note(bt(1.5), appr,     110,  88*d);
      }
      cur += ch.beats;
    }
  }
}

// ============================ E.PIANO ============================
// 2-bar comping phrases (not 1 bar repeated) + anticipation of the
// next chord on the "&" of 4 — the signature city-pop push.
function renderEP() {
  const t = T.ep;
  const PHRASE = [
    [[0,0.45,84],[0.75,0.35,62],[1.5,0.45,78],[2.25,0.35,60],[2.5,0.45,80],[3.5,0.40,70]],
    [[0,0.45,82],[0.75,0.35,60],[1.5,0.45,76],[2.25,0.35,58],[3.0,0.45,78],[3.5,0.40,68]],
    [[0,0.45,80],[1.25,0.35,60],[1.5,0.45,78],[2.5,0.45,82],[3.5,0.35,62]],
    [[0,0.45,84],[0.75,0.35,62],[1.5,0.45,76],[2.5,0.45,80],[3.0,0.40,72],[3.75,0.30,64]],
  ];
  for (let bar = 0; bar < TOTAL_BARS; bar++) {
    const b = bars[bar];
    if (!layers(bar).ep) continue;
    const d = b.dyn, sparse = (b.sec === 'bridge' && b.idx < 2) || (b.sec === 'intro' && b.idx < 2);
    const pat = PHRASE[bar % PHRASE.length];
    let cur = 0;
    for (const ch of b.chords) {
      const v = top4(ch.sym, 67);
      if (sparse) { t.chord(beatTick(bar, cur), v, B(ch.beats) - 20, 62*d); cur += ch.beats; continue; }
      for (const [beat, dur, vel] of pat) {
        if (beat >= ch.beats) continue;
        t.chord(beatTick(bar, cur + beat), v, B(dur), vel * d);
      }
      // anticipation: push the NEXT chord on the last 8th of this bar
      if (bar < TOTAL_BARS - 1 && cur + ch.beats >= 4) {
        const nxt = bars[bar + 1].chords[0].sym;
        t.chord(beatTick(bar, 3.5), top4(nxt, 67), B(0.4), 72 * d);
      }
      cur += ch.beats;
    }
  }
}

// ============================ AC. PIANO ============================
// The piano is now the DRIVER. Two problems before: the notes were 0.3-0.45
// beats long (staccato — disconnected) and they were block chords (no runs,
// no motion). Now it rolls arpeggios with a left hand, and adds 16th
// flourishes at phrase ends. Overlapping note lengths = legato.
const PNO = {
  intro:   { step:0.50, idx:[0,1,2,3,2,1],     lh:[0,2],     vel:68, run:false },
  verse:   { step:0.50, idx:[0,1,2,3,2,1,0,1], lh:[0,2],     vel:80, run:false },
  pre:     { step:0.50, idx:[0,1,2,3,3,2,1,2], lh:[0,2],     vel:88, run:true  },
  chorus:  { step:0.25, idx:[0,1,2,3,2,3,1,2], lh:[0,1,2,3], vel:92, run:true  },
  // the three chorus variants differ in density so the repeats grow
  chorus1: { step:0.50, idx:[0,1,2,3,2,1,0,1], lh:[0,2],     vel:86, run:false },
  chorus2: { step:0.25, idx:[0,1,2,3,2,3,1,2], lh:[0,1,2,3], vel:92, run:true  },
  chorus3: { step:0.25, idx:[0,2,1,3,3,1,2,0], lh:[0,1,2,3], vel:96, run:true, oct:true },
  inter:   { step:0.25, idx:[0,1,2,3,3,2,1,0], lh:[0,1,2,3], vel:92, run:true  },
  bridge:  { step:0.50, idx:[0,1,2,3,2,1],     lh:[0,2],     vel:76, run:false },
  chorusG: { step:0.25, idx:[0,1,2,3,2,3,1,2], lh:[0,1,2,3], vel:96, run:true  },
  outro:   { step:1.00, idx:[0,2,1,3],         lh:[0],       vel:72, run:false },
};

function renderPiano() {
  const t = T.piano;
  for (let bar = 0; bar < TOTAL_BARS; bar++) {
    const b = bars[bar];
    if (!layers(bar).pno) continue;
    const d = b.dyn;
    let cfg = PNO[b.sec] || PNO.verse;
    if (b.sec === 'chorus') cfg = b.variant === 1 ? PNO.chorus1 : b.variant === 2 ? PNO.chorus2 : PNO.chorus3;
    if (b.sec === 'chorusG') cfg = PNO.chorus3;
    let cur = 0;
    for (const ch of b.chords) {
      const hi = voicing(ch.sym, 73).slice(-4);        // was 80 — user wants it lower
      const lo = bassPitch(ch.sym, 2);                 // was octave 3 — fuller left hand
      const perBeat = Math.round(0.5 / cfg.step);
      const n = Math.round(ch.beats / cfg.step);

      for (let i = 0; i < n; i++) {
        const pitch = hi[cfg.idx[i % cfg.idx.length] % hi.length];
        const accent = (i % perBeat === 0);
        t.note(beatTick(bar, cur + i * cfg.step), pitch,
               B(cfg.step * 0.92),                                  // just touches the next note
               cfg.vel * d * (accent ? 1.0 : 0.76) * hum(0.06));
        if (cfg.oct && accent) {                                // chorus 3: octave doubling
          t.note(beatTick(bar, cur + i * cfg.step), pitch - 12,
                 B(cfg.step * 0.90), cfg.vel * 0.42 * d);
        }
      }
      for (const lb of cfg.lh) {
        if (lb >= ch.beats) continue;
        t.note(beatTick(bar, cur + lb), lo,      B(0.85), cfg.vel * 0.80 * d);
        t.note(beatTick(bar, cur + lb), lo + 12, B(0.70), cfg.vel * 0.52 * d);
      }
      // 16th flourish on the last beat of every 4-bar phrase — the "华丽" bit
      if (cfg.run && bar % 4 === 3 && ch.beats >= 4) {
        for (let i = 0; i < 8; i++) {
          const p = hi[i % hi.length] + (i >= 4 ? 12 : 0);
          t.note(beatTick(bar, cur + 3.0 + i * 0.125), p, B(0.17),
                 (68 + i * 5) * d * hum(0.05));
        }
      }
      cur += ch.beats;
    }
  }
}

// ============================ GUITARS ============================
// L: 16th muted cutting. Accents on the "&" of 2 and 4 (per the guide),
//    rootless 3-note voicings, 9th/13th on top.
function renderGtrL() {
  const t = T.gtrL;
  const ACCENT = new Set([2, 6, 10, 14]);
  for (let bar = 0; bar < TOTAL_BARS; bar++) {
    const b = bars[bar];
    if (!layers(bar).gtrL) continue;
    const d = b.dyn;
    let cur = 0;
    for (const ch of b.chords) {
      // In the VERSE the guitar arpeggiates instead of doing 16th cutting —
      // the cutting made the verse feel 稀碎 (fragmented). Chorus keeps it.
      if (b.sec === 'verse' || b.sec === 'bridge' || b.sec === 'outro') {
        const vv = voicing(ch.sym, 64, true).slice(-3);
        const idx = [0,1,2,1];
        const n = Math.round(ch.beats * 2);
        for (let i = 0; i < n; i++) {
          t.note(beatTick(bar, cur + i * 0.5), vAt(vv, idx[i % idx.length]),
                 B(0.55), 70 * d * hum(0.10));
        }
        cur += ch.beats;
        continue;
      }
      const v = voicing(ch.sym, 62, true).slice(-3);       // rootless
      const steps = Math.round(ch.beats * 4);
      for (let s = 0; s < steps; s++) {
        const g = (cur * 4 + s) % 16;
        if (!ACCENT.has(g) && (s % 2 === 1)) continue;     // thin out the "e"/"a"
        const vel = (ACCENT.has(g) ? 86 : s % 4 === 0 ? 76 : 50) * d;
        t.chord(beatTick(bar, cur + s * 0.25), v, ACCENT.has(g) ? B(0.22) : B(0.13), vel);
      }
      cur += ch.beats;
    }
  }
}

// R: DRIVEN ELECTRIC — Yorushika-style. Power chords on the off-beats for
// drive, single-note riffs in the gaps, full-band 8ths in the chorus.
function renderGtrR() {
  const t = T.gtrR;
  for (let bar = 0; bar < TOTAL_BARS; bar++) {
    const b = bars[bar];
    if (!layers(bar).gtrR) continue;
    const d = b.dyn;
    const chord = b.chords[0].sym;
    const root = bassPitch(chord, 2) + 24;        // guitar register
    const P5 = [root, root + 7];                  // power chord
    const P5O = [root, root + 7, root + 12];
    const v = voicing(chord, 72);
    const bt = (x) => beatTick(bar, x);

    if (b.sec === 'pre' && b.isLast) {
      // riser: ascending 16ths over beats 3-4 with a crescendo
      const run = ['F4','G4','A4','Bb4','C5','D5','E5','F5'];
      run.forEach((p, i) => t.note(barTick(bar) + (8 + i) * 120, n(p), 112, (58 + i * 8) * d));
      continue;
    }

    if (b.sec === 'verse') {
      // sparse legato answers, then one power chord to push the bar
      t.note(bt(1.75), vAt(v, 2), B(0.55), 72 * d);
      t.note(bt(2.5),  vAt(v, 3), B(0.55), 68 * d);
      t.chord(bt(3.5), P5, B(0.60), 84 * d);
    } else if (b.sec === 'bridge' && b.idx < 4) {
      t.chord(bt(0), P5O, B(2.0), 70 * d);
      t.chord(bt(2.5), P5, B(0.8), 64 * d);
    } else {
      const vnum = b.variant || 2;
      const div = vnum >= 3 ? 16 : 8;               // chorus 3 pushes to 16ths
      const step = 4 / div;
      for (let e = 0; e < div; e++) {
        const strong = (e % (div / 4) === div / 8); // the "&"s
        t.chord(bt(e * step), e === 0 ? P5O : P5, B(step * 0.9),
                (strong ? 92 : 72) * d * hum(0.07));
      }
      // countermelody filling the vocal gaps — chorus 2 onward only
      if (vnum >= 2 && bar % 2 === 1) {
        t.note(bt(1.75), vAt(v, 2), B(0.30), 78 * d);
        t.note(bt(2.5),  vAt(v, 3), B(0.30), 76 * d);
        t.note(bt(3.25), vAt(v, 3) + 2, B(0.40), 80 * d);
      }
      // riff at the end of every 4-bar phrase
      if (bar % 4 === 3) {
        t.note(bt(3.0), vAt(v, 2), B(0.30), 86 * d);
        t.note(bt(3.25), vAt(v, 3), B(0.30), 84 * d);
        t.note(bt(3.5), vAt(v, 2) + 12, B(0.45), 90 * d);
      }
    }
  }
}

// ============================ ACOUSTIC GUITAR ============================
// The reference project runs ~12 guitar tracks; this is the "Martin" role —
// strummed / arpeggiated acoustic, panned left. I had no acoustic at all.
function renderAcGtr() {
  const t = T.acgtr;
  for (let bar = 0; bar < TOTAL_BARS; bar++) {
    const b = bars[bar];
    const on = ['verse','pre','chorus','chorusG','inter','bridge','outro'].includes(b.sec)
            && !(b.sec === 'bridge' && b.idx < 2)
            && !(b.sec === 'intro');
    if (!on) continue;
    const d = b.dyn;
    const drive = ['chorus','chorusG','pre','inter'].includes(b.sec);
    let cur = 0;
    for (const ch of b.chords) {
      const v = voicing(ch.sym, 62).slice(-4);
      if (drive) {
        // driving 8th-note strums with a small upward roll
        for (let e = 0; e < ch.beats * 2; e++) {
          const tick = beatTick(bar, cur + e * 0.5);
          const n = Math.min((e % 2 === 0) ? 4 : 3, v.length);   // clamp: Bb/C has 3 tones
          for (let i = 0; i < n; i++) {
            t.note(tick + i * 10, v[v.length - n + i], B(0.40),
                   (76 - i * 6) * d * hum(0.09));
          }
        }
      } else {
        // rolling arpeggio, fingerpicked
        const idx = [0,1,2,3,2,1];
        const n = Math.round(ch.beats * 2);
        for (let i = 0; i < n; i++) {
          t.note(beatTick(bar, cur + i * 0.5), vAt(v, idx[i % idx.length]),
                 B(0.55), 72 * d * hum(0.12));
        }
      }
      cur += ch.beats;
    }
  }
}

// ============================ ACOUSTIC STRUM ============================
// Replaces the old second-electric "answer" line. Two deliberate choices:
//   * register centred on 57 (A3), not 74 — the old part ran E5..C7 and was the
//     single brightest thing in the mix (55% of its energy above 2 kHz).
//   * sparse on purpose. One soft strum per bar in the verse, off-beats in the
//     chorus. It should be felt more than heard.
function renderStrum() {
  const t = T.strum;
  for (let bar = 0; bar < TOTAL_BARS; bar++) {
    const b = bars[bar];
    if (!['verse', 'pre', 'chorus', 'chorusG', 'bridge', 'outro'].includes(b.sec)) continue;
    if (b.sec === 'bridge' && b.idx < 2) continue;

    const d = b.dyn;
    let cur = 0;
    for (const ch of b.chords) {
      const v = voicing(ch.sym, 57).slice(-4);      // top 4 voices around A3
      const offs =
        (b.sec === 'chorus' || b.sec === 'chorusG') ? [0.5, 1.5, 2.5, 3.5]
        : (b.sec === 'pre') ? [1.5, 3.5]
        : (b.sec === 'outro') ? [0.5]
        : [1.5];                                    // verse / bridge: one strum
      offs.forEach((off, i) => {
        if (off >= ch.beats) return;
        const base = beatTick(bar, cur + off);
        const up = i % 2 === 1;                     // alternate down / up
        const n = Math.min(v.length, up ? 3 : 4);
        for (let k = 0; k < n; k++) {
          const j = up ? (v.length - 1 - k) : (v.length - n + k);
          const delay = k * (up ? 9 : 12);          // ~10-14 ms between strings
          t.note(base + delay, vAt(v, j), B(0.75),
                 ((up ? 34 : 42) + k * 2) * d * hum(0.10));
        }
      });
      cur += ch.beats;
    }
  }
}

// ============================ STRINGS ============================
function renderStrings() {
  for (let bar = 0; bar < TOTAL_BARS; bar++) {
    const g = layers(bar).str;
    if (!g) continue;
    const d = b_dyn(bar);
    const base = barTick(bar);
    let cur = 0;
    for (const ch of bars[bar].chords) {
      const v = voicing(ch.sym, 64);
      const low = v.slice(0, 3).map(x => x + 12), high = v.slice(-3);
      const vol = 62 * g * d;
      T.strL.chord(beatTick(bar, cur), low,  B(ch.beats) - 20, vol);
      T.strR.chord(beatTick(bar, cur), high, B(ch.beats) - 20, vol * 0.92);
      cur += ch.beats;
    }
  }
}
const b_dyn = (bar) => bars[bar].dyn;

// ============================ SYNTH BRASS ============================
// THE FIX for "background trumpet too quiet": the verse now gets a real
// sustained brass pad, and it is mixed louder.
function renderBrass() {
  const t = T.brass;
  for (let bar = 0; bar < TOTAL_BARS; bar++) {
    const g = layers(bar).brass;
    if (!g) continue;
    const b = bars[bar], d = b.dyn, base = barTick(bar);
    let cur = 0;
    for (const ch of b.chords) {
      const v = voicing(ch.sym, 70).slice(-4);
      // now a SOFT PAD, sustained everywhere — no more brass stabs
      const vp = (b.sec === 'verse' || b.sec === 'intro')
        ? voicing(ch.sym, 76).slice(-4) : v;
      t.chord(beatTick(bar, cur), vp, B(ch.beats) - 24,
              (b.sec === 'verse' ? 100 : 86) * g * d);
      cur += ch.beats;
    }
  }
}

// ============================ HARMONY VOX ============================
function renderHarmony(leadEvents) {
  for (const e of leadEvents) {
    if (!e.harm) continue;
    const vnum = e.variant || 0;
    // chorus 2: 3rd + 6th.  chorus 3: adds an octave on top.
    T.harm.note(e.tick, e.pitch + (e.pitch < 69 ? 3 : -3), e.dur - 6, Math.round(e.vel * 0.62));
    if (vnum >= 2) T.harm.note(e.tick, e.pitch + (e.pitch < 69 ? -9 : -8), e.dur - 6, Math.round(e.vel * 0.44));
    if (vnum >= 3) T.harm.note(e.tick, e.pitch + 12, e.dur - 6, Math.round(e.vel * 0.34));
  }
}

// ============================ LEAD MELODY ============================
// [barInSection, beat, pitch, durBeats]
const MELODY = {
  intro: [[2,0,'C5',1],[2,1,'D5',0.5],[2,1.5,'C5',0.5],[2,2,'A4',2],
          [3,0,'G4',1],[3,1,'A4',0.5],[3,1.5,'Bb4',0.5],[3,2,'C5',2]],

  // bars 0-3 unchanged; 4-7 rewritten for the new IVm / V-of-ii harmony
  // 16ths are reserved for the CHORUS. In the verse/pre they made the song feel
  // 稀碎 (fragmented), so these are 8ths and quarters with only a couple of
  // pickup 16ths at phrase ends.
  verse: [[0,0.00,'F4',0.50],[0,0.50,'F4',0.50],[0,1.00,'A4',0.50],[0,1.50,'C5',1.00],
          [0,2.50,'A4',0.50],[0,3.00,'G4',1.00],
          [1,0.00,'F4',1.00],[1,1.00,'A4',0.50],[1,1.50,'C5',0.50],[1,2.00,'D5',1.00],
          [1,3.00,'C5',0.50],[1,3.50,'A4',0.50],
          [2,0.00,'Bb4',0.50],[2,0.50,'C5',0.50],[2,1.00,'D5',0.50],[2,1.50,'F5',1.00],
          [2,2.50,'D5',0.50],[2,3.00,'C5',1.00],
          [3,0.00,'A4',1.50],[3,1.50,'C5',0.50],[3,2.00,'A4',1.00],[3,3.00,'F4',0.50],
          [3,3.50,'G4',0.50],
          [4,0.00,'D5',0.50],[4,0.50,'D5',0.50],[4,1.00,'F5',0.50],[4,1.50,'D5',0.50],
          [4,2.00,'C5',1.00],[4,3.00,'Bb4',0.50],[4,3.50,'C5',0.50],
          [5,0.00,'Db5',1.00],[5,1.00,'C5',0.50],[5,1.50,'Bb4',0.50],[5,2.00,'Ab4',1.00],
          [5,3.00,'Bb4',1.00],
          [6,0.00,'A4',0.50],[6,0.50,'C5',0.50],[6,1.00,'E5',0.50],[6,1.50,'D5',0.50],
          [6,2.00,'F#5',1.00],[6,3.00,'E5',1.00],
          [7,0.00,'D5',1.00],[7,1.00,'B4',0.50],[7,1.50,'G4',0.50],[7,2.00,'C5',1.50],
          [7,3.50,'E5',0.50]],

  // rewritten for the new descending-fifths chain Dm7 | G7 | C7 | Bb/C
  pre:   [[0,0.00,'A4',0.50],[0,0.50,'C5',0.50],[0,1.00,'D5',0.50],[0,1.50,'F5',1.00],
          [0,2.50,'E5',0.50],[0,3.00,'D5',1.00],
          [1,0.00,'B4',0.50],[1,0.50,'D5',0.50],[1,1.00,'F5',1.00],[1,2.00,'D5',0.50],
          [1,2.50,'B4',0.50],[1,3.00,'G4',1.00],
          [2,0.00,'C5',0.50],[2,0.50,'E5',0.50],[2,1.00,'G5',0.50],[2,1.50,'E5',1.00],
          [2,2.50,'C5',0.50],[2,3.00,'D5',1.00],
          [3,0.00,'F5',0.50],[3,0.50,'E5',0.50],[3,1.00,'D5',0.50],[3,1.50,'C5',0.50],
          [3,2.00,'E5',0.50],[3,2.50,'C5',1.50]],

  // SIMPLIFIED for catchiness. One rhythmic cell (1.5 + 0.5 + 1.75 beats)
  // repeated as a rising sequence F->G->A, then a held "breath" bar, then a
  // descent from the peak and a rising resolve. 20 events / 7 pitches
  // instead of the old 22 events with constant contour changes.
  // REWRITTEN against POP909 statistics (909 real pop songs, 307k melody notes):
  //   note lengths   ~42% 8ths, ~34% 16ths, ~9% dotted-8ths, ~7% quarters
  //   onsets         roughly even across the four 16ths (23/27/23/27)
  //   intervals      ~23% repeated pitch, ~36% stepwise 2nds
  //   range          median 18 semitones
  // My previous version was 100% on the 8th grid, 71% quarter-or-longer, and
  // repeated a pitch only 0.3% of the time — that is why it wasn't catchy.
  // Onsets are designed to land on ALL FOUR 16ths (target distribution
  // ~23/27/23/27 like real pop), not just the downbeat and the "&".
  chorus:[[0,0.25,'D5',0.25],[0,0.50,'D5',0.50],[0,1.00,'F5',0.25],[0,1.25,'E5',0.50],
          [0,1.75,'D5',0.25],[0,2.00,'F5',0.50],[0,2.75,'G5',0.25],[0,3.00,'F5',0.50],
          [0,3.50,'D5',0.50],
          [1,0.25,'A5',0.50],[1,0.75,'A5',0.25],[1,1.00,'G5',0.50],[1,1.50,'E5',0.25],
          [1,1.75,'G5',0.50],[1,2.25,'F5',0.25],[1,2.50,'E5',0.50],[1,3.25,'D5',0.25],
          [1,3.50,'C5',0.50],
          [2,0.00,'E5',0.50],[2,0.75,'A5',0.25],[2,1.00,'G5',0.25],[2,1.25,'E5',0.50],
          [2,1.75,'C5',0.25],[2,2.00,'D5',0.50],[2,2.50,'E5',0.25],[2,2.75,'E5',0.25],
          [2,3.00,'G5',1.00],
          [3,0.25,'F5',0.50],[3,0.75,'E5',0.25],[3,1.00,'D5',0.50],[3,1.50,'F5',0.25],
          [3,1.75,'A5',0.50],[3,2.25,'G5',0.25],[3,2.50,'F5',1.50],
          [4,0.25,'D5',0.25],[4,0.50,'D5',0.50],[4,1.00,'F5',0.50],[4,1.75,'Bb5',0.25],
          [4,2.00,'A5',0.50],[4,2.50,'G5',0.25],[4,2.75,'G5',0.25],[4,3.00,'F5',1.00],
          [5,0.00,'A5',0.25],[5,0.25,'G5',0.50],[5,0.75,'E5',0.25],[5,1.00,'C5',0.50],
          [5,1.50,'D5',0.25],[5,1.75,'E5',0.50],[5,2.50,'G5',0.25],[5,2.75,'A5',1.25],
          [6,0.25,'F5',0.25],[6,0.50,'F5',0.50],[6,1.00,'G5',0.25],[6,1.25,'A5',0.50],
          [6,1.75,'G5',0.25],[6,2.00,'F5',0.50],[6,2.50,'G5',0.25],[6,2.75,'A5',1.25],
          [7,0.00,'G5',0.50],[7,0.75,'E5',0.25],[7,1.00,'C5',0.50],[7,1.50,'D5',0.25],
          [7,1.75,'D5',0.50],[7,2.50,'D5',1.50]],

  // instrumental restatement of the chorus hook (bars 0-3 of the chorus)
  inter: [[0,0.0,'F5',1.5],[0,1.5,'D5',0.5],[0,2.0,'F5',1.75],
          [1,0.0,'G5',1.5],[1,1.5,'E5',0.5],[1,2.0,'G5',1.75],
          [2,0.0,'A5',1.5],[2,1.5,'E5',0.5],[2,2.0,'A5',1.75],
          [3,0.0,'F5',3.5]],

  bridge:[[0,0.0,'D5',2.0],[0,2.0,'F5',1.0],[0,3.0,'E5',1.0],
          [1,0.0,'D5',1.5],[1,1.5,'C5',0.5],[1,2.0,'Bb4',2.0],
          [2,0.0,'D5',1.0],[2,1.0,'F5',1.0],[2,2.0,'Bb5',2.0],
          [3,0.0,'Ab5',1.5],[3,1.5,'G5',0.5],[3,2.0,'F5',1.0],[3,3.0,'Eb5',1.0],
          [4,0.0,'D5',1.0],[4,1.0,'G5',1.0],[4,2.0,'Bb5',2.0],
          [5,0.0,'C#5',1.0],[5,1.0,'E5',1.0],[5,2.0,'G5',1.0],[5,3.0,'A5',1.0],
          [6,0.0,'F5',1.5],[6,1.5,'E5',0.5],[6,2.0,'D5',2.0],
          [7,0.0,'F#5',1.0],[7,1.0,'E5',1.0],[7,2.0,'D5',2.0]],

  // same hook transposed up a whole tone for the final chorus (truck-driver key change)
  chorusG:[[0,0.00,'E5',0.50],[0,0.50,'E5',0.25],[0,0.75,'E5',0.25],[0,1.00,'G5',0.50],
           [0,1.50,'F#5',0.50],[0,2.00,'E5',1.00],[0,3.00,'G5',0.50],[0,3.50,'A5',0.50],
           [1,0.00,'B5',0.50],[1,0.50,'A5',0.25],[1,0.75,'A5',0.25],[1,1.00,'F#5',1.00],
           [1,2.00,'A5',0.50],[1,2.50,'G5',0.50],[1,3.00,'F#5',1.00],
           [2,0.00,'F#5',0.50],[2,0.50,'F#5',0.25],[2,0.75,'B5',0.25],[2,1.00,'A5',0.50],
           [2,1.50,'F#5',0.50],[2,2.00,'D5',1.00],[2,3.00,'E5',0.50],[2,3.50,'F#5',0.50],
           [3,0.00,'G5',1.00],[3,1.00,'F#5',0.50],[3,1.50,'E5',0.50],[3,2.00,'G5',1.50],
           [3,3.50,'B5',0.50],
           [4,0.00,'E5',0.50],[4,0.50,'E5',0.25],[4,0.75,'E5',0.25],[4,1.00,'G5',1.00],
           [4,2.00,'C6',1.00],[4,3.00,'B5',0.50],[4,3.50,'A5',0.50],
           [5,0.00,'B5',0.50],[5,0.50,'A5',0.50],[5,1.00,'F#5',1.00],
           [5,2.00,'D5',1.00],[5,3.00,'E5',0.50],[5,3.50,'F#5',0.50],
           [6,0.00,'G5',1.50],[6,1.50,'A5',0.50],[6,2.00,'B5',1.00],[6,3.00,'A5',0.50],[6,3.50,'G5',0.50],
           [7,0.00,'A5',2.00],[7,2.00,'F#5',0.50],[7,2.50,'D5',0.50],[7,3.00,'E5',1.00],
           [8,0.00,'E5',0.50],[8,0.50,'E5',0.25],[8,0.75,'E5',0.25],[8,1.00,'G5',0.50],
           [8,1.50,'A5',1.00],[8,2.50,'B5',0.50],[8,3.00,'A5',1.00],
           [9,0.00,'B5',1.00],[9,1.00,'A5',0.50],[9,1.50,'F#5',0.50],[9,2.00,'D5',1.00],[9,3.00,'E5',1.00],
           [10,0.00,'G5',0.50],[10,0.50,'A5',0.25],[10,0.75,'B5',0.25],[10,1.00,'A5',1.00],
           [10,2.00,'G5',2.00],
           [11,0.00,'D5',1.00],[11,1.00,'E5',0.50],[11,1.50,'F#5',0.50],[11,2.00,'G5',2.00]],

  outro: [[0,0,'D5',1],[0,1,'G5',2],[0,3,'F#5',1],
          [1,0,'A5',3],[1,3,'G5',1],
          [2,0,'F#5',2],[2,2,'D5',2],
          [3,0,'E5',1],[3,1,'D5',1],[3,2,'B4',2],
          [4,0,'G4',1],[4,1,'B4',1],[4,2,'D5',2]],
};

function renderLead() {
  const out = [];
  for (let bar = 0; bar < TOTAL_BARS; bar++) {
    const b = bars[bar];
    if (!layers(bar).lead) continue;
    const mel = MELODY[b.sec];
    if (!mel) continue;
    for (const [bi, beat, pitch, dur] of mel) {
      if (bi !== b.idx) continue;
      const tick = beatTick(bar, beat), d = b.dyn;
      const vnum = b.variant || 0;
      const p = n(pitch);
      T.lead.note(tick, p, B(dur) - 12, 96 * d);
      // Octave doubling belongs to the HARMONY layer, not the melody line —
      // keeping it on the lead track was polluting melody statistics with
      // spurious ±12 intervals and an inflated range.
      if (vnum >= 2) T.harm.note(tick, p - 12, B(dur) - 14, 60 * d);
      if (vnum >= 3 && p <= 81) T.harm.note(tick, p + 12, B(dur) - 14, 52 * d);
      out.push({ tick, pitch: p, dur: B(dur), vel: 96 * d,
                 harm: !!layers(bar).harm, variant: vnum });
    }
  }
  return out;
}

// ============================ BUILD ============================
renderDrums();
renderPerc();
renderBass();
renderEP();
renderPiano();
renderGtrL();
renderStrings();
renderBrass();
const leadEvents = renderLead();
renderGtrR();
renderAcGtr();
renderStrum();
renderHarmony(leadEvents);

const trackList = [T.lead, T.bass, T.ep, T.piano, T.gtrL, T.gtrR, T.acgtr, T.strum,
                   T.strL, T.strR, T.brass, T.drums, T.harm, T.shaker, T.tamb];
                   // congas removed: the pairs read as retro electronic toms
const buf = writeFile(trackList, { bpm: 112 });
const midPath = path.join(OUT, 'midnight_signal.mid');
fs.writeFileSync(midPath, buf);

console.log(`wrote ${midPath}  ${buf.length} bytes`);
console.log(`bars = ${TOTAL_BARS}  (~${(TOTAL_BARS * 4 * 60 / 112).toFixed(1)}s)`);
console.log('--- sections ---');
let acc = 0;
for (const s of SECTIONS) { console.log(`  bar ${String(acc).padStart(3)} +${String(s.bars).padStart(2)}  ${s.key}`); acc += s.bars; }
console.log('--- chord map (proves the harmony actually moves) ---');
acc = 0;
for (const s of SECTIONS) {
  console.log(`  ${s.key}:`);
  for (let i = 0; i < s.bars; i += 4)
    console.log(`    ${String(acc + i).padStart(3)}: ${s.chords.slice(i, i + 4).map(c => c.padEnd(12)).join('')}`);
  acc += s.bars;
}
console.log('--- tracks ---');
for (const t of trackList) {
  const ons = t.events.filter(e => (e.data[0] & 0xf0) === 0x90).length;
  console.log(`  ch${String(t.channel).padStart(2)} ${t.name.padEnd(20)} notes=${String(ons).padStart(5)} pan=${t.pan}`);
}

module.exports = { trackList, SECTIONS, bars, TOTAL_BARS };
