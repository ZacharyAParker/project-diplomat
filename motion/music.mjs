// writes the trailer's score to public/music.wav. it's synthesised here from scratch, so there's
// nothing to license: strings, a piano, a glockenspiel, timpani and a bit of reverb, in D minor,
// with every hit put on a cut or on something appearing in Trailer.tsx.
// run with `node music.mjs`, `pnpm render` runs it first
import {writeFileSync, mkdirSync} from 'node:fs';

const RATE = 44100;
const FPS = 30;
const LENGTH = 1570 / FPS + 0.2;
const N = Math.ceil(LENGTH * RATE);
const L = new Float32Array(N);
const R = new Float32Array(N);

// where each scene starts, in seconds, the same lengths as S in Trailer.tsx
const at = {cold: 0, title: 290, desk: 410, forms: 650, world: 880, director: 1040, archive: 1260, end: 1400};
for (const k in at) at[k] /= FPS;
const fr = (frames) => frames / FPS;

const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);
// a seeded random, so the noise is the same every render
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;

// adds one note made of partials. env(t) gives the loudness at t seconds into the note
const voice = ({t0, dur, partials, env, pan = 0, gain = 1, vibrato = 0, glide}) => {
  const start = Math.max(0, Math.floor(t0 * RATE));
  const end = Math.min(N, Math.floor((t0 + dur) * RATE));
  const lg = Math.cos(((pan + 1) * Math.PI) / 4) * gain;
  const rg = Math.sin(((pan + 1) * Math.PI) / 4) * gain;
  const phase = partials.map(() => (rnd() + 1) * 3.14);
  for (let i = start; i < end; i++) {
    const t = (i - start) / RATE;
    const e = env(t);
    if (e < 1e-5) continue;
    const bend = (glide ? glide(t) : 1) * (1 + vibrato * Math.sin(2 * Math.PI * 5.2 * t));
    let s = 0;
    for (let p = 0; p < partials.length; p++) {
      const [f, a, decay = 0] = partials[p];
      phase[p] += (2 * Math.PI * f * bend) / RATE;
      s += a * Math.sin(phase[p]) * (decay ? Math.exp(-t / decay) : 1);
    }
    L[i] += s * e * lg;
    R[i] += s * e * rg;
  }
};

const adsr = (a, d, sus, rel, dur) => (t) => {
  if (t < a) return t / a;
  if (t < a + d) return 1 - (1 - sus) * ((t - a) / d);
  if (t < dur - rel) return sus;
  return Math.max(0, sus * (1 - (t - (dur - rel)) / rel));
};
const pluck = (tau) => (t) => (t < 0.004 ? t / 0.004 : Math.exp(-t / tau));

// the instruments
const pad = (midi, t0, dur, gain = 0.05, pan = 0) => {
  for (const det of [-0.12, 0.12]) {
    const f = hz(midi + det);
    voice({t0, dur, pan: pan + det * 4, gain, vibrato: 0.002, env: adsr(0.8, 0.5, 0.8, 1.2, dur), partials: [1, 2, 3, 4, 5, 6].map((n) => [f * n, 1 / n ** 1.4])});
  }
};
const brass = (midi, t0, dur, gain = 0.05, pan = 0) =>
  voice({t0, dur, pan, gain, vibrato: 0.003, env: adsr(0.06, 0.4, 0.7, 1.4, dur), partials: [1, 2, 3, 4, 5, 6, 7, 8].map((n) => [hz(midi) * n, 1 / n ** 0.9, 2.5 / n])});
const piano = (midi, t0, gain = 0.12, pan = 0, ring = 2.4) =>
  voice({t0, dur: ring + 0.5, pan, gain, env: pluck(ring), partials: [1, 2, 3, 4, 5, 6, 7].map((n) => [hz(midi) * n * (1 + 0.0004 * n * n), 1 / n ** 1.5, ring / n])});
const stab = (midi, t0, gain = 0.07, pan = 0) =>
  voice({t0, dur: 0.3, pan, gain, env: pluck(0.07), partials: [1, 2, 3, 4, 5].map((n) => [hz(midi) * n, 1 / n])});
const pizz = (midi, t0, gain = 0.16, pan = 0) =>
  voice({t0, dur: 0.6, pan, gain, env: pluck(0.16), partials: [1, 2, 3, 4].map((n) => [hz(midi) * n, 1 / n ** 1.8])});
