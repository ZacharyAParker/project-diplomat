import {loadFont} from '@remotion/google-fonts/IBMPlexMono';

// the game's own paper and ink (apps/web/src/styles/tokens.css), turned dark for a trailer.
// the gold and navy are Claudetopia's flag
export const c = {
  ground: '#0d110e',
  ground2: '#151b16',
  paper: '#f7f6f0',
  paper2: '#b9b8ab',
  paper3: '#7d7c70',
  green: '#5fae64',
  greenDeep: '#2c7d31',
  gold: '#d4a72c',
  navy: '#1a2a5a',
  red: '#d0553f',
};

export const SERIF = 'Georgia, "Times New Roman", serif';
export const {fontFamily: MONO} = loadFont('normal', {weights: ['400', '500'], subsets: ['latin']});

export const FPS = 30;
export const W = 1920;
export const H = 1080;
