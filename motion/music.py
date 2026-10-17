"""The trailer's score.

    .venv-music/Scripts/python.exe music.py

That venv is this script's own (not the game's). Make it once:

    python -m venv .venv-music
    .venv-music/Scripts/python.exe -m pip install numpy tinysoundfont

Writes public/music.wav (48 kHz stereo, 16 bit) and src/grid.json: the tempo
and the frame every scene starts on. Trailer.tsx reads that file for its scene
lengths, so the cuts land on the bars and picture and sound share one clock.

The instruments are sampled ones, played from a SoundFont:

    GeneralUser GS v2.0.3, by S. Christian Collins
    https://www.schristiancollins.com/generaluser
    https://github.com/mrbumpy409/GeneralUser-GS
    GeneralUser GS License v2.0: "You may use GeneralUser GS without
    restriction for your own music creation, private or commercial."

It's 32 MB, so it isn't in git: this fetches it into public/ the first time,
with its licence text next to it. Only the sounds come from there. The notes,
the playing, the room and the mix are all below.

A small orchestra in D minor at 120 BPM, so a beat is exactly 15 frames at
30 fps and a bar is 60. It starts as a hush under the cold open, turns into a
state march for the desk and the forms, goes small and cheeky for the
director, and ends on D major.
"""
import json
import urllib.request
import wave
from pathlib import Path

import numpy as np
import tinysoundfont

SR = 48_000
FPS = 30
BPM = 120
BEAT = 60.0 / BPM            # seconds
BAR = BEAT * 4

# Where each scene starts, in bars. The picture cuts on these.
SECTIONS = [
    ("cold", 0),        # the lines from the Assembly and the Court, over strings and harp
    ("title", 5),       # the first hit, and the anthem in the horns
    ("desk", 7),        # a march while the petition goes round the bodies
    ("forms", 11),      # everything in, a note for each form of government
    ("world", 15),      # lighter: harp and flute under the papers
    ("director", 18),   # out of character, so bassoon and pizzicato
    ("archive", 22),    # a climb while the count goes up
    ("end", 25),        # D major, left to ring under the end card
    ("out", 28),
]
S = dict(SECTIONS)
BARS = S["out"]
TOTAL = BARS * BAR
N = int(round(TOTAL * SR))

HERE = Path(__file__).resolve().parent
public = HERE / "public"
SF2 = public / "GeneralUser-GS.sf2"
SOURCE = "https://github.com/mrbumpy409/GeneralUser-GS/raw/main/"
rng = np.random.default_rng(61)

public.mkdir(parents=True, exist_ok=True)
if not SF2.exists():
    print("fetching the soundfont (32 MB)...")
    urllib.request.urlretrieve(SOURCE + "GeneralUser-GS.sf2", SF2)
    urllib.request.urlretrieve(SOURCE + "documentation/LICENSE.txt", public / "GeneralUser-GS-LICENSE.txt")


# ── small tools ─────────────────────────────────────────────────────────────

def at(bar, beat=0.0):
    """Seconds to a beat (0-based) in a bar."""
    return (bar * 4 + beat) * BEAT


def db(x):
    return 20 * np.log10(max(float(x), 1e-9))


def gain(decibels):
    return 10 ** (decibels / 20)


def shape(x, curve):
    """Zero-phase EQ: multiply the spectrum by curve(frequencies). Mono or stereo."""
    x = np.atleast_2d(x)
    f = np.fft.rfftfreq(x.shape[1], 1 / SR)
    out = np.fft.irfft(np.fft.rfft(x, axis=1) * curve(f), x.shape[1], axis=1)
    return out if out.shape[0] > 1 else out[0]


def band(low=None, high=None, order=2):
    """A Butterworth-shaped high-pass at `low` and low-pass at `high`."""
    def curve(f):
        g = np.ones_like(f)
        if high is not None:
            g = g / np.sqrt(1 + (f / high) ** (2 * order))
        if low is not None:
            g = g / np.sqrt(1 + (low / np.maximum(f, 1e-9)) ** (2 * order))
        return g
    return curve


