import { memoryStore, type KeyValue } from '../logic/saves.ts'

// Some browsers throw on the first touch of localStorage (private windows, blocked
// cookies). The game still runs from memory, and says that nothing will be kept.
export function browserStore(): { kv: KeyValue; persistent: boolean } {
  try {
    const probe = 'diplomat:probe'
    localStorage.setItem(probe, '1')
    localStorage.removeItem(probe)
    return { kv: localStorage, persistent: true }
  } catch {
    return { kv: memoryStore(), persistent: false }
  }
}

export function download(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
