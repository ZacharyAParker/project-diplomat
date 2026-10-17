import {Composition} from 'remotion';
import {Trailer, TRAILER_FRAMES} from './Trailer';
import {FPS, H, W} from './theme';

export const Root = () => <Composition id="Trailer" component={Trailer} durationInFrames={TRAILER_FRAMES} fps={FPS} width={W} height={H} />;