const glock = (midi, t0, gain = 0.07, pan = 0.2) =>
  voice({t0, dur: 2.2, pan, gain, env: pluck(0.9), partials: [[hz(midi), 1], [hz(midi) * 2.76, 0.4, 0.25], [hz(midi) * 5.4, 0.2, 0.1]]});
const boom = (t0, gain = 0.5) => {
  voice({t0, dur: 2.2, gain, env: pluck(0.6), glide: (t) => 1 + 0.9 * Math.exp(-t / 0.04), partials: [[49, 1], [98, 0.35, 0.3], [147, 0.15, 0.15]]});
  noise(t0, 0.35, gain * 0.25, 0.04, 0.15);
};
const kick = (t0, gain = 0.28) => voice({t0, dur: 0.35, gain, env: pluck(0.1), glide: (t) => 1 + 1.6 * Math.exp(-t / 0.02), partials: [[52, 1]]});
const tick = (t0, gain = 0.03, pan = 0.3) => noise(t0, 0.06, gain, 0.6, 0.015, pan);
// filtered noise: smooth is 0 (bright) to near 1 (dark). swell makes it rise instead of fall
function noise(t0, dur, gain, smooth, tau, pan = 0, swell = false) {
  const start = Math.floor(t0 * RATE);
  const end = Math.min(N, Math.floor((t0 + dur) * RATE));
  let y = 0;
  for (let i = start; i < end; i++) {
    const t = (i - start) / RATE;
    const e = swell ? (t / dur) ** 2.5 : Math.exp(-t / tau);
    y = smooth * y + (1 - smooth) * rnd();
    L[i] += y * e * gain * (1 - pan) * (swell ? 1 : 3);
    R[i] += y * e * gain * (1 + pan) * (swell ? 1 : 3);
  }
}

const CHORDS = {
  Dm: [38, [50, 57, 62, 65, 69]],
  Bb: [34, [46, 53, 58, 62, 65]],
  F: [41, [48, 53, 57, 60, 65]],
  C: [36, [48, 55, 60, 64, 67]],
  Gm: [43, [50, 55, 58, 62, 67]],
  A: [45, [49, 57, 61, 64, 69]],
  D: [38, [50, 57, 62, 66, 69]],
};
const chordPad = (name, t0, dur, gain = 0.035) => CHORDS[name][1].forEach((m, i) => pad(m, t0, dur, gain, (i - 2) * 0.25));
const chordBrass = (name, t0, dur, gain = 0.045) => {
  const [bass, notes] = CHORDS[name];
  brass(bass, t0, dur, gain * 1.4);
  notes.slice(0, 4).forEach((m, i) => brass(m, t0, dur, gain, (i - 1.5) * 0.3));
};
// strings playing eighths on the chord's root and octave
const pulse = (name, t0, t1, eighth, gain = 0.06) => {
  const [bass] = CHORDS[name];
  for (let t = t0, k = 0; t < t1 - 0.01; t += eighth, k++) stab(bass + 12 + (k % 2 ? 12 : 0), t, gain * (k % 2 ? 0.7 : 1), k % 2 ? 0.3 : -0.3);
};

// the beat everything rhythmic runs on: 16 frames, the same step the forms light up on
const BEAT = fr(16);
const E = BEAT / 2;

// cold open: a low drone under the lines, a piano note as each speaker comes in, and a swell
// into the title
{
  const t = at.cold;
  pad(26, t, at.title + 0.6, 0.05);
  pad(33, t + 1, at.title - 0.4, 0.035);
  piano(62, t + fr(10), 0.13, -0.2);
  piano(57, t + fr(10), 0.08, -0.2);
  piano(65, t + fr(85), 0.12, 0.2);
  piano(46, t + fr(155), 0.12, -0.1, 3.2);
  piano(58, t + fr(155), 0.08, -0.1, 3.2);
  piano(57, t + fr(210), 0.11, 0.15);
  piano(64, t + fr(210), 0.09, 0.15);
  noise(at.title - 2.2, 2.2, 0.06, 0.92, 0, 0, true);
  for (let x = at.title - 1.6; x < at.title - 0.05; x += 0.09) voice({t0: x, dur: 0.4, gain: 0.03 + 0.12 * (1 - (at.title - x) / 1.6), env: pluck(0.12), partials: [[73, 1], [146, 0.3]]});
}

// title: the first hit, a held chord and a bell on "game"
{
  const t = at.title;
  boom(t, 0.55);
  chordBrass('Dm', t, 3.6, 0.05);
  chordPad('Dm', t, 4.2);
  glock(74, t + fr(14), 0.08);
  glock(81, t + fr(30), 0.05);
  piano(69, t + 2.2, 0.08, 0.1);
  piano(65, t + 2.7, 0.07, -0.1);
  noise(at.desk - 1, 1, 0.04, 0.9, 0, 0, true);
}

