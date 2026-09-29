'use strict';
// paths.js — one place that knows where everything lives, so every script works
// no matter which directory you invoke it from.
//
//   song-production/
//     tools/     <- these scripts
//     assets/    <- soundfonts + fluidsynth (NOT in git; see tools/fetch-assets.js)
//     out/       <- everything generated (NOT in git)
//
const path = require('path');

const ROOT = path.join(__dirname, '..');

module.exports = {
  ROOT,
  OUT: path.join(ROOT, 'out'),
  STEMS: path.join(ROOT, 'out', 'stems'),
  ASSETS: path.join(ROOT, 'assets'),
};
