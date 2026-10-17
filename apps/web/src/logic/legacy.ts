import { deserialize } from '@diplomat/engine'
import { INDEX_KEY, nationKey, type KeyValue } from './saves.ts'

// Saves left in this browser by version 0.5, which kept everything in localStorage. From
// 0.6 the server keeps the nations, so the home screen offers to move these across. They
// are removed from the browser only once the server has taken them.

const PREFIX = 'diplomat:nation:'

export interface LegacySave {
  id: string
  name: string
  text: string
}

function nameOf(text: string): string {
  try {
    const file = JSON.parse(text) as { state?: unknown }
    if (typeof file.state === 'string') return deserialize(file.state).identity.name
  } catch {
    // An unreadable save still gets moved; the server says what is wrong with it.
  }
  return 'A save that cannot be read'
}

export function findLegacy(kv: KeyValue | undefined): LegacySave[] {
  if (!kv) return []
  const found: LegacySave[] = []
  try {
    for (let i = 0; i < kv.length; i++) {
      const key = kv.key(i)
      if (!key?.startsWith(PREFIX)) continue
      const text = kv.getItem(key)
      if (text !== null) found.push({ id: key.slice(PREFIX.length), name: nameOf(text), text })
    }
  } catch {
    return []
  }
  return found
}

export function forgetLegacy(kv: KeyValue, id: string) {
  kv.removeItem(nationKey(id))
  if (findLegacy(kv).length === 0) kv.removeItem(INDEX_KEY)
}
