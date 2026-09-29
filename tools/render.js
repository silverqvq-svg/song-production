'use strict';
// ---------------------------------------------------------------
// render.js — software synthesizer: arrangement -> WAV
// No samples, no soundfonts, no plugins. Everything is synthesized.
// ---------------------------------------------------------------
const fs = require('fs');
const path = require('path');
const { trackList, TOTAL_BARS } = require('./compose.js');

const SR = 44100;
const BPM = 112;
const SPB = 60 / BPM;                       // seconds per beat
const TICK_S = SPB / 480;                   // seconds per tick
const BARS = TOTAL_BARS;
const DUR = BARS * 4 * SPB + 3.0;           // + reverb tail
const N = Math.ceil(DUR * SR);

const tick2s = (t) => t * TICK_S;
const tick2i = (t) => Math.round(t * TICK_S * SR);

// ------------------------- tiny DSP helpers -------------------------
const TAU = Math.PI * 2;
function saw(p) { return 2 * (p - Math.floor(p + 0.5)); }
function sqr(p) { return Math.sin(TAU * p) >= 0 ? 1 : -1; }
function tri(p) { const x = p - Math.floor(p + 0.5); return 4 * Math.abs(x) - 1; }
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

// Chamberlin state-variable filter
class SVF {
  constructor() { this.low = 0; this.band = 0; }
  lp(x, fc, q) {
    const f = Math.min(1.4, 2 * Math.sin(Math.PI * Math.min(fc, SR * 0.45) / SR));
    const h = x - this.low - q * this.band;
    this.band += f * h;
    this.low += f * this.band;
    return this.low;
  }
  hp(x, fc, q) { this.lp(x, fc, q); return x - this.low - q * this.band; }
  bp(x, fc, q) { this.lp(x, fc, q); return this.band; }
}

// deterministic noise so renders are reproducible
let seed = 1234567;
function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x3fffffff - 1; }

// exponential-ish ADSR (sample based)
function envA(t, a, d, s, r, dur) {
  if (t < a) return t / a;
  if (t < a + d) return 1 + (s - 1) * ((t - a) / d);
  if (t < dur) return s;
  const rt = t - dur;
  return rt < r ? s * (1 - rt / r) : 0;
}

// ------------------------- instrument voices -------------------------
// every voice adds into (L,R) at sample offset `off` for `len` samples

function addKick(L, R, off, len, vel, pan) {
  const g = vel / 127;
  let ph = 0;
  const amp = new SVF();
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    const f = 52 + 130 * Math.exp(-t / 0.019);    // faster pitch drop = more click
    ph += f / SR;
    let s = Math.sin(TAU * ph) * Math.exp(-t / 0.22);   // tighter than 0.30
    if (t < 0.004) s += rnd() * 0.65 * (1 - t / 0.004);
    s = amp.lp(s, 5200, 0.7);
    s *= g;
    const k = off + i; if (k >= N) break;
    L[k] += s * (1 - pan); R[k] += s * pan;
  }
}

function addSnare(L, R, off, len, vel, pan) {
  const g = vel / 127;
  let ph = 0;
  const hpf = new SVF();
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    // tighter + punchier: short body, shorter tail (modern, not 80s gated)
    const body = (Math.sin(TAU * ph) * 0.6 + Math.sin(TAU * ph * 1.58) * 0.4) * Math.exp(-t / 0.055);
    ph += 195 / SR;
    let n = rnd() * Math.exp(-t / 0.085);
    n = hpf.hp(n, 400, 0.7);                      // cut the boxy low-mid
    const s = (body * 0.62 + n * 0.85) * g;
    const k = off + i; if (k >= N) break;
    L[k] += s * (1 - pan); R[k] += s * pan;
  }
}

/** hand clap — three tight bursts + short tail (modern pop backbeat layer) */
function addClap(L, R, off, len, vel, pan) {
  const g = vel / 127;
  const bp = new SVF();
  const shortLen = Math.min(len, Math.ceil(0.30 * SR));
  for (let i = 0; i < shortLen; i++) {
    const t = i / SR;
    const burst =
      Math.exp(-Math.pow((t - 0.0000) / 0.0050, 2)) +
      Math.exp(-Math.pow((t - 0.0095) / 0.0060, 2)) +
      Math.exp(-Math.pow((t - 0.0180) / 0.0075, 2)) +
      0.45 * Math.exp(-t / 0.075);
    const s = bp.bp(rnd(), 1500, 1.2) * burst * g * 0.85;
    const k = off + i; if (k >= N) break;
    L[k] += s * (1 - pan); R[k] += s * pan;
  }
}

function addHat(L, R, off, len, vel, pan, decay) {
  const g = vel / 127;
  const hp = new SVF();
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    let s = hp.hp(rnd(), 8200, 0.6) * Math.exp(-t / decay) * g;
    const k = off + i; if (k >= N) break;
    L[k] += s * (1 - pan); R[k] += s * pan;
  }
}

function addCymbal(L, R, off, len, vel, pan, decay, tone) {
  const g = vel / 127;
  const hp = new SVF();
  const p1 = 0, p2 = 0, p3 = 0;
  let a = 0, b = 0, c = 0;
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    a += (3110 + tone) / SR; b += (4270 + tone) / SR; c += (5390 + tone) / SR;
    const met = (Math.sin(TAU * a) + Math.sin(TAU * b) + Math.sin(TAU * c)) / 3;
    let s = (rnd() * 0.75 + met * 0.45) * Math.exp(-t / decay) * g;
    s = hp.hp(s, 4200, 0.7);
    const k = off + i; if (k >= N) break;
    L[k] += s * (1 - pan); R[k] += s * pan;
  }
}

