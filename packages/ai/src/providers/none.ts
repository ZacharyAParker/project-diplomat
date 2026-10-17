// The default: no AI. Its status is always fine, and every task is refused at once, so the
// caller goes straight to the rules-based stand-in.

import type { Provider, ProviderStatus, Task, Tier } from '@diplomat/government'
import { AiError, resolveModels } from '../common.ts'

export function noneProvider(models?: Partial<Record<Tier, string>>): Provider & { selfTest(): Promise<ProviderStatus> } {
  const status = async (): Promise<ProviderStatus> => ({ backend: 'none', ok: true, detail: 'AI is off', models: resolveModels(models) })
  return {
    status,
    selfTest: status,
    async run(task: Task): Promise<never> {
      throw new AiError('off', `AI is off, so ${task} is played by the stand-in.`)
    },
  }
}
