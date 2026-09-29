'use strict';
// ---------------------------------------------------------------
// midi.js — minimal Standard MIDI File (format 1) writer
// No dependencies. Everything is tick-based (480 ticks per quarter).
// ---------------------------------------------------------------

const DIVISION = 480;                       // ticks per quarter note

const BASE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** 'Bb3' | 'F#4' -> MIDI note number */
function n(name) {
  const m = /^([A-Ga-g])([#b]?)(-?\d+)$/.exec(String(name));
  if (!m) throw new Error('bad note name: ' + name);
  let v = BASE[m[1].toUpperCase()];
  if (m[2] === '#') v += 1;
  if (m[2] === 'b') v -= 1;
  return v + (parseInt(m[3], 10) + 1) * 12;
}

/** beats -> ticks */
const B = (beats) => Math.round(beats * DIVISION);

function vlq(value) {
  if (value < 0) throw new Error('negative delta: ' + value);
  const out = [value & 0x7f];
  value = Math.floor(value / 128);
  while (value > 0) { out.unshift((value & 0x7f) | 0x80); value = Math.floor(value / 128); }
  return out;
}

function metaText(type, text) {
  const bytes = Array.from(Buffer.from(String(text), 'utf8'));
  return [0xff, type, bytes.length, ...bytes];
}

// ---------------------------------------------------------------

class Track {
  constructor(name, channel, program = -1, pan = 64) {
    this.name = name;
    this.channel = channel;
    this.program = program;
    this.pan = pan;
    this.events = [];                        // { tick, prio, data[] }
  }

  at(tick, data, prio = 1) { this.events.push({ tick, prio, data }); return this; }

  noteOn(tick, pitch, vel)  {
    if (!Number.isFinite(pitch)) {
      throw new Error(`noteOn with a non-finite pitch (${pitch}) at tick ${tick} `
        + `— usually an out-of-range chord-voicing index`);
    }
    return this.at(tick, [0x90 | this.channel, pitch & 127, Math.max(1, Math.min(127, Math.round(vel)))], 2);
  }
  noteOff(tick, pitch)      { return this.at(tick, [0x80 | this.channel, (pitch | 0) & 127, 0], 0); }

  /** place a note; dur in ticks */
  note(tick, pitch, dur, vel = 90) {
    this.noteOn(tick, pitch, vel);
    this.noteOff(tick + Math.max(1, dur), pitch);
    return this;
  }

  /** chord: array of pitches, same timing */
  chord(tick, pitches, dur, vel = 90) {
    for (const p of pitches) this.note(tick, p, dur, vel);
    return this;
  }

  /** evenly spaced chord stabs: hits = [ [beatOffset, pitches, durBeats, vel], ... ] */
  stab(baseTick, hits) {
    for (const h of hits) {
      this.chord(baseTick + B(h[0]), h[1], B(h[2]), h[3]);
    }
    return this;
  }

  cc(tick, num, val)     { return this.at(tick, [0xb0 | this.channel, num & 127, Math.max(0, Math.min(127, Math.round(val)))], 0); }
  panSet(tick, p)        { return this.cc(tick, 10, p); }
  volSet(tick, v)        { return this.cc(tick, 7, v); }
  expr(tick, v)          { return this.cc(tick, 11, v); }
  sustain(tick, on)      { return this.cc(tick, 64, on ? 127 : 0); }
  pitchBend(tick, semis) {
    const v = Math.max(-8192, Math.min(8191, Math.round(semis * 4096)));   // +/- 2 semitone range
    const raw = v + 8192;
    return this.at(tick, [0xe0 | this.channel, raw & 0x7f, (raw >> 7) & 0x7f], 1);
  }

  bytes() {
    const evs = [];
    evs.push({ tick: 0, prio: -10, data: metaText(0x03, this.name) });
    if (this.program >= 0) evs.push({ tick: 0, prio: -9, data: [0xc0 | this.channel, this.program & 127] });
    evs.push({ tick: 0, prio: -8, data: [0xb0 | this.channel, 10, this.pan & 127] });
    evs.push({ tick: 0, prio: -8, data: [0xb0 | this.channel, 7, 100] });
    for (const e of this.events) evs.push(e);

    evs.sort((a, b) => (a.tick - b.tick) || (a.prio - b.prio));

    const body = [];
    let last = 0;
    for (const e of evs) {
      for (const b of vlq(e.tick - last)) body.push(b);
      for (const b of e.data) body.push(b & 0xff);
      last = e.tick;
    }
    const endTick = evs.length ? evs[evs.length - 1].tick : 0;
    for (const b of vlq(endTick - last)) body.push(b);
    body.push(0xff, 0x2f, 0x00);

    return [...chunk('MTrk', body)];
  }
}

function chunk(id, bytes) {
  const head = [0x4d, 0x54, 0x72, 0x6b];   // 'MTrk'
  const len = bytes.length;
  return [0x4d, 0x54, 0x72, 0x6b,
          (len >>> 24) & 0xff, (len >>> 16) & 0xff, (len >>> 8) & 0xff, len & 0xff,
          ...bytes];
}

function writeFile(tracks, { bpm = 112, timeSig = [4, 4] } = {}) {
  // ---- conductor track ----
  // NOTE: every MIDI event needs a PRECEDING delta time. Building this track by
  // plain concatenation (no deltas) produced files no reader would open —
  // FluidSynth rejected them outright. My own renderer never noticed because
  // it synthesises from the in-memory track objects, never from the file.
  const usPerQuarter = Math.round(60000000 / bpm);
  const tc = [];
  const put = (delta, bytes) => { tc.push(...vlq(delta), ...bytes); };

  put(0, metaText(0x03, 'City Pop conductor'));
  put(0, [0xff, 0x51, 0x03,
          (usPerQuarter >> 16) & 0xff, (usPerQuarter >> 8) & 0xff, usPerQuarter & 0xff]);
  put(0, [0xff, 0x58, 0x04, timeSig[0], Math.round(Math.log2(timeSig[1])), 24, 8]);
  put(0, [0xff, 0x2f, 0x00]);                    // end of track

  const conductor = [0x4d, 0x54, 0x72, 0x6b,
    (tc.length >>> 24) & 0xff, (tc.length >>> 16) & 0xff,
    (tc.length >>> 8) & 0xff, tc.length & 0xff,
    ...tc];

  const all = [...conductor];
  for (const t of tracks) all.push(...t.bytes());

  const header = [0x4d, 0x54, 0x68, 0x64,
    0x00, 0x00, 0x00, 0x06,
    0x00, 0x01,                                  // format 1
    (tracks.length + 1) >> 8, (tracks.length + 1) & 0xff,
    (DIVISION >> 8) & 0xff, DIVISION & 0xff];

  return Buffer.from([...header, ...all]);
}

module.exports = { Track, n, B, writeFile, DIVISION, vlq, metaText };