function addTom(L, R, off, len, vel, pan, base) {
  const g = vel / 127;
  let ph = 0;
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    const f = base * (1 + 0.55 * Math.exp(-t / 0.05));
    ph += f / SR;
    const s = Math.sin(TAU * ph) * Math.exp(-t / 0.24) * g;
    const k = off + i; if (k >= N) break;
    L[k] += s * (1 - pan); R[k] += s * pan;
  }
}

function addShaker(L, R, off, len, vel, pan) {
  const g = vel / 127;
  const hp = new SVF();
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    const atk = Math.min(1, t / 0.006);
    const s = hp.hp(rnd(), 7000, 0.55) * Math.exp(-t / 0.038) * atk * g;
    const k = off + i; if (k >= N) break;
    L[k] += s * (1 - pan); R[k] += s * pan;
  }
}

function addTamb(L, R, off, len, vel, pan) {
  const g = vel / 127;
  const hp = new SVF();
  let a = 0, b = 0;
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    a += 5200 / SR; b += 8100 / SR;
    const met = (Math.sin(TAU * a) + Math.sin(TAU * b)) * 0.5;
    let s = (rnd() * 0.7 + met * 0.5) * Math.exp(-t / 0.10) * g;
    s = hp.hp(s, 5000, 0.6);
    const k = off + i; if (k >= N) break;
    L[k] += s * (1 - pan); R[k] += s * pan;
  }
}

function addConga(L, R, off, len, vel, pan, base) {
  const g = vel / 127;
  let ph = 0;
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    const f = base * (1 + 0.3 * Math.exp(-t / 0.02));
    ph += f / SR;
    const s = (Math.sin(TAU * ph) * 0.9 + rnd() * 0.1 * Math.exp(-t / 0.01)) * Math.exp(-t / 0.16) * g;
    const k = off + i; if (k >= N) break;
    L[k] += s * (1 - pan); R[k] += s * pan;
  }
}

/** subtractive bass: saw + sub, resonant lowpass with envelope */
function addBass(L, R, off, len, vel, pan, freq, durSec) {
  const g = vel / 127;
  let p1 = 0, p2 = 0;
  const f = new SVF();
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    p1 += freq / SR; p2 += (freq * 2.002) / SR;
    const osc = saw(p1) * 0.62 + saw(p2) * 0.18 + Math.sin(TAU * p1 * 0.5) * 0.45;
    const fc = 180 + 2400 * Math.exp(-t / 0.10);
    const e = envA(t, 0.004, 0.20, 0.62, 0.07, durSec);
    const s = f.lp(osc, fc, 2.4) * e * g * 0.62;
    const k = off + i; if (k >= N) break;
    L[k] += s * (1 - pan); R[k] += s * pan;
  }
}

/** FM electric piano (Rhodes-ish): 1:1 body + 1:14 tine */
function addEP(L, R, off, len, vel, pan, freq, durSec) {
  const g = Math.pow(vel / 127, 1.25);
  let pc = 0, pm1 = 0, pm2 = 0;
  const f = new SVF();
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    const I1 = 2.4 * Math.exp(-t / 0.085) + 0.5;
    const I2 = 0.65 * Math.exp(-t / 0.007);      // less bell: the tine was reading as "plucked"
    pc += freq / SR; pm1 += freq / SR; pm2 += (freq * 14) / SR;
    const mod = I1 * Math.sin(TAU * pm1) + I2 * Math.sin(TAU * pm2);
    let s = Math.sin(TAU * pc + mod) * 0.8 + Math.sin(TAU * pc * 2 + mod * 0.4) * 0.14;
    const e = envA(t, 0.004, 0.9, 0.34, 0.16, durSec);
    s = f.lp(s, 3800, 0.7) * e * g * 0.42;
    const k = off + i; if (k >= N) break;
    L[k] += s * (1 - pan); R[k] += s * pan;
  }
}

/** additive piano — bright hard attack (YOASOBI-ish) with a SHORT ring and a
 *  fast release. Crisp AND connected: the arpeggio notes sit next to each
 *  other in time, but each one stops instead of smearing into the next. */
function addPiano(L, R, off, len, vel, pan, freq, durSec) {
  const vn = vel / 127;
  const g = Math.pow(vn, 1.00) * 0.46;
  const NH = 16;
  const ph = new Float64Array(NH), amp = new Float64Array(NH), dec = new Float64Array(NH);
  // random start phase per note — identical phases make every note sound like
  // the same synthesised event, which is a big part of the "electronic" tell
  for (let h = 1; h <= NH; h++) {
    ph[h - 1] = rnd() * 0.5;
    // velocity-dependent brightness: harder strikes excite more upper partials
    const hf = h > 6 ? (0.55 + 0.8 * vn) : 1;
    amp[h - 1] = Math.pow(h, -0.92) * (h % 2 === 0 ? 0.78 : 1) * hf;
    dec[h - 1] = (0.70 + 0.55 * vn) / Math.pow(h, 0.56);
  }
  const B = 0.0007;                              // real pianos are inharmonic
  const f = new SVF();
  const relSamples = 0.085 * SR;
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    let s = 0;
    for (let h = 1; h <= NH; h++) {
      const fh = freq * h * Math.sqrt(1 + B * h * h);
      ph[h - 1] += fh / SR;
      s += Math.sin(TAU * ph[h - 1]) * amp[h - 1] * Math.exp(-t / dec[h - 1]);
    }
    if (t < 0.012) s += rnd() * (0.35 + 0.35 * vn) * (1 - t / 0.012);   // hammer noise
    let env = 1;
    if (t > durSec) env = Math.max(0, 1 - (t - durSec) * SR / relSamples);
    if (env <= 0) { const k = off + i; if (k >= N) break; continue; }
    s = f.lp(s, 9500, 0.7) * g * env;
    const k = off + i; if (k >= N) break;
    L[k] += s * (1 - pan); R[k] += s * pan;
  }
}

