# Third-party assets

**Nothing in this list is included in this repository.** They are downloaded at
their official sources by `tools/fetch-assets.js`, and they remain under their
own licences. This file exists so the notices travel with the code.

---

## MuseScore_General.sf3

The General MIDI soundfont used for every instrument except the optional grand
piano. Downloaded automatically.

- **Licence**: MIT (portions public domain / CC0)
- **Adaptation for MuseScore_General**: Copyright © 2018–2021 S. Christian Collins
- **Contains**: MuseScore Drumline samples (CC0) by S. Christian Collins & Amir
  Oosman; Splendid Grand piano from AKAI S5000 (verified public domain);
  Marching Cymbals from the Versilian Community Sample Library (CC0) by Sam
  Gossner; Fluid (R3) Mono GM SoundFont (MIT) by Michael Cowgill, with the
  Temple Blocks instrument © 2002 Ethan Winer and Drumline Cymbals © 2016
  Michael Schorsch; Fluid (R3) GM SoundFont (MIT) © 2000–2002, 2008 Frank Wen.
- **Source**: <https://ftp.osuosl.org/pub/musescore/soundfont/MuseScore_General/>
- **Full licence text**: <https://sources.debian.org/src/musescore-general-soundfont-small/0.2.1-1/debian/copyright/>

## FluidSynth

The software synthesiser that renders each track. Not bundled — install it
system-wide or drop a portable build into `assets/fluidsynth/`.

- **Licence**: LGPL-2.1-or-later
- **Source**: <https://github.com/FluidSynth/fluidsynth>

## Salamander Grand Piano (optional)

A 1.2 GB Yamaha C5 with 16 velocity layers, used only if you supply it as
`assets/salamander.sf2`. Without it the piano falls back to the GM bank.

- **Licence**: **CC-BY 3.0 — attribution to Alexander Holm is REQUIRED**
- **Source**: <https://archive.org/details/SalamanderGrandPianoV3>

> ⚠️ If you use this soundfont, **you must credit Alexander Holm** in anything
> you publish that was made with it. That obligation is yours, not this
> repository's — the repo never distributes the file.

## POP909 dataset (optional)

Only needed by `tools/pop909-analyze.js`, which compares a melody against
statistics from real pop songs.

- **Licence**: check the dataset's own terms before use — research datasets
  often restrict commercial use.
- **Source**: <https://github.com/music-x-lab/POP909-Dataset>
