import {AbsoluteFill, Html5Audio, interpolate, Sequence, staticFile, useCurrentFrame} from 'remotion';
import {fadeIn, Headline, Scene, Scroll, Shot, Tag, Typed} from './parts';
import {c, MONO, SERIF} from './theme';

// scene lengths in frames, at 30 a second. music.mjs has the same ones, change both together
const S = {cold: 290, title: 120, desk: 240, forms: 230, world: 160, director: 220, archive: 140, end: 170};
export const TRAILER_FRAMES = Object.values(S).reduce((a, b) => a + b, 0);

// the cold open: real lines from Claudetopia's Assembly and High Court, typed out the way
// subtitles come up, each under who said it
const LINES = [
  {who: 'THE DEPUTY SPEAKER', tone: c.gold, text: 'Places. There are six items on the paper and I mean to reach them.', at: 10},
  {who: 'LIRIEN ASHLAR · CHARTER UNION', tone: c.green, text: 'Three points, and I shall try not to sound as I feel.', at: 85},
  {who: 'THE HIGH COURT', tone: c.paper2, text: 'Option 1, seven to nothing: barred.', at: 155},
  {who: 'THE CLERK', tone: c.gold, text: 'The amendment is negatived, 61 to 73.', at: 210},
];

const ColdOpen = () => {
  const f = useCurrentFrame();
  return (
    <Scene length={S.cold}>
      <Shot src="shots/assembly.jpg" from={[14, 86, 1.9]} to={[17, 88, 2.15]} length={S.cold} dim={0.55} blur={1} />
      <AbsoluteFill style={{background: 'linear-gradient(90deg, rgba(13,17,14,0.97) 30%, rgba(13,17,14,0.55) 62%, rgba(13,17,14,0.1) 100%)'}} />
      <div style={{position: 'absolute', left: 120, bottom: 110, display: 'flex', flexDirection: 'column', gap: 26}}>
        {LINES.map((l, i) => {
          const next = LINES[i + 1];
          const faded = next ? interpolate(f, [next.at, next.at + 10], [1, 0.42], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}) : 1;
          return (
            <div key={l.who} style={{opacity: fadeIn(f, l.at, 6) * faded}}>
              <div style={{fontFamily: MONO, fontSize: 22, color: l.tone, letterSpacing: 2}}>● {l.who}</div>
              <div style={{fontFamily: SERIF, fontSize: 50, color: c.paper, marginTop: 6}}>
                <Typed text={l.text} start={l.at + 4} speed={1.4} />
              </div>
            </div>
          );
        })}
      </div>
    </Scene>
  );
};

const Title = () => (
  <Scene length={S.title}>
    <Shot src="shots/desk.jpg" from={[50, 30, 1.05]} to={[50, 40, 1.12]} length={S.title} dim={0.86} blur={6} />
    <Headline lead="a nation " lit="game" sub="where every issue goes through a " subLit="government first" />
  </Scene>
);

// the desk: a petition after the bodies have sat on it, scrolled from the top down, with what
// happened to it stacking up on the right
const STEPS = [
  {text: 'a petition comes in', tone: c.paper, at: 20},
  {text: 'parliament divides · 552 of 650', tone: c.gold, at: 60},
  {text: 'the supreme court rules', tone: c.paper, at: 100},
  {text: 'two ministries advise', tone: c.paper, at: 140},
  {text: 'the crown assents', tone: c.gold, at: 175},
];

const Desk = () => {
  const f = useCurrentFrame();
  return (
    <Scene length={S.desk}>
      <div style={{position: 'absolute', left: 80, top: 0, width: 1160, height: 1080, overflow: 'hidden', boxShadow: '0 0 80px rgba(0,0,0,0.6)'}}>
        <Scroll src="shots/desk-full.jpg" length={S.desk} fromY={40} toY={1900} width={1300} />
      </div>
      <div style={{position: 'absolute', left: 1310, top: 300, display: 'flex', flexDirection: 'column', gap: 30}}>
        {STEPS.map((s) => (
          <div key={s.text} style={{fontFamily: MONO, fontSize: 30, color: s.tone, opacity: fadeIn(f, s.at), transform: `translateX(${(1 - fadeIn(f, s.at)) * 24}px)`}}>
            <span style={{color: c.green}}>✓</span> {s.text}
          </div>
        ))}
        <div style={{fontFamily: SERIF, fontStyle: 'italic', fontSize: 40, color: c.paper2, marginTop: 30, opacity: fadeIn(f, 205)}}>
          then it's on you
        </div>
      </div>
    </Scene>
  );
};

