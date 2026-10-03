import { describe, expect, it } from 'vitest'
import { ADMIN_KEY, checkPassword, hasPassword, passwordProblem, setPassword } from './admin.ts'
import { memoryStore } from './saves.ts'

describe('the admin password', () => {
  it('is stored only as a salted hash, and checks right and wrong answers', async () => {
    const kv = memoryStore()
    expect(hasPassword(kv)).toBe(false)
    await setPassword(kv, 'correct horse battery')
    expect(hasPassword(kv)).toBe(true)
    expect(kv.getItem(ADMIN_KEY)).not.toContain('correct horse')
    expect(await checkPassword(kv, 'correct horse battery')).toBe(true)
    expect(await checkPassword(kv, 'correct horse batterY')).toBe(false)
    expect(await checkPassword(kv, '')).toBe(false)
  })

  it('salts each password differently', async () => {
    const one = memoryStore()
    const two = memoryStore()
    await setPassword(one, 'the same password')
    await setPassword(two, 'the same password')
    expect(one.getItem(ADMIN_KEY)).not.toBe(two.getItem(ADMIN_KEY))
  })

  it('treats a missing or tampered record as no password at all', async () => {
    const kv = memoryStore({ [ADMIN_KEY]: '{"v":1,"salt":"zz","hash":"00","iterations":5}' })
    expect(hasPassword(kv)).toBe(false)
    expect(await checkPassword(kv, 'anything at all')).toBe(false)
    expect(hasPassword(memoryStore({ [ADMIN_KEY]: 'not json' }))).toBe(false)
  })

  it('asks for a long enough password, typed the same twice', () => {
    expect(passwordProblem('short', 'short')).toMatch(/at least 10/)
    expect(passwordProblem('long enough one', 'long enough two')).toBe('The two do not match.')
    expect(passwordProblem('long enough one', 'long enough one')).toBeNull()
  })
})
