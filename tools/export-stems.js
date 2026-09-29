'use strict';
// export-stems.js — write one solo MIDI per track so FluidSynth can render each
// through the GeneralUser GS soundfont (which has GM samples for EVERYTHING,
// not just piano). Pan is forced to centre: my mixer applies the real panning.
const fs = require('fs');
const path = require('path');
const { trackList } = require('./compose.js');
const { Track, writeFile } = require('./midi.js');

const OUT = require('./paths').STEMS;
fs.mkdirSync(OUT, { recursive: true });

const safe = (s) => s.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');
const list = [];

for (const t of trackList) {
  const solo = new Track(t.name, t.channel, t.program, 64);   // pan centred
  solo.events = t.events;
  const notes = t.events.filter(e => (e.data[0] & 0xf0) === 0x90).length;
  if (!notes) continue;
  const file = path.join(OUT, `${safe(t.name)}.mid`);
  fs.writeFileSync(file, writeFile([solo], { bpm: 112 }));
  list.push({ file, name: t.name, notes });
}

console.log(`wrote ${list.length} stem MIDI files to out/stems/`);
for (const s of list) console.log(`  ${s.name.padEnd(22)} ${s.notes} notes`);
