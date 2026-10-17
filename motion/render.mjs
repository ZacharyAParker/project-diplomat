// writes the score with music.py, then renders the trailer to docs/media/trailer.mp4 and the short loop the README opens with to
// docs/media/demo.gif. run with `pnpm render` from this folder, then commit the outputs.
// needs ffmpeg on PATH for the gif, and the venv music.py names at its top
import {execFileSync} from 'node:child_process';
import {existsSync, mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const OUT = '../docs/media';
// nothing here runs through a shell: remotion is started with node itself, and ffmpeg's filter
// graph would be split on its semicolons by one
const run = (cmd, args) => execFileSync(cmd, args, {stdio: 'inherit'});
const remotion = fileURLToPath(new URL('./node_modules/@remotion/cli/remotion-cli.js', import.meta.url));

mkdirSync(OUT, {recursive: true});
const python = ['.venv-music/Scripts/python.exe', '.venv-music/bin/python'].find((p) => existsSync(p));
if (!python) throw new Error('make the venv first: see the top of music.py');
run(python, ['music.py']);
// crf 22 keeps the trailer under the 10MB GitHub takes for a video in a README
run(process.execPath, [remotion, 'render', 'src/index.ts', 'Trailer', `${OUT}/trailer.mp4`, '--codec=h264', '--crf=22', '--audio-codec=aac', '--audio-bitrate=192k', '--color-space=bt709']);

// the loop: the end of the cold open, the desk, the forms and the director, cut together
const CUTS = [
  [6.0, 10.0],
  [14.0, 21.8],
  [22.0, 29.8],
  [36.0, 43.8],
];
const trims = CUTS.map(([a, b], i) => `[0:v]trim=${a}:${b},setpts=PTS-STARTPTS,fps=10,scale=800:-1:flags=lanczos[c${i}]`).join(';');
const joined = CUTS.map((_, i) => `[c${i}]`).join('') + `concat=n=${CUTS.length}:v=1:a=0,split[x][y];[x]palettegen=max_colors=80:stats_mode=diff[p];[y][p]paletteuse=dither=bayer:bayer_scale=4`;
run('ffmpeg', ['-v', 'error', '-y', '-i', `${OUT}/trailer.mp4`, '-filter_complex', `${trims};${joined}`, '-loop', '0', `${OUT}/demo.gif`]);