/** Karplus-Strong plucked string — clean electric guitar */
function addString(L, R, off, len, vel, pan, freq, bright) {
  const g = Math.pow(vel / 127, 1.1) * 0.32;
  const Nl = Math.max(2, Math.round(SR / freq));
  const buf = new Float32Array(Nl);
  for (let i = 0; i < Nl; i++) buf[i] = rnd();
  // pre-filter for brightness
  const pre = new SVF();
  for (let i = 0; i < Nl; i++) buf[i] = pre.lp(buf[i], bright, 0.7) * 3.2;
  const damp = 0.9965, lpAmt = 0.42;
  let idx = 0, last = 0;
  const body = new SVF();
  for (let i = 0; i < len; i++) {
    const cur = buf[idx];
    const nxt = buf[(idx + 1) % Nl];
    last = (cur + nxt) * 0.5 * lpAmt + last * (1 - lpAmt);
    buf[idx] = last * damp;
    idx = (idx + 1) % Nl;
    let s = body.lp(cur, 3400, 0.6) * g;
    if (i < 30) s += rnd() * 0.10 * g * (1 - i / 30);    // pick
    const k = off + i; if (k >= N) break;
    L[k] += s * (1 - pan); R[k] += s * pan;
  }
}

/** muted 16th "chuck" — heavily damped, noise-led. The city-pop scratch. */
function addChuck(L, R, off, len, vel, pan, freq) {
  const g = Math.pow(vel / 127, 1.1) * 0.32;
  const Nl = Math.max(2, Math.round(SR / freq));
  const buf = new Float32Array(Nl);
  for (let i = 0; i < Nl; i++) buf[i] = rnd() * 0.5;
  const damp = 0.70, lpAmt = 0.78;
  let idx = 0, last = 0;
  const body = new SVF();
  const shortLen = Math.min(len, Math.ceil(0.09 * SR));
  for (let i = 0; i < shortLen; i++) {
    const cur = buf[idx], nxt = buf[(idx + 1) % Nl];
    last = (cur + nxt) * 0.5 * lpAmt + last * (1 - lpAmt);
    buf[idx] = last * damp;
    idx = (idx + 1) % Nl;
    let s = body.lp(cur, 2400, 0.8) * 0.55;
    if (i < 24) s += rnd() * 0.9 * (1 - i / 24);
    s *= Math.exp(-i / (0.045 * SR)) * g;
    const k = off + i; if (k >= N) break;
    L[k] += s * (1 - pan); R[k] += s * pan;
  }
}

/** LEGATO driven electric guitar — sustained oscillators through the amp,
 *  NOT a plucked string. Smooth attack so notes connect. */
function addElec(L, R, off, len, vel, pan, freq, drive = 4.0, durSec = 0.4) {
  const g = Math.pow(vel / 127, 0.92) * 0.19;
  let p1 = 0, p2 = 0, p3 = 0;
  const cabLp = new SVF(), cabHp = new SVF(), mid = new SVF();
  const nrm = Math.tanh(drive);
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    const vib = 1 + 0.0026 * Math.sin(TAU * 5.1 * t) * Math.min(1, t / 0.30);
    p1 += (freq * vib) / SR;
    p2 += (freq * vib * 1.0045) / SR;
    p3 += (freq * vib * 0.5) / SR;
    const osc = saw(p1) * 0.50 + saw(p2) * 0.42 + sqr(p3) * 0.16;
    let s = Math.tanh(osc * drive) / nrm;        // amp gain
    s = cabLp.lp(s, 3900, 0.7);                  // speaker rolloff
    s = cabHp.hp(s, 110, 0.7);                   // no flub
    s += mid.bp(s, 1500, 0.8) * 0.38;            // cab midrange
    const e = envA(t, 0.024, 0.70, 0.86, 0.20, durSec);   // legato swelling envelope
    s *= e * g;
    const k = off + i; if (k >= N) break;
    L[k] += s * (1 - pan); R[k] += s * pan;
  }
}

/** steel-string ACOUSTIC guitar — Karplus-Strong with a bright pick and a
 *  faster decay than the electric, plus a body resonance. This is the
 *  "Martin" role the reference project uses six tracks of. */
function addAcoustic(L, R, off, len, vel, pan, freq) {
  const g = Math.pow(vel / 127, 1.05) * 0.30;
  const Nl = Math.max(2, Math.round(SR / freq));
  const buf = new Float32Array(Nl);
  const pre = new SVF();
  for (let i = 0; i < Nl; i++) buf[i] = pre.lp(rnd(), 4200, 0.65) * 2.4;
  const damp = 0.9952, lpAmt = 0.50;              // acoustic dies faster
  let idx = 0, last = 0;
  const body = new SVF(), low = new SVF();
  for (let i = 0; i < len; i++) {
    const cur = buf[idx], nxt = buf[(idx + 1) % Nl];
    last = (cur + nxt) * 0.5 * lpAmt + last * (1 - lpAmt);
    buf[idx] = last * damp;
    idx = (idx + 1) % Nl;
    let s = body.lp(cur, 4600, 0.6) * g;
    s += low.bp(cur, 210, 1.3) * g * 0.55;        // soundbox resonance
    if (i < 26) s += rnd() * 0.22 * g * (1 - i / 26);   // pick attack
    const k = off + i; if (k >= N) break;
    L[k] += s * (1 - pan); R[k] += s * pan;
  }
}