const FORMS = [
  'commonwealth',
  'presidential republic',
  'parliamentary monarchy',
  'direct democracy',
  'one-party state',
  'absolute monarchy',
  'theocracy',
  'junta',
];

const Forms = () => {
  const f = useCurrentFrame();
  const lit = Math.min(FORMS.length - 1, Math.floor(Math.max(0, f - 60) / 16));
  return (
    <Scene length={S.forms}>
      <Shot src="shots/forms.jpg" from={[30, 50, 1.05]} to={[30, 55, 1.12]} length={S.forms} dim={0.84} blur={4} />
      <Headline lead="" lit="8 ways" tail=" to run a country" at={0} size={110} />
      <div style={{position: 'absolute', left: 150, top: 560, width: 1500, display: 'flex', flexWrap: 'wrap', gap: '14px 34px'}}>
        {FORMS.map((name, i) => (
          <span
            key={name}
            style={{
              fontFamily: MONO,
              fontSize: 40,
              opacity: fadeIn(f, 30 + i * 4, 10),
              color: f > 60 && i === lit ? c.gold : f > 60 && i < lit ? c.paper : c.paper3,
            }}
          >
            {name}
          </span>
        ))}
      </div>
      <div style={{position: 'absolute', left: 150, top: 790, fontFamily: SERIF, fontStyle: 'italic', fontSize: 44, color: c.paper2, opacity: fadeIn(f, 170, 16)}}>
        Claudetopia's is just one of them
      </div>
    </Scene>
  );
};

const World = () => (
  <Scene length={S.world}>
    <Shot src="shots/desk.jpg" from={[50, 48, 1.6]} to={[50, 56, 1.72]} length={S.world} dim={0.55} />
    <AbsoluteFill style={{background: 'linear-gradient(90deg, rgba(13,17,14,0.96) 35%, rgba(13,17,14,0.2) 80%)'}} />
    <Headline lead="and the country " lit="writes back" sub="papers, letters, polls, the weather" size={88} />
  </Scene>
);

// the question and the first of the answer are the real exchange with Verenmark's director.
// the cheat is only typed, to show what the sandbox takes
const Director = () => {
  const f = useCurrentFrame();
  return (
    <Scene length={S.director}>
      <Shot src="shots/director.jpg" from={[40, 55, 1.05]} to={[40, 65, 1.12]} length={S.director} dim={0.82} blur={3} />
      <div style={{position: 'absolute', left: 150, top: 150, fontFamily: MONO, fontSize: 24, color: c.ground, background: c.green, padding: '6px 14px', borderRadius: 4, opacity: fadeIn(f, 0)}}>
        the director · out of character
      </div>
      <div style={{position: 'absolute', left: 150, top: 230, width: 1620}}>
        <div style={{fontFamily: MONO, fontSize: 22, color: c.gold, letterSpacing: 2, opacity: fadeIn(f, 4)}}>● YOU</div>
        <div style={{fontFamily: SERIF, fontSize: 56, color: c.paper, marginTop: 6}}>
          <Typed text="what's parliament gonna do with the measles one" start={8} speed={1.5} caret={f < 50} />
        </div>
      </div>
      <div style={{position: 'absolute', left: 150, top: 400, width: 1620, opacity: fadeIn(f, 50, 8) * interpolate(f, [120, 130], [1, 0.45], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})}}>
        <div style={{fontFamily: MONO, fontSize: 22, color: c.green, letterSpacing: 2}}>● THE DIRECTOR</div>
        <div style={{fontFamily: SERIF, fontSize: 48, color: c.paper2, marginTop: 6, lineHeight: 1.3}}>
          <Typed text="Parliament has already voted on it. The vote is binding, so Persuade is now the only course you can take." start={54} speed={2.2} />
        </div>
      </div>
      <div style={{position: 'absolute', left: 150, top: 640, width: 1620, opacity: fadeIn(f, 125, 6)}}>
        <div style={{fontFamily: MONO, fontSize: 22, color: c.gold, letterSpacing: 2}}>● YOU</div>
        <div style={{fontFamily: SERIF, fontSize: 56, color: c.paper, marginTop: 6}}>
          <Typed text="ok now set liberty to 90 lol" start={128} speed={1.5} caret={f >= 128} />
        </div>
      </div>
      <Tag at={180} x={150} y={840}>sandboxed · logged quietly · one click to undo</Tag>
    </Scene>
  );
};

