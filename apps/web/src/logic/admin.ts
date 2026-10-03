import type { KeyValue } from './saves.ts'

// The admin password. It never leaves the browser and is never stored: what is kept is a
// salted PBKDF2 hash, so reading the storage does not reveal it. This locks the admin page
// against someone using the game. It is not protection against someone with the browser's
// developer tools, which no purely local lock can be.

export const ADMIN_KEY = 'diplomat:admin'
export const MIN_PASSWORD = 10
const ITERATIONS = 210_000

interface Stored {
  v: 1
  salt: string
  hash: string
  iterations: number
}

const toHex = (bytes: ArrayBuffer | Uint8Array) =>
  [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('')

const fromHex = (hex: string) => new Uint8Array((hex.match(/../g) ?? []).map((h) => parseInt(h, 16)))

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, [
    'deriveBits',
  ])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    key,
    256,
  )
  return toHex(bits)
}

function read(kv: KeyValue): Stored | null {
  try {
    const stored = JSON.parse(kv.getItem(ADMIN_KEY) ?? 'null') as Stored | null
    const valid =
      stored?.v === 1 &&
      /^[0-9a-f]{32}$/.test(stored.salt) &&
      /^[0-9a-f]{64}$/.test(stored.hash) &&
      Number.isSafeInteger(stored.iterations) &&
      stored.iterations >= 100_000
    return valid ? stored : null
  } catch {
    return null
  }
}

export function hasPassword(kv: KeyValue): boolean {
  return read(kv) !== null
}

// What is wrong with a proposed password, or null if nothing is.
export function passwordProblem(password: string, again: string): string | null {
  if ([...password].length < MIN_PASSWORD) return `It needs at least ${MIN_PASSWORD} characters.`
  if (password !== again) return 'The two do not match.'
  return null
}

export async function setPassword(kv: KeyValue, password: string): Promise<void> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const hash = await derive(password, salt, ITERATIONS)
  const stored: Stored = { v: 1, salt: toHex(salt), hash, iterations: ITERATIONS }
  kv.setItem(ADMIN_KEY, JSON.stringify(stored))
}

// Compares every character, so how long a wrong answer takes says nothing about how much
// of it was right.
function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let difference = 0
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return difference === 0
}

export async function checkPassword(kv: KeyValue, password: string): Promise<boolean> {
  const stored = read(kv)
  if (!stored) return false
  const hash = await derive(password, fromHex(stored.salt), stored.iterations)
  return same(hash, stored.hash)
}
