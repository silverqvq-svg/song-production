'use strict';
// lead-candidates.js — write ONE solo MIDI for the melody track, per candidate
// GM patch, so FluidSynth can render each and I can A/B the melody instrument.
//
//   GM number = MIDI program byte + 1   (the off-by-one that bit me before)
//
// Usage: node lead-candidates.js [group]     group = citypop | jpop | synth | other | all
//
const fs = require('fs');
const path = require('path');
const { trackList } = require('./compose.js');
const { Track, writeFile } = require('./midi.js');

const OUT = path.join(require('./paths').OUT, 'lead-cand2');
fs.mkdirSync(OUT, { recursive: true });

// [group, program byte, filename label, GM name]
const CANDS = [
  // ---- city-pop canon -------------------------------------------------
  ['citypop',  4, 'gm05_ElectricPiano1_rhodes',  'Electric Piano 1 (Rhodes)'],
  ['citypop',  7, 'gm08_Clavinet',               'Clavinet'],
  ['citypop', 11, 'gm12_Vibraphone',             'Vibraphone'],
  ['citypop', 73, 'gm74_Flute',                  'Flute'],
  ['citypop', 66, 'gm67_TenorSax',               'Tenor Sax'],
  // ---- J-pop strings / voice -----------------------------------------
  ['jpop',    40, 'gm41_Violin_solo',            'Violin (solo)'],
  ['jpop',    42, 'gm43_Cello_solo',             'Cello (solo)'],
  ['jpop',    52, 'gm53_ChoirAahs',              'Choir Aahs'],
  ['jpop',    54, 'gm55_SynthVoice',             'Synth Voice'],
  // ---- synth leads that are NOT brassy --------------------------------
  ['synth',   79, 'gm80_Lead1_square',           'Lead 1 (square)'],
  ['synth',   82, 'gm83_Lead4_chiff',            'Lead 4 (chiff)'],
  ['synth',   85, 'gm86_Lead7_fifths',           'Lead 7 (fifths)'],
  ['synth',   92, 'gm93_Pad5_bowed',             'Pad 5 (bowed)'],
  // ---- Japanese flavour / misc ----------------------------------------
  ['other',   24, 'gm25_Koto',                   'Koto'],
  ['other',   12, 'gm13_Marimba',                'Marimba'],
  ['other',   10, 'gm11_MusicBox',               'Music Box'],
  ['other',    6, 'gm07_Harpsichord',            'Harpsichord'],
  ['other',   21, 'gm22_Accordion',              'Accordion'],
  ['other',   56, 'gm57_Trumpet_REALbrass',      'Trumpet (real brass)'],
];

const want = (process.argv[2] || 'all').toLowerCase();
const picked = CANDS.filter((c) => want === 'all' || c[0] === want);
if (!picked.length) throw new Error(`no candidates in group "${want}"`);

const src = trackList.find((t) => t.name === 'Lead (vocal guide)');
if (!src) throw new Error('melody track not found');
const notes = src.events.filter((e) => (e.data[0] & 0xf0) === 0x90).length;

for (const [grp, prog, label, gm] of picked) {
  const t = new Track('Lead', src.channel, prog, 64);   // pan centred; mixer pans
  t.events = src.events;
  fs.writeFileSync(path.join(OUT, `${label}.mid`), writeFile([t], { bpm: 112 }));
  console.log(`${grp.padEnd(8)} ${label.padEnd(32)} GM #${String(prog + 1).padStart(3)}  ${gm}`);
}
console.log(`\nwrote ${picked.length} candidate MIDIs to out/lead-cand2/`);
