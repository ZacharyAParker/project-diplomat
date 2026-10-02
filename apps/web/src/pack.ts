import type { Content } from '@diplomat/engine'
import raw from './generated/pack.json'

// The file is written by scripts/build-pack.ts, which refuses to write a pack that fails validation.
export const pack = raw as unknown as Content