def bell(centre, decibels, width=1.0):
    """A boost or cut `width` octaves wide."""
    return lambda f: gain(decibels * np.exp(-0.5 * (np.log2(np.maximum(f, 1e-9) / centre) / (width / 2)) ** 2))


def shelf(corner, decibels):
    """A high shelf: nothing below the corner, `decibels` well above it."""
    return lambda f: gain(decibels * (1 - 1 / (1 + (f / corner) ** 2)))


def eq(x, *curves):
    return shape(x, lambda f: np.prod([c(f) for c in curves], axis=0))


def saturate(x, drive):
    """Quiet things pass as they are, loud things get rounded."""
    return np.tanh(x * drive) / drive


def edges(x, attack, release):
    a, r = int(attack * SR), int(release * SR)
    out = np.array(x, dtype=float)
    if a > 1:
        out[..., :a] *= 0.5 - 0.5 * np.cos(np.pi * np.arange(a) / a)
    if r > 1:
        out[..., -r:] *= 0.5 + 0.5 * np.cos(np.pi * np.arange(r) / r)
    return out


def human(spread=0.006):
    """Nobody in an orchestra lands exactly on the grid."""
    return float(rng.normal(0, spread))


def vel(v, spread=5):
    return int(np.clip(v + rng.integers(-spread, spread + 1), 1, 127))


class Stem:
    """A stereo track things get dropped onto."""

    def __init__(self):
        self.audio = np.zeros((2, N))

    def add(self, seconds, sound, level=1.0, pan=0.0):
        """`sound` is mono or (2, n). pan runs -1 left to 1 right."""
        start = int(round(seconds * SR))
        if start >= N or start < 0:
            return
        sound = np.atleast_2d(sound)
        n = min(sound.shape[1], N - start)
        if sound.shape[0] == 1:
            angle = (pan + 1) * np.pi / 4
            self.audio[0, start:start + n] += sound[0, :n] * level * np.cos(angle) * np.sqrt(2)
            self.audio[1, start:start + n] += sound[0, :n] * level * np.sin(angle) * np.sqrt(2)
        else:
            self.audio[:, start:start + n] += sound[:, :n] * level


# ── the sampler ─────────────────────────────────────────────────────────────

def play(preset, notes, bank=0, bends=()):
    """Play (start seconds, length seconds, key, velocity) notes on one
    instrument and return the stereo recording. `bends` are (seconds, value)
    pitch-wheel moves, 8192 being the middle."""
    synth = tinysoundfont.Synth(samplerate=SR, gain=0)
    synth.program_select(0, synth.sfload(str(SF2)), bank, preset)
    if bends:
        synth.pitchbend_range(0, 12)
    # a key struck again while it's still down lets go first
    held, tidy = {}, []
    for start, length, key, velocity in sorted(notes):
        start = max(start, 0.0)
        if key in held and tidy[held[key]][1] > start - 0.012:
            tidy[held[key]][1] = start - 0.012
        held[key] = len(tidy)
        tidy.append([start, start + length, key, int(np.clip(velocity, 1, 127))])
    events = [(int(s * SR), 1, k, v) for s, e, k, v in tidy] + [(int(e * SR), 0, k, 0) for s, e, k, v in tidy]
    events += [(int(s * SR), 2, int(v), 0) for s, v in bends]
    events.sort(key=lambda event: (event[0], event[1] != 2, event[1]))
    out = np.zeros((N, 2), dtype=np.float32)
    position = 0
    for when, kind, key, velocity in events:
        when = min(when, N)
        if when > position:
            out[position:when] = np.frombuffer(synth.generate(when - position), dtype=np.float32).reshape(-1, 2)
            position = when
        if position >= N:
            break
        if kind == 2:
            synth.pitchbend(0, key)
        elif kind == 1:
            synth.noteon(0, key, velocity)
        else:
            synth.noteoff(0, key)
    if position < N:
        out[position:] = np.frombuffer(synth.generate(N - position), dtype=np.float32).reshape(-1, 2)
    return out.T.astype(float)


