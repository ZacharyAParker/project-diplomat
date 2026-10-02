import type { Content } from '@diplomat/engine'
import { loadPack, type Problem } from './load.ts'
import { validate } from './validate.ts'

export { loadPack, validate, type Problem }
export { LIMITS } from './validate.ts'

export function checkPack(dir: string): { content: Content; problems: Problem[] } {
  const { content, problems } = loadPack(dir)
  return { content, problems: [...problems, ...validate(content)] }
}
