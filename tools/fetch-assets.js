'use strict';
// fetch-assets.js — download the third-party pieces the pipeline needs.
//
// NOTHING here is committed to git. Soundfonts are large and separately
// licensed; fetching them at their official sources keeps the repo small and
// keeps the licences with their owners.
//
//   node tools/fetch-assets.js            # required only (~40 MB)
//   node tools/fetch-assets.js --piano    # + instructions for the 1.2 GB grand
//
const fs = require('fs');
const path = require('path');
const { ASSETS } = require('./paths');

const WITH_PIANO = process.argv.includes('--piano');

// Verified 2026-09. FluidSynth's latest release was v2.6.1 when this was written.
const MUSESCORE = 'https://ftp.osuosl.org/pub/musescore/soundfont/MuseScore_General/MuseScore_General.sf3';
const FS_RELEASE = 'https://github.com/FluidSynth/fluidsynth/releases/latest';
const SALAMANDER = 'https://archive.org/details/SalamanderGrandPianoV3';
const SALAMANDER_SF2_HINT = 'https://musescore.org/en/comment/920174';

// MuseScore_General.sf3 — full GM bank, 38 MB, MIT licence (parts PD / CC0).
//   https://sources.debian.org/src/musescore-general-soundfont-small/0.2.1-1/debian/copyright/
// No copyright-holder name is needed for the GM bank, but NO soundfont is
// redistributed by this repo — only downloaded by this script.

async function download(url, dest) {
  if (fs.existsSync(dest)) {
    console.log(`  already there: ${path.basename(dest)}`);
    return;
  }
  console.log(`  downloading ${path.basename(dest)}`);
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);

  const total = Number(res.headers.get('content-length') || 0);
  const out = fs.createWriteStream(dest);
  let seen = 0, lastPct = -5;

  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    out.write(Buffer.from(value));
    seen += value.length;
    if (total) {
      const pct = Math.floor(seen / total * 100);
      if (pct >= lastPct + 5) { lastPct = pct; process.stdout.write(`    ${pct}%\r`); }
    }
  }
  await new Promise((r) => out.end(r));
  console.log(`    ${(seen / 1048576).toFixed(1)} MB done`);
}

(async () => {
  fs.mkdirSync(ASSETS, { recursive: true });

  console.log('\n[MuseScore_General.sf3]  MIT');
  await download(MUSESCORE, path.join(ASSETS, 'MuseScore_General.sf3'));

  console.log('\n[FluidSynth]');
  const local = path.join(ASSETS, 'fluidsynth', 'bin', process.platform === 'win32' ? 'fluidsynth.exe' : 'fluidsynth');
  if (fs.existsSync(local)) {
    console.log('  already there: assets/fluidsynth/');
  } else {
    console.log('  This repo does not bundle FluidSynth. Install it one of these ways:');
    console.log(`    Windows : download the win10 x64 zip, extract into assets/fluidsynth/`);
    console.log(`              ${FS_RELEASE}`);
    console.log('    Debian  : sudo apt install fluidsynth');
    console.log('    macOS   : brew install fluidsynth');
    console.log('  tools/render-stems.js will find either.');
  }

  if (WITH_PIANO) {
    console.log('\n[Salamander Grand Piano]  CC-BY — attribution to Alexander Holm is REQUIRED');
    console.log('  Deliberately not auto-downloaded: the original is an SFZ library and the');
    console.log('  SF2 conversions floating around are third-party repacks with no stable URL.');
    console.log(`    original : ${SALAMANDER}`);
    console.log(`    SF2 repack: ${SALAMANDER_SF2_HINT}`);
    console.log(`  Then save it as:  ${path.join(ASSETS, 'salamander.sf2')}`);
    console.log('  Without it the piano falls back to the GM bank (noticeably cheaper).');
  } else {
    console.log('\n(skipping the 1.2 GB grand piano — pass --piano for instructions)');
  }

  console.log('\nDone. Next:  node tools/compose.js\n');
})().catch((e) => { console.error(`\nFailed: ${e.message}`); process.exit(1); });