/** detuned saw pad */
function addPad(L, R, off, len, vel, pan, freq, durSec, opts = {}) {
  const { attack = 0.22, release = 0.45, cutoff = 2300, detune = 9, gain = 0.075 } = opts;
  const g = (vel / 127) * gain;
  const V = 4;
  const ph = new Float64Array(V);
  const cents = [-detune * 1.5, -detune * 0.4, detune * 0.5, detune * 1.6];
  const f = new SVF(), f2 = new SVF();
  // slow chorus
  const modPhase = [];
  for (let i = 0; i < V; i++) modPhase.push(0);
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    let s = 0;
    for (let v = 0; v < V; v++) {
      const fv = freq * Math.pow(2, cents[v] / 1200);
      modPhase[v] += fv / SR;
      s += saw(modPhase[v]);
    }
    s /= V;
    const e = envA(t, attack, 0.25, 0.86, release, durSec);
    s = f2.lp(f.lp(s, cutoff, 0.8), cutoff * 1.2, 0.8) * e * g;
    const k = off + i; if (k >= N) break;
    L[k] += s * (1 - pan); R[k] += s * pan;
  }
}

/** saw brass with a filter sweep */
function addBrass(L, R, off, len, vel, pan, freq, durSec) {
  const g = (vel / 127) * 0.15;
  let p1 = 0, p2 = 0;
  const f = new SVF();
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    p1 += freq / SR; p2 += (freq * 1.004) / SR;
    const osc = saw(p1) * 0.6 + saw(p2) * 0.4;
    // sustain cutoff raised so the pad stays bright enough to cut through
    const fc = 1500 + 2800 * Math.exp(-t / 0.09) + 900;
    const e = envA(t, 0.03, 0.25, 0.78, 0.10, durSec);
    const s = f.lp(osc, Math.min(fc, 5200), 1.9) * e * g;
    const k = off + i; if (k >= N) break;
    L[k] += s * (1 - pan); R[k] += s * pan;
  }
}

/** lead: SOFT and LEGATO. The FM bell transient I added last round read as a
 *  plucked guitar/bell and was mistaken for a retro guitar solo — removed. */
function addLead(L, R, off, len, vel, pan, freq, durSec) {
  const g = (vel / 127) * 0.21;
  let p1 = 0, p2 = 0, p3 = 0;
  const f = new SVF();
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    const vib = 1 + 0.0022 * Math.sin(TAU * 4.6 * t) * Math.min(1, t / 0.40);
    p1 += (freq * vib) / SR;
    p2 += (freq * vib * 1.0026) / SR;
    p3 += (freq * vib * 0.5013) / SR;
    const osc = tri(p1) * 0.44 + Math.sin(TAU * p2) * 0.36
              + Math.sin(TAU * p3) * 0.16 + saw(p1) * 0.10;
    const e = envA(t, 0.050, 0.55, 0.82, 0.30, durSec);   // slow, smooth, no pluck
    const s = f.lp(osc, 2300, 0.55) * e * g;
    const k = off + i; if (k >= N) break;
    L[k] += s * (1 - pan); R[k] += s * pan;
  }
}

/** soft backing-vocal-ish pad */
function addVox(L, R, off, len, vel, pan, freq, durSec) {
  const g = (vel / 127) * 0.21;
  const V = 3, ph = new Float64Array(V), cents = [-6, 0, 7];
  const f1 = new SVF(), f2 = new SVF();
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    let s = 0;
    for (let v = 0; v < V; v++) {
      ph[v] += (freq * Math.pow(2, cents[v] / 1200)) / SR;
      s += saw(ph[v]);
    }
    s /= V;
    s = f2.bp(f1.lp(s, 900, 0.9), 1400, 1.4);        // vowel-ish formant
    const e = envA(t, 0.12, 0.3, 0.8, 0.25, durSec);
    s *= e * g;
    const k = off + i; if (k >= N) break;
    L[k] += s * (1 - pan); R[k] += s * pan;
  }
}

// ------------------------- Freeverb -------------------------
function reverb(mono, outL, outR, mix) {
  const COMB = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];
  const AP = [556, 441, 341, 225];
  const STEREO = 23;
  const fb = 0.84, damp = 0.32;
  const mk = (n) => ({ buf: new Float32Array(n), i: 0, n, store: 0 });

  function runOne(len, chans, spread) {
    const combs = COMB.map(d => mk(d + spread));
    const aps = AP.map(d => mk(d + spread));
    const out = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      const x = chans ? mono[i] : mono[i];
      let acc = 0;
      for (const c of combs) {
        const y = c.buf[c.i];
        c.store = y * (1 - damp) + c.store * damp;
        c.buf[c.i] = x * 0.16 + c.store * fb;
        c.i = (c.i + 1) % c.n;
        acc += y;
      }
      for (const a of aps) {
        const y = a.buf[a.i];
        a.buf[a.i] = acc + y * 0.5;
        a.i = (a.i + 1) % a.n;
        acc = y - acc;
      }
      out[i] = acc;
    }
    return out;
  }
  const a = runOne(N, true, 0);
  const b = runOne(N, false, STEREO);
  for (let i = 0; i < N; i++) {
    outL[i] += a[i] * mix;
    outR[i] += b[i] * mix;
  }
}

// ------------------------- production FX -------------------------
/** stereo chorus — the Boss CE-1/CE-2 sound that defines city pop */
function chorusFX(L, R, n, rate, depthMs, mix) {
  const maxD = Math.ceil(SR * 0.06);
  const bl = new Float32Array(maxD), br = new Float32Array(maxD);
  const dL = depthMs * SR / 1000, dR = depthMs * 1.45 * SR / 1000;
  let w = 0;
  for (let i = 0; i < n; i++) {
    bl[w] = L[i]; br[w] = R[i];
    const mL = 0.5 + 0.5 * Math.sin(TAU * rate * i / SR);
    const mR = 0.5 + 0.5 * Math.sin(TAU * rate * i / SR + 2.1);
    const aL = (w - dL * (0.30 + 0.70 * mL) + maxD * 2) % maxD;
    const aR = (w - dR * (0.30 + 0.70 * mR) + maxD * 2) % maxD;
    const iL = Math.floor(aL), fL = aL - iL;
    const iR = Math.floor(aR), fR = aR - iR;
    const sL = bl[iL % maxD] * (1 - fL) + bl[(iL + 1) % maxD] * fL;
    const sR = br[iR % maxD] * (1 - fR) + br[(iR + 1) % maxD] * fR;
    L[i] = L[i] * (1 - mix) + sL * mix;
    R[i] = R[i] * (1 - mix) + sR * mix;
    w = (w + 1) % maxD;
  }
}