// desk: the pulse starts, and the chord moves on as each body finishes with the petition. it
// all drops away on "then it's on you"
{
  const t = at.desk;
  const steps = [0, 20, 60, 100, 140, 175].map((f) => t + fr(f));
  const names = ['Dm', 'Dm', 'Bb', 'Gm', 'A', 'Dm'];
  const stop = t + fr(205);
  boom(t, 0.3);
  names.forEach((name, i) => {
    const end = i + 1 < steps.length ? steps[i + 1] : stop;
    pulse(name, steps[i], end, E, 0.055);
    chordPad(name, steps[i], end - steps[i] + 0.4, 0.028);
    if (i > 0) glock(CHORDS[name][1][4] + 12, steps[i], 0.06, i % 2 ? 0.3 : -0.3);
  });
  for (let x = t; x < stop - 0.01; x += BEAT) kick(x, 0.2);
  brass(38, steps[5], stop - steps[5] + 0.3, 0.06);
  boom(steps[5], 0.25);
  piano(74, stop, 0.12, 0, 3);
  pad(50, stop, at.forms - stop + 0.3, 0.04);
  noise(at.forms - 0.9, 0.9, 0.05, 0.85, 0, 0, true);
}

// forms: a bigger pulse with a kick under it, and a glockenspiel climbing the scale, one note
// for each form as it lights up
{
  const t = at.forms;
  const lit = t + fr(60);
  const calm = t + fr(170);
  boom(t, 0.45);
  chordBrass('F', t, 1.6, 0.04);
  pulse('F', t, lit, E, 0.06);
  const run = ['Dm', 'Dm', 'Bb', 'Bb', 'C', 'C', 'Dm', 'Dm'];
  [74, 76, 77, 79, 81, 82, 84, 86].forEach((m, i) => {
    const x = lit + i * BEAT;
    glock(m, x, 0.07, -0.4 + i * 0.1);
    if (i % 2 === 0) chordPad(run[i], x, BEAT * 2 + 0.3, 0.026);
    pulse(run[i], x, Math.min(x + BEAT, calm), E, 0.06);
  });
  for (let x = t; x < calm - 0.01; x += BEAT) kick(x, 0.24);
  for (let x = t + E; x < calm - 0.01; x += BEAT) tick(x, 0.025);
  chordPad('Bb', calm, at.world - calm + 0.6, 0.032);
  piano(70, calm, 0.1, 0.1, 3);
  piano(62, calm + BEAT, 0.07, -0.1, 3);
}

// world: lighter. a piano going round the chords under the newspapers
{
  const t = at.world;
  const prog = ['Bb', 'F', 'C', 'Dm'];
  const bar = (at.director - t) / prog.length;
  prog.forEach((name, i) => {
    const x = t + i * bar;
    chordPad(name, x, bar + 0.4, 0.026);
    const notes = CHORDS[name][1];
    for (let k = 0; x + k * E < x + bar - 0.01; k++) piano(notes[[0, 2, 3, 4, 3, 2][k % 6]] + 12, x + k * E, 0.055, (k % 3) * 0.2 - 0.2, 1.2);
    pizz(CHORDS[name][0] + 12, x, 0.14);
  });
  glock(81, t + fr(12), 0.05);
}

// director: out of character, so the music goes small and a little cheeky. plucked bass and a
// tick, a slide up whistle on "set liberty to 90", and a two-note sting on the sandbox tag
{
  const t = at.director;
  const walk = [38, 41, 45, 48, 43, 46, 50, 46, 38, 41, 45, 48, 43, 46, 45, 44];
  walk.forEach((m, i) => {
    const x = t + i * BEAT;
    if (x < at.archive - 0.1) pizz(m, x, 0.17, -0.15);
  });
  for (let x = t + E; x < at.archive - 0.1; x += BEAT) tick(x, 0.022, 0.4);
  chordPad('Dm', t, 3.6, 0.022);
  chordPad('Gm', t + 3.6, at.archive - t - 3.6 + 0.3, 0.022);
  piano(69, t + fr(54), 0.07, 0.3, 1.6);
  piano(72, t + fr(54) + E, 0.06, 0.3, 1.6);
  voice({t0: t + fr(128), dur: 0.7, gain: 0.05, pan: 0.3, env: adsr(0.03, 0.1, 0.8, 0.25, 0.7), vibrato: 0.01, glide: (x) => 1 + x * 1.3, partials: [[hz(81), 1], [hz(93), 0.15]]});
  glock(86, t + fr(180), 0.07);
  glock(81, t + fr(180) + E, 0.06);
  noise(at.archive - 0.7, 0.7, 0.05, 0.85, 0, 0, true);
}

