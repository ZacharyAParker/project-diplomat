// The system prompt for each task: packages/ai/prompts/<task>.md, read from disk next to this
// module and kept once read. The files are the prompts; nothing is added to them here, so the
// text a model sees is exactly the text in the repository (and caches as one stable prefix).

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { TASKS, type Task } from '@diplomat/government'

export const PROMPTS_DIR = fileURLToPath(new URL('../prompts/', import.meta.url))

export function promptPath(task: Task): string {
  return fileURLToPath(new URL(`../prompts/${task}.md`, import.meta.url))
}

const cache = new Map<Task, string>()

export function promptFor(task: Task): string {
  const known = cache.get(task)
  if (known !== undefined) return known
  if (!(TASKS as readonly string[]).includes(task)) throw new Error(`There is no prompt for the task "${String(task)}".`)
  let text: string
  try {
    text = readFileSync(promptPath(task), 'utf8')
  } catch {
    throw new Error(`The prompt file for ${task} is missing (expected ${promptPath(task)}).`)
  }
  text = text.replace(/\r\n/g, '\n').trim() + '\n'
  cache.set(task, text)
  return text
}

// Every prompt, for a startup check or a test.
export function allPrompts(): Record<Task, string> {
  return Object.fromEntries(TASKS.map((task) => [task, promptFor(task)])) as Record<Task, string>
}

export function clearPromptCache(): void {
  cache.clear()
  director = undefined
}

// The Director's prompt (prompts/director.md). Not a task: the Director is the player's own
// out-of-character Claude Code session, which the server starts with this as its appended
// system prompt, and which the terminal skill points at.
export const DIRECTOR_PROMPT_PATH = fileURLToPath(new URL('../prompts/director.md', import.meta.url))

let director: string | undefined

export function directorPrompt(): string {
  if (director !== undefined) return director
  try {
    director = readFileSync(DIRECTOR_PROMPT_PATH, 'utf8').replace(/\r\n/g, '\n').trim() + '\n'
  } catch {
    throw new Error(`The Director's prompt is missing (expected ${DIRECTOR_PROMPT_PATH}).`)
  }
  return director
}