const Archive = () => {
  const f = useCurrentFrame();
  const n = Math.round(interpolate(f, [10, 80], [0, 801], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}));
  return (
    <Scene length={S.archive}>
      <Shot src="shots/library.jpg" from={[40, 50, 1.05]} to={[40, 58, 1.12]} length={S.archive} dim={0.85} blur={4} />
      <div style={{position: 'absolute', left: 150, top: 330, fontFamily: SERIF, fontSize: 200, color: c.gold}}>{n}</div>
      <div style={{position: 'absolute', left: 150, top: 580, fontFamily: SERIF, fontSize: 60, color: c.paper, opacity: fadeIn(f, 40)}}>
        documents in Claudetopia's archive
      </div>
      <div style={{position: 'absolute', left: 150, top: 670, fontFamily: SERIF, fontStyle: 'italic', fontSize: 44, color: c.paper2, opacity: fadeIn(f, 70)}}>
        and nothing in it ever gets changed
      </div>
    </Scene>
  );
};

// the flag Claudetopia flies: gold canton on navy
const Mark = ({size}: {size: number}) => (
  <div style={{width: size * 1.5, height: size, background: c.navy, position: 'relative', border: `2px solid ${c.paper3}`}}>
    <div style={{position: 'absolute', left: 0, top: 0, width: size * 0.62, height: size * 0.5, background: c.gold}} />
  </div>
);

const End = () => {
  const f = useCurrentFrame();
  return (
    <Scene length={S.end} fade={14}>
      <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center', flexDirection: 'column'}}>
        <div style={{opacity: fadeIn(f, 0, 18), transform: `scale(${0.9 + 0.1 * fadeIn(f, 0, 24)})`}}>
          <Mark size={110} />
        </div>
        <div style={{fontFamily: SERIF, fontSize: 116, color: c.paper, letterSpacing: 18, marginTop: 50, opacity: fadeIn(f, 8, 18)}}>
          PROJECT DIPLOMAT
        </div>
        <div style={{fontFamily: SERIF, fontStyle: 'italic', fontSize: 44, color: c.paper2, marginTop: 14, opacity: fadeIn(f, 20, 18)}}>
          pick a side. live with it.
        </div>
        <div style={{display: 'flex', gap: 20, alignItems: 'center', marginTop: 40, opacity: fadeIn(f, 32, 18)}}>
          <span style={{fontFamily: MONO, fontSize: 24, color: c.ground, background: c.gold, padding: '3px 12px', borderRadius: 4}}>v0.6.1</span>
          <span style={{fontFamily: MONO, fontSize: 26, color: c.paper2}}>github.com/ZacharyAParker/project-diplomat</span>
        </div>
      </AbsoluteFill>
    </Scene>
  );
};

export const Trailer = () => {
  let at = 0;
  const seq = (len: number, el: React.ReactNode) => {
    const from = at;
    at += len;
    return (
      <Sequence from={from} durationInFrames={len}>
        {el}
      </Sequence>
    );
  };
  return (
    <AbsoluteFill style={{background: c.ground}}>
      {/* the score from music.mjs, timed to these same scene lengths */}
      <Html5Audio src={staticFile('music.wav')} />
      {seq(S.cold, <ColdOpen />)}
      {seq(S.title, <Title />)}
      {seq(S.desk, <Desk />)}
      {seq(S.forms, <Forms />)}
      {seq(S.world, <World />)}
      {seq(S.director, <Director />)}
      {seq(S.archive, <Archive />)}
      {seq(S.end, <End />)}
    </AbsoluteFill>
  );
};
