// packages/ai: the AI back ends behind the Provider interface in @diplomat/government, and one
// prompt per task. The server makes one provider from the player's settings and calls
// run(task, input); what comes back is unvalidated JSON for validate.ts to check.

import type { Provider, ProviderStatus, Task, Tier } from '@diplomat/government'
import { anthropicProvider } from './providers/anthropic.ts'
import { claudeCliProvider } from './providers/claude-cli.ts'
import { noneProvider } from './providers/none.ts'

export { AiError, DEFAULT_MODELS, EFFORT, MAX_TOKENS, TIMEOUTS, extractJson, resolveModels, type AiErrorCode } from './common.ts'
export { allPrompts, directorPrompt, promptFor, promptPath, DIRECTOR_PROMPT_PATH, PROMPTS_DIR } from './prompts.ts'
export { TASK_SCHEMAS, councilSitsAsCourt, schemaFor, type JsonSchema } from './schemas.ts'
export { anthropicProvider, buildRequest, keyHint, type AnthropicSettings } from './providers/anthropic.ts'
export {
  claudeCliProvider,
  buildCall,
  childEnv,
  parseEnvelope,
  resolveCommand,
  hasSessions,
  DENIED_TOOLS,
  READ_TOOLS,
  type BranchSession,
  type ClaudeCliProvider,
  type ClaudeCliSettings,
  type SessionProvider,
  type SessionResult,
  type SessionRunOptions,
  type SpawnFn,
} from './providers/claude-cli.ts'
export { noneProvider } from './providers/none.ts'

export type Backend = 'none' | 'anthropic' | 'claude-cli'

export interface ProviderSettings {
  backend: Backend
  apiKey?: string
  models?: Partial<Record<Tier, string>>
  // Tasks moved off their usual tier, from the settings.
  tiers?: Partial<Record<Task, Tier>>
  command?: string
}

export function createProvider(settings: ProviderSettings): Provider {
  switch (settings.backend) {
    case 'anthropic':
      return anthropicProvider({ apiKey: settings.apiKey ?? '', ...(settings.models ? { models: settings.models } : {}), ...(settings.tiers ? { tiers: settings.tiers } : {}) })
    case 'claude-cli':
      return claudeCliProvider({
        ...(settings.command ? { command: settings.command } : {}),
        ...(settings.models ? { models: settings.models } : {}),
        ...(settings.tiers ? { tiers: settings.tiers } : {}),
      })
    case 'none':
      return noneProvider(settings.models)
    default:
      throw new Error(`Unknown AI back end: ${String((settings as { backend?: unknown }).backend)}`)
  }
}

// The settings page's "Test" button: a cheap check that says which credential is in use.
// The API back end looks up a model with the key (no tokens spent); the CLI back end asks
// Claude Code which sign-in it would use. Falls back to status() for any other provider.
export async function selfTest(provider: Provider): Promise<ProviderStatus> {
  const testable = provider as Provider & { selfTest?: () => Promise<ProviderStatus> }
  return typeof testable.selfTest === 'function' ? testable.selfTest() : provider.status()
}
