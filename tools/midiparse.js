'use strict';
// midiparse.js — minimal Standard MIDI File reader (I only had a writer).
// Returns { format, division, tracks: [ { name, notes: [{tick,len,ch,pitch,vel}] } ] }

function readVLQ(b, s) {
  let v = 0, i = s.p;
  for (;;) {
    const c = b[i++];
    v = (v << 7) | (c & 0x7f);
    if (!(c & 0x80)) break;
    if (i - s.p > 4) break;
  }
  s.p = i;
  return v;
}

function parseMidi(buf) {
  if (buf.toString('ascii', 0, 4) !== 'MThd') throw new Error('not a MIDI file');
  const hlen = buf.readUInt32BE(4);
  const format = buf.readUInt16BE(8);
  const ntrks = buf.readUInt16BE(10);
  const division = buf.readUInt16BE(12);
  let p = 8 + hlen;

  const tracks = [];
  while (p < buf.length - 8) {
    const id = buf.toString('ascii', p, p + 4);
    const len = buf.readUInt32BE(p + 4);
    if (id !== 'MTrk') { p += 8 + len; continue; }
    const end = p + 8 + len;
    let i = p + 8;
    let tick = 0, status = 0;
    let name = '';
    const notes = [];
    const open = new Map();                 // pitch -> {tick, vel, ch}
    const s = { p: i };

    while (s.p < end) {
      tick += readVLQ(buf, s);
      let b0 = buf[s.p];
      if (b0 & 0x80) { status = b0; s.p++; }
      // else: running status, reuse previous `status`
      const hi = status & 0xf0, ch = status & 0x0f;

      if (status === 0xff) {
        const type = buf[s.p++];
        const mlen = readVLQ(buf, s);
        if (type === 0x03) name = buf.toString('utf8', s.p, s.p + mlen);
        s.p += mlen;
      } else if (status === 0xf0 || status === 0xf7) {
        const mlen = readVLQ(buf, s);
        s.p += mlen;
      } else if (hi === 0x90 || hi === 0x80) {
        const pitch = buf[s.p++], vel = buf[s.p++];
        if (hi === 0x90 && vel > 0) open.set(pitch, { tick, vel, ch });
        else {
          const o = open.get(pitch);
          if (o) { notes.push({ tick: o.tick, len: tick - o.tick, ch: o.ch, pitch, vel: o.vel }); open.delete(pitch); }
        }
      } else if (hi === 0xa0 || hi === 0xb0 || hi === 0xe0) {
        s.p += 2;
      } else if (hi === 0xc0 || hi === 0xd0) {
        s.p += 1;
      } else {
        s.p++;                               // unknown — skip a byte and resync
      }
    }
    tracks.push({ name, notes });
    p = end;
  }
  return { format, division, tracks };
}

module.exports = { parseMidi };
