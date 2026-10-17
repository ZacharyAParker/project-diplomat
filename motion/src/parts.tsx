import type {CSSProperties, ReactNode} from 'react';
import {AbsoluteFill, Easing, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {c, MONO, SERIF} from './theme';

const ease = Easing.bezier(0.16, 1, 0.3, 1);

// fades a whole scene in and out at its edges, so cuts read as dissolves
export const Scene = ({children, length, fade = 10}: {children: ReactNode; length: number; fade?: number}) => {
  const f = useCurrentFrame();
  const opacity = interpolate(f, [0, fade, length - fade, length], [0, 1, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return <AbsoluteFill style={{background: c.ground, opacity}}>{children}</AbsoluteFill>;
};

// a 16:9 screenshot that drifts. from and to are [x%, y%, scale]: the point of the image to put
// in the middle of the frame, and how far in. the image never leaves a gap at the frame's edge
export const Shot = ({
  src,
  from,
  to,
  length,
  dim = 0,
  blur = 0,
}: {
  src: string;
  from: [number, number, number];
  to: [number, number, number];
  length: number;
  dim?: number;
  blur?: number;
}) => {
  const f = useCurrentFrame();
  const {width: W, height: H} = useVideoConfig();
  const t = interpolate(f, [0, length], [0, 1], {extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic)});
  const at = (k: number) => from[k]! + (to[k]! - from[k]!) * t;
  const s = Math.max(1, at(2));
  const clamp = (v: number, lo: number) => Math.min(0, Math.max(lo, v));
  const left = clamp(W / 2 - (at(0) / 100) * W * s, W - W * s);
  const top = clamp(H / 2 - (at(1) / 100) * H * s, H - H * s);
  return (
    <AbsoluteFill style={{overflow: 'hidden'}}>
      <Img src={staticFile(src)} style={{position: 'absolute', width: W * s, height: H * s, left, top, filter: blur ? `blur(${blur}px)` : undefined}} />
      {dim > 0 && <AbsoluteFill style={{background: c.ground, opacity: dim}} />}
    </AbsoluteFill>
  );
};

// a page that scrolls past, top to bottom, for shots taller than the frame
export const Scroll = ({src, length, fromY, toY, width = 1920, left = 0, dim = 0}: {src: string; length: number; fromY: number; toY: number; width?: number; left?: number; dim?: number}) => {
  const f = useCurrentFrame();
  const y = interpolate(f, [0, length], [fromY, toY], {extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic)});
  return (
    <AbsoluteFill style={{overflow: 'hidden'}}>
      <Img src={staticFile(src)} style={{position: 'absolute', width, left, top: -y}} />
      {dim > 0 && <AbsoluteFill style={{background: c.ground, opacity: dim}} />}
    </AbsoluteFill>
  );
};

// text that types itself out from a given frame, a few characters a frame
export const Typed = ({text, start = 0, speed = 1.6, caret = false, style}: {text: string; start?: number; speed?: number; caret?: boolean; style?: CSSProperties}) => {
  const f = useCurrentFrame();
  const n = Math.max(0, Math.floor((f - start) * speed));
  const shown = text.slice(0, n);
  const blink = caret && Math.floor(f / 15) % 2 === 0;
  return (
    <span style={style}>
      {shown}
      {caret && <span style={{opacity: blink ? 1 : 0, color: c.gold}}>|</span>}
    </span>
  );
};

// small mono label in a box, like a callout on a screenshot
export const Tag = ({children, at, x, y, tone = c.gold}: {children: ReactNode; at: number; x: number; y: number; tone?: string}) => {
  const f = useCurrentFrame();
  const p = interpolate(f, [at, at + 12], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease});
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        opacity: p,
        transform: `translateY(${(1 - p) * 14}px)`,
        fontFamily: MONO,
        fontSize: 26,
        color: c.ground,
        background: tone,
        padding: '6px 14px',
        borderRadius: 4,
        boxShadow: '0 8px 30px rgba(0,0,0,0.45)',
      }}
    >
      {children}
    </div>
  );
};

// the big two-line card: a serif headline with one word lit, and a quieter line under it
export const Headline = ({lead, lit, tail = '', sub, subLit, at = 0, size = 120}: {lead: string; lit: string; tail?: string; sub?: string; subLit?: string; at?: number; size?: number}) => {
  const f = useCurrentFrame();
  const p = interpolate(f, [at, at + 18], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease});
  const q = interpolate(f, [at + 10, at + 28], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease});
  return (
    <div style={{position: 'absolute', left: 150, top: 380}}>
      <div style={{fontFamily: SERIF, fontSize: size, color: c.paper, lineHeight: 1.05, opacity: p, transform: `translateY(${(1 - p) * 30}px)`}}>
        {lead}
        <span style={{color: c.gold}}>{lit}</span>
        {tail}
      </div>
      {sub && (
        <div style={{fontFamily: SERIF, fontStyle: 'italic', fontSize: 52, color: c.paper2, marginTop: 22, opacity: q, transform: `translateY(${(1 - q) * 20}px)`}}>
          {sub}
          {subLit && <span style={{color: c.green}}>{subLit}</span>}
        </div>
      )}
    </div>
  );
};

export const fadeIn = (f: number, at: number, len = 12) =>
  interpolate(f, [at, at + len], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease});

export const useLength = () => useVideoConfig().durationInFrames;
