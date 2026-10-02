// Checks a pack and writes it out as one JSON file for the web app to bundle.
//
//   node scripts/build-pack.ts             packs/core
//   node scripts/build-pack.ts some/pack   another pack, for trying things out

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { checkPack } from '../packages/content/src/index.ts'

const root = resolve(import.meta.dirname, '..')
const dir = resolve(root, process.argv[2] ?? 'packs/core')
const out = resolve(root, 'apps/web/src/generated/pack.json')

const { content, problems } = checkPack(dir)

if (problems.length) {
  for (const p of problems) console.error(`${p.where}: ${p.message}`)
  console.error(`${problems.length} problem${problems.length === 1 ? '' : 's'} in ${dir}, pack not written`)
  process.exit(1)
}

mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, `${JSON.stringify(content)}\n`)
console.log(`${content.pack.name} ${content.pack.version}: ${content.dilemmas.length} dilemmas written`)