/** one-pole high pass (removes rumble so the low end stays clean) */
function highpass(buf, n, fc) {
  const a = Math.exp(-TAU * fc / SR);
  let px = 0, py = 0;
  for (let i = 0; i < n; i++) {
    const x = buf[i];
    const y = a * (py + x - px);
    buf[i] = y; px = x; py = y;
  }
}

/** high shelf lift: x + amt * highpass(x, fc) */
function shelfUp(buf, n, fc, amt) {
  const a = Math.exp(-TAU * fc / SR);
  let px = 0, py = 0;
  for (let i = 0; i < n; i++) {
    const x = buf[i];
    const y = a * (py + x - px);
    px = x; py = y;
    buf[i] = x + amt * y;
  }
}

/** peaking CUT: x - amt * bandpass(x, fc) — removes boxy low-mid buildup */
function midCut(buf, n, fc, q, amt) {
  const f = new SVF();
  for (let i = 0; i < n; i++) {
    const x = buf[i];
    buf[i] = x - amt * f.bp(x, fc, q);
  }
}

/** feed-forward stereo bus compressor — the SSL-style glue */
function busComp(L, R, n, thrDb, ratio, atkMs, relMs) {
  const atk = Math.exp(-1 / (atkMs * 0.001 * SR));
  const rel = Math.exp(-1 / (relMs * 0.001 * SR));
  const thr = Math.pow(10, thrDb / 20);
  let env = 0;
  for (let i = 0; i < n; i++) {
    const d = Math.max(Math.abs(L[i]), Math.abs(R[i]));
    env = d > env ? atk * env + (1 - atk) * d : rel * env + (1 - rel) * d;
    let g = 1;
    if (env > thr) {
      const over = 20 * Math.log10(env / thr);
      g = Math.pow(10, -(over * (1 - 1 / ratio)) / 20);
    }
    L[i] *= g; R[i] *= g;
  }
}

/** tape-ish HF rolloff + soft saturation, applied to the 2-mix */
function tapeGlue(L, R, n, drive) {
  const a = Math.exp(-TAU * 15000 / SR);
  let lz = 0, rz = 0;
  for (let i = 0; i < n; i++) {
    lz = L[i] * (1 - a) + lz * a;
    rz = R[i] * (1 - a) + rz * a;
    L[i] = Math.tanh(lz * drive) / Math.tanh(drive);
    R[i] = Math.tanh(rz * drive) / Math.tanh(drive);
  }
}

// ------------------------- note extraction -------------------------
function extractNotes(track) {
  const evs = track.events.slice().sort((x, y) => (x.tick - y.tick) || (x.prio - y.prio));
  const active = new Map(), notes = [];
  for (const e of evs) {
    const st = e.data[0] & 0xf0, p = e.data[1], v = e.data[2];
    if (st === 0x90 && v > 0) active.set(p, { tick: e.tick, pitch: p, vel: v });
    else if (st === 0x80 || (st === 0x90 && v === 0)) {
      const a = active.get(p);
      if (a) { notes.push({ start: a.tick, len: e.tick - a.tick, pitch: p, vel: a.vel }); active.delete(p); }
    }
  }
  return notes;
}

// ------------------------- mixing plan -------------------------
// gain from the measured stem levels; hp = high-pass, chor = [rate, depth, mix],
// shelf = [freq, amount], comp = [thr, ratio, atk, rel]
const PLAN = {
  'Drums':      { gain: 4.519, send: 0.05, hp: 25, comp: [-10, 3.0, 22, 70] },
                                                // v27 (final): drumShaper rebuilds every
                                                // hit's envelope, so the gain was
                                                // re-derived for the new RMS. 22 ms
                                                // attack lets the transient through;
                                                // 70 ms release clamps the tail. Send
                                                // cut 0.10 -> 0.05 for a drier kit.
                                                // 4.52 = the D3 setting the user chose.
  'Bass':       { gain: 2.20, send: 0.03, hp: 28, comp: [-14, 3.0, 8, 90] },
  'E.Piano':    { gain: 1.01, send: 0.22, hp: 110, chor: [0.55, 3.2, 0.10], shelf: [3500, 0.35] },
  'Ac.Piano':   { gain: 3.15, send: 0.03, hp: 45 },
                                                // v23: user says the mixed piano is
                                                // "太尖" — the 4.2k shelf boost and the
                                                // 300 Hz cut were for the cheap GM piano.
                                                // The Salamander Grand needs neither, so
                                                // the piano now goes through clean.
  'Guitar L':   { gain: 1.74, send: 0.14, hp: 140, chor: [0.80, 4.0, 0.12], shelf: [3200, 0.40] },
  'Guitar R':   { gain: 2.28, send: 0.18, hp: 140, chor: [0.65, 3.4, 0.12], shelf: [3200, 0.35] },
  'Ac.Gtr':     { gain: 3.65, send: 0.18, hp: 100, chor: [0.70, 3.0, 0.14], shelf: [5000, 0.40] },
  'Ac.Gtr Strum': { gain: 3.50, send: 0.12, hp: 120, shelf: [5000, 0.10] },
                                                // v25: was 'E.Gtr Lead'. Same slot, now
                                                // a low acoustic strum (A#2-G4, median
                                                // A3) that is meant to be barely
                                                // audible — hence the low target. No
                                                // chorus: that shimmer was part of the
                                                // "scattered" complaint.
  'Strings L':  { gain: 1.74, send: 0.34, hp: 90,  chor: [0.40, 5.0, 0.16] },
  'Strings R':  { gain: 2.33, send: 0.34, hp: 90,  chor: [0.42, 5.2, 0.16] },
  'Synth Pad':  { gain: 1.49, send: 0.26, hp: 120, chor: [0.35, 4.0, 0.22] },
  'Lead (vocal guide)': { gain: 3.88, send: 0.24, hp: 130, shelf: [5000, 0.15] },
                                                // v24: vibraphone. The old 4 kHz +0.30
                                                // shelf was for the sawtooth; on a
                                                // mallet it just sharpens the strike.
  'Harmony Vox':{ gain: 1.22, send: 0.30, hp: 200 },
  'Shaker':     { gain: 2.24, send: 0.12, hp: 900 },
  'Tambourine': { gain: 3.75, send: 0.14, hp: 800 },
  'Congas':     { gain: 0.60, send: 0.12, hp: 80 },
};

