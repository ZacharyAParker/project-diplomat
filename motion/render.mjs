// writes the score, then renders the trailer to docs/media/trailer.mp4 and the short loop the README opens with to
// docs/media/demo.gif. run with `pnpm render` from this folder, then commit the outputs.
// needs ffmpeg on PATH for the gif
import {execFileSync} from 'node:child_process';
import {mkdirSync} from 'node:fs';

const OUT = '../docs/media';
// npx is a script on Windows and needs a shell; ffmpeg is a plain program and must not have one,
// or the filter graph gets split on its semicolons
const run = (cmd, args, shell = false) => execFileSync(cmd, args, {stdio: 'inherit', shell});

mkdirSync(OUT, {recursive: true});
run('node', ['music.mjs']);
// crf 22 keeps the trailer under the 10MB GitHub takes for a video in a README
run('npx', ['remotion', 'render', 'src/index.ts', 'Trailer', `${OUT}/trailer.mp4`, '--codec=h264', '--crf=22', '--audio-codec=aac', '--audio-bitrate=192k', '--color-space=bt709'], process.platform === 'win32');

// the loop: the end of the cold open, the desk, the forms and the director, cut together
const CUTS = [
  [5.5, 9.5],
  [13.7, 21.5],
  [21.7, 28.5],
  [35.2, 42.0],
];
const trims = CUTS.map(([a, b], i) => `[0:v]trim=${a}:${b},setpts=PTS-STARTPTS,fps=10,scale=800:-1:flags=lanczos[c${i}]`).join(';');
const joined = CUTS.map((_, i) => `[c${i}]`).join('') + `concat=n=${CUTS.length}:v=1:a=0,split[x][y];[x]palettegen=max_colors=80:stats_mode=diff[p];[y][p]paletteuse=dither=bayer:bayer_scale=4`;
run('ffmpeg', ['-v', 'error', '-y', '-i', `${OUT}/trailer.mp4`, '-filter_complex', `${trims};${joined}`, '-loop', '0', `${OUT}/demo.gif`]);