_kit, _shots = None, {}


def shot(key, velocity, seconds=4.0):
    """One hit from the orchestral kit, recorded on its own (and kept)."""
    global _kit
    velocity = int(np.clip(velocity, 1, 127))
    if (key, velocity) not in _shots:
        if _kit is None:
            _kit = tinysoundfont.Synth(samplerate=SR, gain=0)
            _kit.program_select(9, _kit.sfload(str(SF2)), 128, 48, True)
        _kit.sounds_off()
        _kit.generate(512)
        _kit.noteon(9, key, velocity)
        a = np.frombuffer(_kit.generate(int(0.2 * SR)), dtype=np.float32).reshape(-1, 2).mean(axis=1)
        _kit.noteoff(9, key)
        b = np.frombuffer(_kit.generate(int((seconds - 0.2) * SR)), dtype=np.float32).reshape(-1, 2).mean(axis=1)
        _shots[(key, velocity)] = edges(np.concatenate([a, b]).astype(float), 0, 0.08)
    return _shots[(key, velocity)]


# The orchestral kit: which key, and how loud it sits.
KIT = {
    "bassdrum": (36, 0.0),
    "snare": (38, -4.0),
    "snare2": (40, -6.0),
    "cymbal": (57, -3.0),
    "suspended": (59, -6.0),
}
drums = Stem()


def drum(seconds, name, velocity, pan=0.0):
    key, level = KIT[name]
    drums.add(seconds + human(0.003), shot(key, vel(velocity, 4)), gain(level), pan)


def roll(start, end, name="snare", soft=30, loud=100, rate=8, pan=0.1):
    """A roll: strokes `rate` to a beat, getting louder."""
    count = int(round((end - start) / (BEAT / rate)))
    for i in range(count):
        p = i / max(count - 1, 1)
        drum(start + i * BEAT / rate, name, soft + (loud - soft) * p ** 1.6, pan)


# ── the tune ────────────────────────────────────────────────────────────────

# chords: a bass note, the strings' voicing, and the brass's
CHORDS = {
    "Dm": (38, [50, 57, 62, 65], [57, 62, 65, 69]),
    "Bb": (34, [50, 53, 58, 62], [58, 62, 65, 70]),
    "Gm": (43, [50, 55, 58, 62], [55, 58, 62, 67]),
    "A": (45, [49, 52, 57, 61], [57, 61, 64, 69]),
    "F": (41, [48, 53, 57, 60], [57, 60, 65, 69]),
    "C": (36, [48, 52, 55, 60], [55, 60, 64, 67]),
    "D": (38, [50, 57, 62, 66], [57, 62, 66, 69]),
}

slow, fast, tremolo, pizz, harp = [], [], [], [], []
brass, horns, trumpet, tuba = [], [], [], []
flute, clarinet, bassoon, whistle = [], [], [], []
glock, timpani, choir, swells = [], [], [], []
whistle_bends = []


def note(part, bar, beat, beats, key, velocity, late=0.0, spread=0.006):
    part.append((at(bar, beat) + late + human(spread), beats * BEAT, key, vel(velocity)))


def hold(part, bar, beats, keys, velocity, beat=0.0):
    for key in keys:
        note(part, bar, beat, beats, key, velocity, -0.04)


def rolled(part, bar, beat, beats, keys, velocity, strum=0.035):
    """A chord spread upwards, the way a harp plays one."""
    for i, key in enumerate(sorted(keys)):
        part.append((at(bar, beat) + i * strum * rng.uniform(0.8, 1.2), beats * BEAT, key, vel(velocity)))


def swell(bar, velocity=80):
    """A cymbal running backwards into the downbeat of `bar`."""
    swells.append((at(bar) - 1.09, 1.13, 60, velocity))