// archive: an arpeggio climbing while the count goes up, landing on the dominant when it stops
{
  const t = at.archive;
  const up = [38, 45, 50, 53, 57, 62, 65, 69, 74, 77, 81, 86];
  const from = t + fr(10);
  const to = t + fr(80);
  up.forEach((m, i) => {
    const p = i / (up.length - 1);
    piano(m, from + (to - from) * p ** 0.8, 0.06 + 0.05 * p, -0.4 + p * 0.8, 1.4);
  });
  pad(38, t, fr(80) + 0.3, 0.04);
  noise(t, fr(80), 0.07, 0.88, 0, 0, true);
  boom(to, 0.45);
  chordBrass('A', to, at.end - to + 0.3, 0.045);
  chordPad('A', to, at.end - to + 0.5, 0.03);
  glock(85, to, 0.06);
}

// end card: the hit everything has been leading to, D major not minor, left to ring out
{
  const t = at.end;
  const dur = LENGTH - t;
  boom(t, 0.6);
  chordBrass('D', t, dur, 0.055);
  chordPad('D', t, dur, 0.035);
  pad(26, t, dur, 0.05);
  [74, 78, 81, 86].forEach((m, i) => glock(m, t + fr(8) + i * 0.12, 0.06, -0.3 + i * 0.2));
  piano(62, t + fr(20), 0.09, 0, 3);
  piano(66, t + fr(32), 0.08, 0, 3);
}

// a plain Schroeder reverb, a little different on each side
const reverb = (x, combs, passes, mix) => {
  const wet = new Float32Array(x.length);
  for (const [ms, g] of combs) {
    const d = Math.round((ms / 1000) * RATE);
    const buf = new Float32Array(d);
    let lp = 0;
    for (let i = 0, j = 0; i < x.length; i++, j = (j + 1) % d) {
      const y = buf[j];
      lp = 0.7 * y + 0.3 * lp;
      buf[j] = x[i] + lp * g;
      wet[i] += y / combs.length;
    }
  }
  for (const ms of passes) {
    const d = Math.round((ms / 1000) * RATE);
    const buf = new Float32Array(d);
    for (let i = 0, j = 0; i < x.length; i++, j = (j + 1) % d) {
      const b = buf[j];
      const y = -0.7 * wet[i] + b;
      buf[j] = wet[i] + 0.7 * y;
      wet[i] = y;
    }
  }
  for (let i = 0; i < x.length; i++) x[i] = x[i] * (1 - mix) + wet[i] * mix * 1.6;
};
reverb(L, [[29.7, 0.84], [37.1, 0.83], [41.1, 0.82], [43.7, 0.81]], [5.0, 1.7], 0.3);
reverb(R, [[30.9, 0.84], [36.3, 0.83], [42.3, 0.82], [45.1, 0.81]], [5.3, 1.9], 0.3);

// fade the last half second, bring the peak to about -1 dB and round off anything over it
let peak = 0;
for (let i = 0; i < N; i++) {
  const fade = Math.min(1, (LENGTH - i / RATE) / 0.6);
  L[i] *= fade;
  R[i] *= fade;
  peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
}
// the loud hits are rounded off by the tanh below, so the rest can sit nearer the level of a trailer
const norm = 2.2 / peak;
const wav = Buffer.alloc(44 + N * 4);
wav.write('RIFF', 0);
wav.writeUInt32LE(36 + N * 4, 4);
wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(2, 22);
wav.writeUInt32LE(RATE, 24);
wav.writeUInt32LE(RATE * 4, 28);
wav.writeUInt16LE(4, 32);
wav.writeUInt16LE(16, 34);
wav.write('data', 36);
wav.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) {
  wav.writeInt16LE(Math.round(Math.tanh(L[i] * norm) * 0.8 * 32767), 44 + i * 4);
  wav.writeInt16LE(Math.round(Math.tanh(R[i] * norm) * 0.8 * 32767), 46 + i * 4);
}
mkdirSync('public', {recursive: true});
writeFileSync('public/music.wav', wav);
console.log(`public/music.wav, ${LENGTH.toFixed(1)}s`);
