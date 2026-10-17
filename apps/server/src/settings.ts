// data/settings.json: the AI back end, the model for each tier, whether minor petitions go
// through the bodies by default, and the player's API key. The key is written here and
// nowhere else, and never sent back: GET says only whether one is set.

import { randomBytes } from 'node:crypto'
import { chmodSync, existsSync, readFileSync } from 'node:fs'
import { mkdir, rename, writeFile, chmod } from 'node:fs/promises'
import { dirname } from 'node:path'
import { resolveModels } from '@diplomat/ai'
import type { Tier } from '@diplomat/government'
import { HttpError } from './http.ts'

export type Backend = 'none' | 'anthropic' | 'claude-cli'
const BACKENDS: readonly Backend[] = ['none', 'anthropic', 'claude-cli']
const TIERS: readonly Tier[] = ['bulk', 'standard', 'strategic']

export interface Settings {
  backend: Backend
  models: Partial<Record<Tier, string>>
  minorsThroughBodies: boolean
  // The Director: the player's out-of-character partner, always on Claude Code.
  director: DirectorSettings
  apiKey?: string
  // The claude binary, for the claude-cli back end. Only ever set by hand in the file: a
  // command is never accepted over HTTP.
  command?: string
}

export interface PublicSettings {
  backend: Backend
  apiKeySet: boolean
  models: Record<Tier, string>
  minorsThroughBodies: boolean
  director: DirectorSettings
}

export interface DirectorSettings {
  enabled: boolean
  model: string
}

export const DEFAULT_DIRECTOR: DirectorSettings = { enabled: true, model: 'claude-opus-5-5' }

const DEFAULTS: Settings = { backend: 'none', models: {}, minorsThroughBodies: false, director: { ...DEFAULT_DIRECTOR } }

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const MODEL = /^[A-Za-z0-9._:/@[\]-]{1,100}$/

export class SettingsStore {
  readonly file: string
  private value: Settings
  // Bumped on every change, so the AI layer knows to make a new provider.
  version = 0

  constructor(file: string) {
    this.file = file
    this.value = this.read()
  }

  private read(): Settings {
    if (!existsSync(this.file)) return structuredClone(DEFAULTS)
    try {
      const raw: unknown = JSON.parse(readFileSync(this.file, 'utf8'))
      if (!isObject(raw)) return structuredClone(DEFAULTS)
      const out: Settings = structuredClone(DEFAULTS)
      if (BACKENDS.includes(raw['backend'] as Backend)) out.backend = raw['backend'] as Backend
      if (isObject(raw['models'])) {
        for (const t of TIERS) {
          const m = raw['models'][t]
          if (typeof m === 'string' && MODEL.test(m)) out.models[t] = m
        }
      }
      if (typeof raw['minorsThroughBodies'] === 'boolean') out.minorsThroughBodies = raw['minorsThroughBodies']
      if (isObject(raw['director'])) {
        if (typeof raw['director']['enabled'] === 'boolean') out.director.enabled = raw['director']['enabled']
        if (typeof raw['director']['model'] === 'string' && MODEL.test(raw['director']['model'])) out.director.model = raw['director']['model']
      }
      if (typeof raw['apiKey'] === 'string' && raw['apiKey']) out.apiKey = raw['apiKey']
      if (typeof raw['command'] === 'string' && raw['command']) out.command = raw['command']
      // Keep the file private even if it was copied in loosely.
      try {
        chmodSync(this.file, 0o600)
      } catch {
        // Windows honours only the read-only bit; nothing more can be done without ACLs.
      }
      return out
    } catch {
      return structuredClone(DEFAULTS)
    }
  }

  get(): Settings {
    return structuredClone(this.value)
  }

  public(): PublicSettings {
    return {
      backend: this.value.backend,
      apiKeySet: Boolean(this.value.apiKey),
      models: resolveModels(this.value.models),
      minorsThroughBodies: this.value.minorsThroughBodies,
      director: { ...this.value.director },
    }
  }

  private chain: Promise<unknown> = Promise.resolve()

  // One update at a time, each built on the one before.
  update(change: unknown): Promise<PublicSettings> {
    const run = this.chain.then(() => this.apply(change))
    this.chain = run.catch(() => undefined)
    return run
  }

  private async apply(change: unknown): Promise<PublicSettings> {
    if (!isObject(change)) throw new HttpError(400, 'Send the settings to change as a JSON object.')
    const next = structuredClone(this.value)
    for (const key of Object.keys(change)) {
      if (!['backend', 'apiKey', 'models', 'minorsThroughBodies', 'director'].includes(key)) {
        throw new HttpError(400, `“${key}” is not a setting. The settings are backend, apiKey, models, minorsThroughBodies and director.`)
      }
    }
    if (change['backend'] !== undefined) {
      if (!BACKENDS.includes(change['backend'] as Backend)) throw new HttpError(400, 'The AI back end must be none, anthropic or claude-cli.')
      next.backend = change['backend'] as Backend
    }
    if (change['apiKey'] !== undefined) {
      const key = change['apiKey']
      if (typeof key !== 'string' || key.length > 500 || /[\s\u0000-\u001f]/.test(key.trim())) {
        throw new HttpError(400, 'The API key must be one line of text, as the Claude Console gives it.')
      }
      if (key.trim()) next.apiKey = key.trim()
      else delete next.apiKey
    }
    if (change['models'] !== undefined) {
      const models = change['models']
      if (!isObject(models)) throw new HttpError(400, 'models must be an object with bulk, standard and strategic.')
      for (const [tier, model] of Object.entries(models)) {
        if (!TIERS.includes(tier as Tier)) throw new HttpError(400, `${tier} is not a tier. The tiers are bulk, standard and strategic.`)
        if (model === '' || model === null) {
          delete next.models[tier as Tier]
          continue
        }
        if (typeof model !== 'string' || !MODEL.test(model)) throw new HttpError(400, `The model for ${tier} is not a model name.`)
        next.models[tier as Tier] = model
      }
    }
    if (change['minorsThroughBodies'] !== undefined) {
      if (typeof change['minorsThroughBodies'] !== 'boolean') throw new HttpError(400, 'minorsThroughBodies must be true or false.')
      next.minorsThroughBodies = change['minorsThroughBodies']
    }
    if (change['director'] !== undefined) {
      const d = change['director']
      if (!isObject(d)) throw new HttpError(400, 'director must be an object with enabled and model.')
      for (const k of Object.keys(d)) if (k !== 'enabled' && k !== 'model') throw new HttpError(400, `director.${k} is not a setting. The Director's settings are enabled and model.`)
      if (d['enabled'] !== undefined) {
        if (typeof d['enabled'] !== 'boolean') throw new HttpError(400, 'director.enabled must be true or false.')
        next.director.enabled = d['enabled']
      }
      if (d['model'] !== undefined) {
        if (typeof d['model'] !== 'string' || !MODEL.test(d['model'])) throw new HttpError(400, 'director.model is not a model name.')
        next.director.model = d['model']
      }
    }
    await mkdir(dirname(this.file), { recursive: true })
    const temp = `${this.file}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`
    await writeFile(temp, `${JSON.stringify(next, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
    try {
      await chmod(temp, 0o600)
    } catch {
      // as above
    }
    await rename(temp, this.file)
    this.value = next
    this.version++
    return this.public()
  }
}