function voiceFor(trackName, note, L, R, off, len, pan, durSec) {
  const f = mtof(note.pitch);
  switch (trackName) {
    case 'Drums':
      switch (note.pitch) {
        case 36: return addKick(L, R, off, len, note.vel, pan);
        case 38: case 37: return addSnare(L, R, off, len, note.vel, pan);
        case 39: return addClap(L, R, off, len, note.vel, pan);
        case 42: return addHat(L, R, off, len, note.vel, pan, 0.045);
        case 44: return addHat(L, R, off, len, note.vel, pan, 0.075);
        case 46: return addHat(L, R, off, len, note.vel, pan, 0.32);
        case 49: return addCymbal(L, R, off, len, note.vel, pan, 1.5, 0);
        case 51: return addCymbal(L, R, off, len, note.vel, pan, 0.75, 900);
        case 45: return addTom(L, R, off, len, note.vel, pan, 120);
        case 47: return addTom(L, R, off, len, note.vel, pan, 165);
        case 50: return addTom(L, R, off, len, note.vel, pan, 220);
        default: return;
      }
    case 'Shaker':     return addShaker(L, R, off, len, note.vel, pan);
    case 'Tambourine': return addTamb(L, R, off, len, note.vel, pan);
    case 'Congas':     return addConga(L, R, off, len, note.vel, pan, note.pitch === 62 ? 260 : 200);
    case 'Bass':       return addBass(L, R, off, len, note.vel, pan, f, durSec);
    case 'E.Piano':    return addEP(L, R, off, len, note.vel, pan, f, durSec);
    case 'Ac.Piano':   return addPiano(L, R, off, len, note.vel, pan, f, durSec);
    case 'Guitar L':
      return note.vel >= 70
        ? addElec(L, R, off, len, note.vel, pan, f, 2.2, durSec)   // legato
        : addChuck(L, R, off, len, note.vel, pan, f);              // muted scratch
    case 'Guitar R':   return addElec(L, R, off, len, note.vel, pan, f, 4.2, durSec);
    case 'Ac.Gtr':     return addAcoustic(L, R, off, len, note.vel, pan, f);
    case 'Ac.Gtr Strum': return addAcoustic(L, R, off, len, note.vel, pan, f);
    case 'Strings L':  return addPad(L, R, off, len, note.vel, pan, f, durSec, { cutoff: 2000, attack: 0.30, gain: 0.075, detune: 11 });
    case 'Strings R':  return addPad(L, R, off, len, note.vel, pan, f, durSec, { cutoff: 2400, attack: 0.30, gain: 0.075, detune: 11 });
    case 'Synth Pad':  return addPad(L, R, off, len, note.vel, pan, f, durSec,
                                     { cutoff: 2100, attack: 0.22, gain: 0.075, detune: 6 });
    case 'Lead (vocal guide)': return addLead(L, R, off, len, note.vel, pan, f, durSec);
    case 'Harmony Vox':return addVox(L, R, off, len, note.vel, pan, f, durSec);
    default: return;
  }
}

// ------------------------- optional sampled piano -------------------------
// If out/piano_fs.wav exists (FluidSynth + a real piano soundfont) it replaces
// the synthesised piano. Everything else stays synthesised.
const FS_PIANO = path.join(require('./paths').OUT, 'piano_fs.wav');
const FS_PIANO_GAIN = 2.74;   // calibrated so it lands on the same -16.5 dB target
                              // the synth piano was sitting at

function loadWavStereo(p) {
  const b = fs.readFileSync(p);
  let i = 12, off = -1, len = 0, ch = 2, sr = 44100, bits = 16;
  while (i < b.length - 8) {
    const id = b.toString('ascii', i, i + 4);
    const sz = b.readUInt32LE(i + 4);
    if (id === 'fmt ') { ch = b.readUInt16LE(i + 10); sr = b.readUInt32LE(i + 12); bits = b.readUInt16LE(i + 22); }
    else if (id === 'data') { off = i + 8; len = sz; }
    if (sz === 0) break;
    i += 8 + sz + (sz % 2);
  }
  const bpf = bits / 8, n = Math.floor(len / (bpf * ch));
  const L = new Float32Array(n), R = new Float32Array(n);
  for (let x = 0; x < n; x++) {
    L[x] = b.readInt16LE(off + x * bpf * ch) / 32768;
    R[x] = b.readInt16LE(off + x * bpf * ch + bpf) / 32768;
  }
  return { L, R, n, sr };
}

const sampledPiano = fs.existsSync(FS_PIANO) ? loadWavStereo(FS_PIANO) : null;
if (sampledPiano) console.log(`using SAMPLED piano from ${path.basename(FS_PIANO)} (${sampledPiano.n} frames)`);
else console.log('no sampled piano found — using the synthesised one');