def march(bar, level=1.0, fill=False):
    """The drum part: bass drum on one and three, the snare on the beats with
    a pickup into four, and a roll into the next bar when asked."""
    drum(at(bar, 0), "bassdrum", 96 * level)
    drum(at(bar, 2), "bassdrum", 84 * level)
    for beat in (1, 3):
        drum(at(bar, beat), "snare", 88 * level, 0.15)
    for beat in (0.5, 2.5, 2.75):
        drum(at(bar, beat), "snare2", 58 * level, 0.15)
    if fill:
        roll(at(bar, 3), at(bar + 1), soft=50 * level, loud=104 * level)


def strings_march(bar, name, level=1.0):
    """Short strings on the off-beats and the bass on the beats."""
    root, voicing, _ = CHORDS[name]
    for beat in range(4):
        note(pizz, bar, beat, 0.5, root + (12 if beat % 2 else 0), 92 * level)
        for key in voicing[1:]:
            note(fast, bar, beat + 0.5, 0.3, key, 72 * level, 0.004)
    note(tuba, bar, 0, 1.6, root, 84 * level)
    note(tuba, bar, 2, 1.6, root + 7 if root + 7 < 50 else root - 5, 76 * level)


def timp(bar, beat, key, velocity, beats=1.5):
    note(timpani, bar, beat, beats, key, velocity, 0.002, 0.003)


# cold open: strings held very low under the lines, a harp chord as each
# speaker comes in, the timpani under the Court, and a roll into the title
c = S["cold"]
hold(slow, c, 16, [38, 45], 54)
hold(slow, c + 2, 8, [50, 57], 40)
rolled(harp, c, 1, 8, [50, 57, 62, 65], 62)            # the Deputy Speaker, frame 15
rolled(harp, c + 1, 2, 8, [46, 53, 58, 62], 58)        # Lirien Ashlar, frame 90
timp(c + 2, 3, 38, 86, 3)                              # the High Court: barred, frame 165
hold(slow, c + 2, 3, [34, 46], 62, 3)
rolled(harp, c + 3, 3, 4, [45, 52, 57, 61], 60)        # the Clerk, frame 225
roll(at(c + 4), at(c + 5), soft=18, loud=96, rate=6)
for i in range(12):
    note(timpani, c + 4, i / 3, 0.4, 45, 40 + i * 6, 0, 0.002)
swell(S["title"], 92)
hold(horns, c + 4, 4, [57], 48)

