#!/usr/bin/env node
// Writes the 20 synthetic silence and noise controls (§8); every one must read as "Couldn't hear you".
import path from 'node:path';
import { FIXTURE_DIR, pcmToFlac16k, sha1, writeJson } from './lib.mjs';

const RATE = 16000;
const SECONDS = 1.5;

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const db = (d) => 10 ** (d / 20);
const blank = () => new Float32Array(Math.round(RATE * SECONDS));

function white(rand, gain) {
  const out = blank();
  for (let i = 0; i < out.length; i++) out[i] = (rand() * 2 - 1) * gain;
  return out;
}

/** Leaky-integrated white noise: the low rumble of a classroom or HVAC. */
function brown(rand, gain) {
  const out = blank();
  let v = 0;
  for (let i = 0; i < out.length; i++) {
    v = 0.98 * v + (rand() * 2 - 1) * 0.2;
    out[i] = v * gain;
  }
  return out;
}

function hum(rand, gain, hz) {
  const out = brown(rand, gain * 0.3);
  for (let i = 0; i < out.length; i++)
    out[i] +=
      gain *
      (Math.sin((2 * Math.PI * hz * i) / RATE) +
        0.4 * Math.sin((4 * Math.PI * hz * i) / RATE));
  return out;
}

/** A cough: a sharp-attack burst of band-limited noise that decays over ~250 ms. */
function cough(rand, gain, at, count) {
  const out = brown(rand, db(-55));
  for (let c = 0; c < count; c++) {
    const start = Math.round(RATE * (at + c * 0.35));
    let lp = 0;
    for (let i = 0; i < RATE * 0.3 && start + i < out.length; i++) {
      const env =
        Math.min(1, i / (RATE * 0.008)) * Math.exp(-i / (RATE * 0.07));
      lp = 0.6 * lp + 0.4 * (rand() * 2 - 1);
      out[start + i] += lp * env * gain;
    }
  }
  return out;
}

/** An overdriven input: loud noise or a tone pinned at full scale. */
function clipped(rand, kind) {
  const out = kind === 'noise' ? white(rand, 4) : blank();
  if (kind !== 'noise') {
    for (let i = 0; i < out.length; i++)
      out[i] =
        3 * Math.sin((2 * Math.PI * (kind === 'low' ? 120 : 900) * i) / RATE);
  }
  for (let i = 0; i < out.length; i++)
    out[i] = Math.max(-1, Math.min(1, out[i]));
  return out;
}

const controls = [
  ['silence-digital', () => blank()],
  ['silence-dither', (r) => white(r, db(-90))],
  ['silence-mic-floor', (r) => white(r, db(-70))],
  ['silence-dc-offset', () => blank().fill(0.02)],
  ['room-quiet', (r) => brown(r, db(-50))],
  ['room-hvac', (r) => brown(r, db(-35))],
  ['room-hiss', (r) => white(r, db(-40))],
  ['room-hum-60hz', (r) => hum(r, db(-35), 60)],
  ['room-hum-50hz', (r) => hum(r, db(-35), 50)],
  ['room-loud-hiss', (r) => white(r, db(-20))],
  ['cough-single', (r) => cough(r, db(-6), 0.4, 1)],
  ['cough-double', (r) => cough(r, db(-6), 0.3, 2)],
  ['cough-soft', (r) => cough(r, db(-20), 0.5, 1)],
  ['cough-triple', (r) => cough(r, db(-10), 0.2, 3)],
  ['cough-late', (r) => cough(r, db(-6), 1.1, 1)],
  ['clipped-noise', (r) => clipped(r, 'noise')],
  ['clipped-low-tone', (r) => clipped(r, 'low')],
  ['clipped-high-tone', (r) => clipped(r, 'high')],
  [
    'clipped-hum-burst',
    (r) => {
      const out = hum(r, 2, 60);
      for (let i = 0; i < out.length; i++)
        out[i] = Math.max(-1, Math.min(1, out[i]));
      return out;
    },
  ],
  [
    'tone-beep',
    () => {
      const out = blank();
      for (let i = RATE * 0.5; i < RATE * 0.8; i++)
        out[i] = 0.5 * Math.sin((2 * Math.PI * 1000 * i) / RATE);
      return out;
    },
  ],
];

const entries = [];
for (const [index, [id, make]] of controls.entries()) {
  const flac = `controls/${id}.flac`;
  const bytes = await pcmToFlac16k(
    make(mulberry32(1000 + index)),
    path.join(FIXTURE_DIR, flac)
  );
  entries.push({ id, flac, flacSha1: sha1(bytes) });
}
writeJson(path.join(FIXTURE_DIR, 'controls.json'), {
  version: 1,
  controls: entries,
});
console.log(`Wrote ${entries.length} controls.`);