// ------------------------- soundfont stems -------------------------
// If out/stems/<track>.wav exists (FluidSynth + GeneralUser GS) it replaces the
// synthesised voice for that track. GeneralUser GS is a full GM bank, so this
// covers guitars, bass, drums, strings — not just piano.
const STEM_DIR = require('./paths').STEMS;
// Optional override dir, searched FIRST — lets me swap one instrument's sample
// without re-rendering all fifteen stems.
const STEM_DIRS = [process.env.SP_STEMDIR, STEM_DIR].filter(Boolean).map((p) => path.resolve(p));
const stemCache = new Map();
const safeName = (s) => s.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');

function stemFor(name) {
  const key = safeName(name);
  if (stemCache.has(key)) return stemCache.get(key);
  let v = null;
  for (const d of STEM_DIRS) {
    const p = path.join(d, `${key}.wav`);
    if (fs.existsSync(p)) { v = loadWavStereo(p); break; }
  }
  stemCache.set(key, v);
  return v;
}

// ------------------------- drum transient shaper -------------------------
// The kit's decay is baked into the soundfont, so I rebuild it per MIDI hit:
// full level at the attack, then a fast exponential. Long GM tails (crash, ride,
// open hat) get tightened hardest — that is what "回落得更快" means for a cymbal.
// Independent of the soundfont, so it survives a sample swap.
const DRUM_TAU = {
  35: 0.060, 36: 0.075,                        // kick
  37: 0.050, 38: 0.085, 39: 0.065, 40: 0.050,  // snare / clap / rim
  41: 0.075, 43: 0.075, 45: 0.065, 47: 0.060, 48: 0.070, 50: 0.070,   // toms
  42: 0.016, 44: 0.014, 46: 0.055,             // closed / pedal / open hat
  49: 0.30, 57: 0.30, 52: 0.26, 55: 0.22,      // crashes / chinese
  51: 0.10, 59: 0.10, 53: 0.11,                // ride / bell
};
const DRUM_DEFAULT_TAU = 0.080;
const DRUM_FLOOR = 0.02;     // never gate to zero — keeps a little room tone
const DRUM_PUNCH = 0.30;     // extra level over the first 2.5 ms of the attack

function drumShaper(L, R, N, hits, rate) {
  const env = new Float32Array(N);
  const punchN = Math.max(1, Math.round(0.0025 * SR));
  for (const h of hits) {
    const tau = Math.max(8, ((DRUM_TAU[h.pitch] ?? DRUM_DEFAULT_TAU) / rate) * SR);
    const len = Math.min(N - h.off, Math.ceil(tau * 7));
    for (let i = 0; i < len; i++) {
      let g = DRUM_FLOOR + (1 - DRUM_FLOOR) * Math.exp(-i / tau);
      if (i < punchN) g *= 1 + DRUM_PUNCH * (1 - i / punchN);
      if (g > env[h.off + i]) env[h.off + i] = g;
    }
  }
  for (let i = 0; i < N; i++) {
    const g = env[i] > 0 ? env[i] : DRUM_FLOOR;
    L[i] *= g; R[i] *= g;
  }
}

// ------------------------- main render -------------------------
console.log(`rendering ${DUR.toFixed(1)}s @ ${SR}Hz  (${N} samples/ch)`);

const masterL = new Float32Array(N);
const masterR = new Float32Array(N);
const send = new Float32Array(N);
const tmpL = new Float32Array(N);
const tmpR = new Float32Array(N);

// Diagnostic overrides: render a single instrument (SP_SOLO) and/or only the
// first N seconds (SP_SECS), to a chosen file (SP_OUT). Used to identify by
// ear which instrument is which in a given bar.
const SOLO = process.env.SP_SOLO || '';
const MUTE = (process.env.SP_MUTE || '').split('|').filter(Boolean);
const CLIP = Number(process.env.SP_SECS || 0);
const START = Number(process.env.SP_START || 0);   // window start, seconds
const NOFX = (process.env.SP_NOFX || '').split('|').filter(Boolean);   // 'chor'|'air'|'reverb'|'gshelf'
const GTR_TRACKS = new Set(['Guitar L', 'Guitar R', 'Ac.Gtr', 'Ac.Gtr Strum']);
const DRUM_RATE = Number(process.env.SP_DRUMRATE ?? 1.45);   // 0 = off, 1.45 = the chosen setting
if (SOLO) console.log(`*** SOLO mode: ${SOLO}${CLIP ? `, ${START}s..${START + CLIP}s` : ''}`);
if (MUTE.length) console.log(`*** MUTE mode: ${MUTE.join(', ')}${CLIP ? `, ${START}s..${START + CLIP}s` : ''}`);

const t0 = Date.now();
// SP_GAIN="Track Name=1.23|Other=0.5" — override PLAN gains without editing the file
const GAIN_OVR = new Map((process.env.SP_GAIN || '').split('|').filter(Boolean)
  .map((s) => { const i = s.lastIndexOf('='); return [s.slice(0, i), Number(s.slice(i + 1))]; }));
if (GAIN_OVR.size) console.log(`*** GAIN override: ${[...GAIN_OVR].map(([k, v]) => `${k}=${v}`).join(', ')}`);