# title: the hit, the chord and the anthem in the horns
t = S["title"]
drum(at(t), "cymbal", 112)
drum(at(t), "bassdrum", 118)
timp(t, 0, 38, 118, 3)
hold(brass, t, 7.5, CHORDS["Dm"][2], 100)
hold(tremolo, t, 8, CHORDS["Dm"][1], 84)
hold(tuba, t, 7.5, [38], 92)
for beat, key, beats in ((0, 62, 1), (1, 65, 1), (2, 69, 2), (4, 67, 1), (5, 65, 1), (6, 64, 0.9), (7, 62, 0.9)):
    note(horns, t + beat // 4, beat % 4, beats, key, 100)
glock.append((at(t, 1) + 0.01, 1.5, 86, 96))
timp(t + 1, 3, 45, 90, 0.5)
drum(at(t + 1, 3.5), "snare", 92)

# desk: the march, the chord moving on as each body is done with the
# petition, a bell for each step, and everything stops on "then it's on you"
d = S["desk"]
for i, name in enumerate(["Dm", "Bb", "Gm"]):
    strings_march(d + i, name)
    march(d + i, fill=(i == 2))
    hold(slow, d + i, 4, CHORDS[name][1], 58)
for bar, beat, key in ((0, 2, 81), (1, 0, 82), (1, 2, 79), (2, 0, 79), (2, 2, 85)):   # frames 30, 60, 90, 120, 150
    glock.append((at(d + bar, beat) + 0.01, 1.4, key, 92))
note(trumpet, d + 2, 2, 2, 69, 96)
drum(at(d + 3), "suspended", 70)
hold(horns, d + 3, 4, [57, 61], 74)
hold(slow, d + 3, 4, [45, 57], 56)
timp(d + 3, 2, 45, 70, 0.5)
timp(d + 3, 3, 45, 80, 0.5)
roll(at(d + 3, 2), at(d + 4), soft=30, loud=104)
swell(S["forms"], 84)

# forms: everything in. the anthem again in the brass, and the glockenspiel
# climbs the scale, one note as each form lights up from frame 60
f = S["forms"]
drum(at(f), "cymbal", 108)
for i, name in enumerate(["Dm", "Bb", "C"]):
    strings_march(f + i, name, 1.1)
    march(f + i, 1.1, fill=(i == 2))
    hold(brass, f + i, 4, CHORDS[name][2], 86)
    timp(f + i, 0, CHORDS[name][0] + (12 if CHORDS[name][0] < 41 else 0), 100)
    timp(f + i, 2, CHORDS[name][0] + (12 if CHORDS[name][0] < 41 else 0), 84)
melody = [(0, 62, 1), (1, 65, 1), (2, 69, 1.5), (3.5, 70, 0.5), (4, 70, 1), (5, 69, 1), (6, 67, 1), (7, 65, 1),
          (8, 64, 1), (9, 67, 1), (10, 72, 2)]
for beat, key, beats in melody:
    note(horns, f + beat // 4, beat % 4, beats, key, 104)
    note(trumpet, f + beat // 4, beat % 4, beats * 0.9, key + 12, 78)
for i, key in enumerate([74, 76, 77, 79, 81, 82, 84, 86]):
    glock.append((at(f + 1, i) + 0.008, 1.6, key, 100))
hold(slow, f + 3, 4.5, CHORDS["F"][1], 66)                # "Claudetopia's is just one of them", frame 180
rolled(harp, f + 3, 0, 4, [53, 57, 60, 65, 69], 70)
note(horns, f + 3, 0, 3.5, 69, 70)

# world: lighter. harp going round the chords, pizzicato, and the flute
w = S["world"]
for i, name in enumerate(["Bb", "F", "C"]):
    root, voicing, _ = CHORDS[name]
    hold(slow, w + i, 4, voicing, 54)
    for step in range(8):
        note(harp, w + i, step / 2, 1.5, (voicing + [k + 12 for k in voicing])[[0, 1, 2, 3, 4, 3, 2, 1][step]], 64, 0, 0.004)
    note(pizz, w + i, 0, 0.5, root + 12, 80)
    note(pizz, w + i, 2, 0.5, root + 19 if root + 19 < 62 else root + 7, 72)
for beat, key, beats in ((0, 77, 1.5), (1.5, 74, 0.5), (2, 72, 2), (4, 72, 1), (5, 74, 1), (6, 77, 2),
                         (8, 79, 1.5), (9.5, 77, 0.5), (10, 76, 2)):
    note(flute, w + beat // 4, beat % 4, beats, key, 82)
drum(at(w + 2, 3), "snare2", 50)

# director: out of character, so the orchestra goes small. bassoon walking,
# pizzicato on the off-beats, a whistle sliding up on "set liberty to 90" and
# a two-note sting on the sandbox tag
r = S["director"]
walk = [38, 41, 45, 48, 43, 46, 50, 46, 38, 41, 45, 49, 45, 44, 45, 33]
for i, key in enumerate(walk):
    note(bassoon, r + i // 4, i % 4, 0.55, key + 12, 88, 0.006)
for bar, name in enumerate(["Dm", "Gm", "Dm", "A"]):
    for beat in (0.5, 1.5, 2.5, 3.5):
        for key in CHORDS[name][1][1:3]:
            note(pizz, r + bar, beat, 0.3, key + 12, 64, 0.01)
for beat, key in ((1, 74), (1.5, 77), (2, 76), (3, 74)):
    note(clarinet, r + 1, beat, 0.45, key, 76)                     # under the reply, frame 60
whistle.append((at(r + 2, 0.2), 1.2, 79, 96))                         # the cheat, frame 123
whistle_bends.extend((at(r + 2, 0.2) + i * 0.02, int(8192 + 8191 * min(1, (i / 26) ** 1.6))) for i in range(30))
whistle_bends.append((at(r + 2, 3), 8192))
glock.append((at(r + 3) + 0.01, 1.4, 86, 100))                       # the tag, frame 180
glock.append((at(r + 3, 0.5) + 0.01, 1.8, 81, 92))
drum(at(r + 3, 3.5), "snare2", 60)

# archive: a climb on the harp and the strings while the count goes up to
# 801, and the dominant lands with it on the next bar
a = S["archive"]
climb = [38, 45, 50, 53, 57, 62, 65, 69, 74, 77, 81, 86, 89, 93, 98, 101]
for i, key in enumerate(climb):
    harp.append((at(a, i / 4) + human(0.003), 1.6, key - 12 if key > 96 else key, vel(56 + i * 3)))
    if i % 2 == 0:
        note(fast, a, i / 4, 0.4, key - 12 if key - 12 >= 45 else key, 60 + i * 3, 0, 0.003)
roll(at(a), at(a + 1), soft=22, loud=100, rate=6)
swell(a + 1, 74)
drum(at(a + 1), "cymbal", 104)
drum(at(a + 1), "bassdrum", 112)
timp(a + 1, 0, 45, 112, 2)
hold(brass, a + 1, 8, CHORDS["A"][2], 88)
hold(tremolo, a + 1, 8, CHORDS["A"][1], 80)
hold(tuba, a + 1, 8, [33], 80)
note(horns, a + 1, 0, 3, 64, 96)
note(horns, a + 1, 3, 1, 67, 92)
note(horns, a + 2, 0, 4, 69, 98)
for i in range(16):
    note(timpani, a + 2, 2 + i / 8, 0.2, 45, 50 + i * 4, 0, 0.002)
swell(S["end"], 96)

# end card: D major, everyone, and the room left to ring
e = S["end"]
drum(at(e), "cymbal", 124)
drum(at(e), "suspended", 96)
drum(at(e), "bassdrum", 127)
timp(e, 0, 38, 124, 4)
hold(brass, e, 10, CHORDS["D"][2], 108)
hold(horns, e, 10, [62, 66, 69], 104)
hold(trumpet, e, 9, [74, 78], 92)
hold(tremolo, e, 11, CHORDS["D"][1] + [74], 92)
hold(slow, e, 12, [38, 50], 80)
hold(tuba, e, 10, [26, 38], 100)
hold(choir, e, 11, [62, 66, 69, 74], 78)
for i, key in enumerate([74, 78, 81, 86, 90]):
    glock.append((at(e, 0.25 + i * 0.25), 2.4, key, vel(100 - i * 6)))
rolled(harp, e, 0, 8, [38, 45, 50, 54, 57, 62, 66, 69, 74], 84, 0.03)


# ── play it ─────────────────────────────────────────────────────────────────

print("playing the orchestra...")
strings = (play(49, slow) * gain(-1) + play(48, fast) * gain(-4) + play(44, tremolo) * gain(-3)
           + play(45, pizz) * gain(-2))
low = play(58, tuba)
winds = play(73, flute) + play(71, clarinet) * gain(-1) + play(70, bassoon) * gain(1) \
    + play(78, whistle, bends=whistle_bends) * gain(-6)
section = play(61, brass) * gain(-2) + play(60, horns) + play(56, trumpet) * gain(-5)
mallets = play(9, glock) * gain(-3) + play(46, harp)
timps = play(47, timpani)
voices = play(52, choir)
backwards = play(119, swells)


# ── the room ────────────────────────────────────────────────────────────────

def room(seconds=3.2):
    """A reverb made of decaying noise: a big hall whose highs die first,
    with a few early reflections in front. One for each ear."""
    n = int(seconds * SR)
    t = np.arange(n) / SR
    sides = []
    for side in range(2):
        noise = np.random.default_rng(11 + side).standard_normal(n)
        tail = np.zeros(n)
        for low_, high, decay in ((90, 500, 0.62), (500, 2000, 0.5), (2000, 5000, 0.32), (5000, 10000, 0.16)):
            tail += shape(noise, band(low_, high)) * np.exp(-t / decay)
        tail = np.roll(tail, int(0.03 * SR))
        tail[: int(0.03 * SR)] = 0
        size = np.sqrt((tail ** 2).sum())
        for delay, amount in ((0.013, 0.5), (0.021, -0.4), (0.031, 0.35), (0.043, -0.3)):
            tail[int((delay + 0.003 * side) * SR)] += amount * size * 0.1
        sides.append(tail / np.sqrt((tail ** 2).sum()))
    return np.stack(sides)


ROOM = room()


def reverb(stereo):
    size = 1 << int(np.ceil(np.log2(N + ROOM.shape[1])))
    return np.stack([np.fft.irfft(np.fft.rfft(stereo[i], size) * np.fft.rfft(ROOM[i], size), size)[:N] for i in range(2)])


def widen(stereo, seconds=0.011, amount=0.5):
    """Something mono gets a side: a short delay goes left, minus it right."""
    mono = stereo.mean(axis=0)
    late = np.concatenate([np.zeros(int(seconds * SR)), mono])[:N] * amount
    return np.stack([mono + late, mono - late])


def rms(stereo, bars):
    part = stereo[:, int(at(bars[0]) * SR):int(at(bars[1]) * SR)]
    return db(np.sqrt((part ** 2).mean()))


def level(stereo, decibels, bars):
    """Scale a stem so its RMS over some bars is `decibels`."""
    return stereo * gain(decibels - rms(stereo, bars))


# ── the mix ─────────────────────────────────────────────────────────────────

loud = (S["forms"], S["world"])

strings = eq(strings, band(40, 12000), bell(300, -2.0, 1.5), shelf(6000, 1.5))
strings = level(strings, -21.0, loud)
low = level(eq(low, band(30, 3000)), -25.0, loud)
section = eq(section, band(70, 10000), bell(1200, 1.5, 2.0), bell(350, -2.0, 1.2))
section = level(saturate(level(section, -20, loud) * 2, 1.0) / 2, -21.5, loud)
winds = winds * gain(-21.0 - rms(winds, (S["world"], S["archive"])))
mallets = eq(mallets, band(180, 12000), bell(3000, 2.0, 2.0))
mallets = level(widen(mallets, 0.009, 0.25) * 0.6 + mallets * 0.4, -26.0, loud)
timps = eq(timps, band(35, 4000), bell(90, 2.0, 1.0))
timps = timps * gain(-9.0 - db(np.abs(timps).max()))
kit = eq(drums.audio, band(35, 12000), shelf(7000, -2.0))
kit = kit * gain(-6.0 - db(np.abs(kit).max()))
voices = voices * gain(-27.0 - rms(voices, (S["end"], S["out"])))
air = widen(eq(backwards, band(600, 10000)), 0.017, 0.7)
air = air * gain(-12 - db(np.abs(air).max()))

dry = strings + low + section + winds + mallets + timps + kit + voices + air
# an orchestra sits further back in the hall than a band does
wet = eq(reverb(dry), band(200, 7000))
wet = wet * gain(rms(dry, loud) - 7.5 - rms(wet, loud))
mix = dry * 0.85 + wet
mix = eq(mix, band(28, None), shelf(10000, 1.0))
mix = saturate(mix * 1.15, 1.0) / 1.15


def k_weighted(stereo):
    """BS.1770's two filters: a shelf for the head, a high-pass for the ear."""
    f = np.fft.rfftfreq(stereo.shape[1], 1 / SR)
    z = np.exp(-2j * np.pi * f / SR)
    k = (1.53512485958697 - 2.69169618940638 * z + 1.19839281085285 * z ** 2) / (1 - 1.69065929318241 * z + 0.73248077421585 * z ** 2) \
        * (1 - 2 * z + z ** 2) / (1 - 1.99004745483398 * z + 0.99007225036621 * z ** 2)
    return np.stack([np.fft.irfft(np.fft.rfft(ch) * k, stereo.shape[1]) for ch in stereo])


def loudness(stereo):
    """Integrated loudness, BS.1770: 400 ms blocks, both gates."""
    weighted = k_weighted(stereo)
    block, hop = int(0.4 * SR), int(0.1 * SR)
    power = np.array([(weighted[:, i:i + block] ** 2).mean(axis=1).sum() for i in range(0, stereo.shape[1] - block + 1, hop)])
    blocks = -0.691 + 10 * np.log10(np.maximum(power, 1e-12))
    kept = power[blocks > -70]
    relative = -0.691 + 10 * np.log10(kept.mean()) - 10
    return -0.691 + 10 * np.log10(power[blocks > max(relative, -70)].mean())


def true_peak(stereo):
    """Peak after four times oversampling, in dBFS."""
    n = stereo.shape[1]
    worst = 0.0
    for ch in stereo:
        spectrum = np.fft.rfft(ch)
        padded = np.zeros(2 * n + 1, dtype=complex)
        padded[: len(spectrum)] = spectrum
        worst = max(worst, np.abs(np.fft.irfft(padded, 4 * n) * 4).max())
    return 20 * np.log10(worst)


def limit(stereo, ceiling_db, lookahead=0.005):
    """A look-ahead limiter: turn down just before a peak and let go after.
    No clipping, so nothing gets squared off."""
    ceiling = gain(ceiling_db)
    look = int(lookahead * SR)
    need = np.minimum(1.0, ceiling / np.maximum(np.abs(stereo).max(axis=0), 1e-9))
    padded = np.pad(need, look, mode="edge")
    low_ = np.lib.stride_tricks.sliding_window_view(padded, 2 * look + 1).min(axis=1)
    release = int(0.08 * SR)
    padded = np.pad(low_, (0, release), mode="edge")
    low_ = np.lib.stride_tricks.sliding_window_view(padded, release + 1).min(axis=1)
    window = np.hanning(look * 2 + 1)
    smooth = np.convolve(np.pad(low_, look, mode="edge"), window / window.sum(), mode="valid")
    return stereo * np.minimum(smooth, need), 20 * np.log10(smooth.min())


# an orchestra wants more room to breathe than a beat does, so it sits a
# little under the -14 a pop trailer would
TARGET_LUFS, CEILING = -15.0, -1.5
trim = gain(TARGET_LUFS - loudness(mix))
for _ in range(4):
    master, reduction = limit(mix * trim, CEILING - 0.5)
    trim *= gain(TARGET_LUFS - loudness(master))
master, reduction = limit(mix * trim, CEILING - 0.5)

# the last chord rings on its own; this only takes it out with the picture
fade = int(1.6 * SR)
master[:, -fade:] *= 0.5 + 0.5 * np.cos(np.pi * np.arange(fade) / fade)
master[:, : int(0.03 * SR)] *= np.linspace(0, 1, int(0.03 * SR))
overshoot = true_peak(master) - CEILING
if overshoot > 0:
    master *= gain(-(overshoot + 0.05))


# ── write it ────────────────────────────────────────────────────────────────

dither = (rng.random(master.shape) - rng.random(master.shape)) / 32768
pcm = np.clip(np.round((master + dither) * 32767), -32768, 32767).astype("<i2")
with wave.open(str(public / "music.wav"), "wb") as out:
    out.setnchannels(2)
    out.setsampwidth(2)
    out.setframerate(SR)
    out.writeframes(pcm.T.tobytes())

frames_per_bar = int(round(BAR * FPS))
grid = {
    "fps": FPS,
    "bpm": BPM,
    "beat": frames_per_bar // 4,
    "bar": frames_per_bar,
    "frames": BARS * frames_per_bar,
    "scenes": {name: {"from": bar * frames_per_bar, "length": (nxt - bar) * frames_per_bar}
               for (name, bar), (_, nxt) in zip(SECTIONS, SECTIONS[1:])},
}
(HERE / "src" / "grid.json").write_text(json.dumps(grid, indent=1) + "\n")

print(f"public/music.wav, {TOTAL:.0f}s, {loudness(master):.1f} LUFS, true peak {true_peak(master):.1f} dBFS, "
      f"limiter at most {-reduction:.1f} dB")
