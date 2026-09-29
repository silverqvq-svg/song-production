'use strict';
// render-stems.js — turn the per-track solo MIDIs into audio with FluidSynth.
//
// This is the only file that touches the soundfonts, so swapping a soundfont
// means editing exactly one place.
//
//   node tools/compose.js
//   node tools/export-stems.js
//   node tools/render-stems.js      <- you are here
//   node tools/render.js
//
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { STEMS, ASSETS } = require('./paths');

// Which stems use the grand piano instead of the GM bank.
const GRAND_TRACKS = new Set(['Ac_Piano']);

// FluidSynth's own output gain — NOT the mix level. render.js re-derives every
// track's gain anyway, but these values must still stay put: its PLAN table was
// calibrated against stems rendered exactly this way, so changing them here
// silently shifts every track in the mix.
const GM_GAIN = 0.8;
const GRAND_GAIN = 0.9;

// Two stems were re-rendered by hand during development at a different FluidSynth
// gain, and their PLAN gains were calibrated against that. Recording the exception
// here is what makes the checked-in settings reproduce the released mix byte for
// byte (verified by MD5). Do not "tidy" this away without re-deriving those two
// PLAN gains and re-verifying.
const GAIN_OVERRIDE = { Lead_vocal_guide: 0.7, Ac_Gtr_Strum: 0.7 };

function findFluidSynth() {
  const local = [
    path.join(ASSETS, 'fluidsynth', 'bin', 'fluidsynth.exe'),   // portable Windows build
    path.join(ASSETS, 'fluidsynth', 'bin', 'fluidsynth'),
  ];
  for (const p of local) if (fs.existsSync(p)) return { exe: p, how: 'assets/' };

  // fall back to whatever is on PATH (apt install fluidsynth / brew install fluidsynth)
  const shell = process.platform === 'win32';
  const probe = spawnSync('fluidsynth', ['--version'], { stdio: 'ignore', shell });
  if (!probe.error) return { exe: 'fluidsynth', how: 'PATH' };
  return null;
}

const fluid = findFluidSynth();
if (!fluid) {
  console.error('FluidSynth not found.\n');
  console.error('  Either put a build in  assets/fluidsynth/bin/  or install it system-wide:');
  console.error('    Windows : https://github.com/FluidSynth/fluidsynth/releases  (win10 x64 zip)');
  console.error('    Debian  : sudo apt install fluidsynth');
  console.error('    macOS   : brew install fluidsynth\n');
  process.exit(1);
}
console.log(`FluidSynth: ${fluid.exe}  (${fluid.how})`);

const general = path.join(ASSETS, 'MuseScore_General.sf3');
if (!fs.existsSync(general)) {
  console.error(`\nSoundfont missing: ${general}\nRun:  node tools/fetch-assets.js`);
  process.exit(1);
}
const grand = path.join(ASSETS, 'salamander.sf2');
const hasGrand = fs.existsSync(grand);
console.log(`Grand piano: ${hasGrand ? path.basename(grand) : 'not present - piano falls back to the GM bank'}`);

if (!fs.existsSync(STEMS)) {
  console.error(`\nNo stems yet: ${STEMS}\nRun:  node tools/export-stems.js`);
  process.exit(1);
}

const mids = fs.readdirSync(STEMS).filter((f) => f.endsWith('.mid')).sort();
if (!mids.length) { console.error('No .mid files in out/stems/'); process.exit(1); }
console.log(`\nrendering ${mids.length} stems\n`);

let failed = 0;
for (const name of mids) {
  const mid = path.join(STEMS, name);
  const wav = mid.replace(/\.mid$/, '.wav');
  const base = name.replace(/\.mid$/, '');
  const useGrand = hasGrand && GRAND_TRACKS.has(base);
  const gain = GAIN_OVERRIDE[base] ?? (useGrand ? GRAND_GAIN : GM_GAIN);

  const args = [
    '-ni',
    '-F', wav,
    '-O', 's16',
    '-r', '44100',
    '-g', String(gain),
    '-R', '0', '-C', '0',
    useGrand ? grand : general,
    mid,
  ];
  // stdio 'ignore': FluidSynth writes a lot of noise and we do not need it.
  // Piping stdout would also break under restrictive sandboxes.
  const shell = process.platform === 'win32';
  const r = spawnSync(fluid.exe, args, { stdio: 'ignore', shell });
  if (r.status !== 0 || !fs.existsSync(wav)) {
    console.error(`  FAILED  ${base}`);
    failed++;
    continue;
  }
  const mb = (fs.statSync(wav).size / 1048576).toFixed(1);
  console.log(`  ${base.padEnd(24)} ${mb.padStart(6)} MB   ${useGrand ? 'grand' : 'gm'}  -g ${gain}`);
}

if (failed) { console.error(`\n${failed} stem(s) failed.`); process.exit(1); }
console.log('\nDone. Now run:  node tools/render.js');