for (const track of trackList) {
  const plan = PLAN[track.name];
  if (!plan) continue;
  if (SOLO && track.name !== SOLO) continue;
  if (MUTE.includes(track.name)) continue;
  if (GAIN_OVR.has(track.name)) plan.gain = GAIN_OVR.get(track.name);
  const notes = extractNotes(track);
  if (!notes.length) continue;

  tmpL.fill(0); tmpR.fill(0);
  const pan = track.pan / 127;
  const stem = stemFor(track.name);
  if (stem) {
    // sampled stem: balance-pan it (centre = unity, no boost)
    const gl = pan <= 0.5 ? 1 : (1 - pan) * 2;
    const gr = pan >= 0.5 ? 1 : pan * 2;
    for (let i = 0; i < N && i < stem.n; i++) {
      tmpL[i] = stem.L[i] * gl;
      tmpR[i] = stem.R[i] * gr;
    }
  } else {
    for (const nt of notes) {
      const off = tick2i(nt.start);
      const durS = tick2s(nt.len);
      let len = Math.ceil((durS + 2.2) * SR);          // + release/tail
      if (track.name === 'Drums') len = Math.ceil(1.8 * SR);
      if (track.name === 'Ac.Piano') len = Math.ceil((durS + 0.35) * SR);  // it releases itself
      if (len < 64) len = 64;
      voiceFor(track.name, nt, tmpL, tmpR, off, len, pan, durS);
    }
  }
  // punchier AND shorter kit: rebuild each hit's envelope from the MIDI
  if (track.name === 'Drums' && stem && DRUM_RATE > 0) {
    drumShaper(tmpL, tmpR, N,
      notes.map((nt) => ({ off: tick2i(nt.start), pitch: nt.pitch })), DRUM_RATE);
  }
  // per-track production chain: comp -> HP -> shelf -> chorus
  if (plan.comp) busComp(tmpL, tmpR, N, plan.comp[0], plan.comp[1], plan.comp[2], plan.comp[3]);
  if (plan.hp) { highpass(tmpL, N, plan.hp); highpass(tmpR, N, plan.hp); }
  if (plan.mid) { midCut(tmpL, N, plan.mid[0], plan.mid[1], plan.mid[2]);
                  midCut(tmpR, N, plan.mid[0], plan.mid[1], plan.mid[2]); }
  if (plan.shelf && !(NOFX.includes('gshelf') && GTR_TRACKS.has(track.name))) {
    shelfUp(tmpL, N, plan.shelf[0], plan.shelf[1]); shelfUp(tmpR, N, plan.shelf[0], plan.shelf[1]);
  }
  if (plan.chor && !NOFX.includes('chor')) chorusFX(tmpL, tmpR, N, plan.chor[0], plan.chor[1], plan.chor[2]);

  let ss = 0;
  for (let i = 0; i < N; i++) {
    const l = tmpL[i], r = tmpR[i];
    ss += (l * l + r * r) / 2;
    masterL[i] += l * plan.gain;
    masterR[i] += r * plan.gain;
    send[i] += (l + r) * 0.5 * plan.gain * plan.send;   // post-fader send
  }
  const stemDb = 20 * Math.log10(Math.sqrt(ss / N) || 1e-9);
  const contrib = 20 * Math.log10((Math.sqrt(ss / N) * plan.gain) || 1e-9);
  const src = stemFor(track.name) ? 'SAMPLE' : 'synth ';
  console.log(`  ok  ${track.name.padEnd(20)} ${src} notes=${String(notes.length).padStart(5)}  stem ${stemDb.toFixed(1).padStart(6)} dB  x${plan.gain.toFixed(2)} -> ${contrib.toFixed(1).padStart(6)} dB`);
}

console.log('applying reverb...');
if (!NOFX.includes('reverb')) reverb(send, masterL, masterR, 0.55);

// SSL-style bus glue, then tape-ish top rolloff + saturation on the 2-mix
console.log('master bus: compress + tape...');
busComp(masterL, masterR, N, -7, 1.4, 30, 200);    // only catch the peaks
tapeGlue(masterL, masterR, N, 0.22);               // barely there — the 80s tape
                                                   // wash was part of "dated"
if (!NOFX.includes('air')) {
  shelfUp(masterL, N, 7000, 0.38);                 // air, to offset the dark tilt
  shelfUp(masterR, N, 7000, 0.38);
}

// ------------------------- master bus -------------------------
const A0 = START > 0 ? Math.min(N, Math.round(START * SR)) : 0;
const OUTN = CLIP > 0 ? Math.min(N - A0, Math.round(CLIP * SR)) : N - A0;
let peak = 0;
for (let i = A0; i < A0 + OUTN; i++) {
  const a = Math.abs(masterL[i]), b = Math.abs(masterR[i]);
  if (a > peak) peak = a;
  if (b > peak) peak = b;
}
const norm = peak > 0 ? 0.89 / peak : 1;
console.log(`peak before normalize = ${peak.toFixed(4)} -> gain ${norm.toFixed(4)}`);

// gentle soft-clip then scale
const wav = Buffer.alloc(44 + OUTN * 4);
for (let k = 0; k < OUTN; k++) {
  const i = A0 + k;
  let l = masterL[i] * norm, r = masterR[i] * norm;
  l = Math.tanh(l * 1.05) * 0.97;
  r = Math.tanh(r * 1.05) * 0.97;
  wav.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(l * 32767))), 44 + k * 4);
  wav.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(r * 32767))), 46 + k * 4);
}
wav.write('RIFF', 0, 'ascii');
wav.writeUInt32LE(36 + OUTN * 4, 4);
wav.write('WAVE', 8, 'ascii');
wav.write('fmt ', 12, 'ascii');
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(2, 22);
wav.writeUInt32LE(SR, 24); wav.writeUInt32LE(SR * 4, 28);
wav.writeUInt16LE(4, 32); wav.writeUInt16LE(16, 34);
wav.write('data', 36, 'ascii'); wav.writeUInt32LE(OUTN * 4, 40);

const outPath = process.env.SP_OUT
  ? path.resolve(process.env.SP_OUT)
  : path.join(require('./paths').OUT, 'midnight_signal.wav');
let written = outPath;
try {
  fs.writeFileSync(outPath, wav);
} catch (e) {
  // the file is probably open in a player — fall back to a fresh name
  written = path.join(require('./paths').OUT, `midnight_signal_${Date.now() % 100000}.wav`);
  fs.writeFileSync(written, wav);
  console.log(`(primary output busy: ${e.code}) — wrote fallback instead`);
}
console.log(`wrote ${written}  ${(wav.length / 1048576).toFixed(1)} MB  in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
