import { resolve } from 'node:path'
import { checkPack } from './index.ts'

const dir = resolve(process.argv[2] ?? 'packs/core')
const { content, problems } = checkPack(dir)

for (const p of problems) console.error(`${p.where}: ${p.message}`)

const major = content.dilemmas.filter((d) => d.kind === 'major').length
console.log(`${content.pack.name} (${content.pack.id}) ${content.pack.version}`)
console.log(
  `${content.dilemmas.length} dilemmas (${major} major, ${content.dilemmas.length - major} minor), ` +
    `${content.situations.length} situations, ${content.traits.length} traits, ` +
    `${content.policies.length} policies, ${content.factions.length} factions, ` +
    `${content.founding.questions.length} founding questions, ${content.classes.length} classes`,
)

if (problems.length) {
  console.error(`${problems.length} problem${problems.length === 1 ? '' : 's'}`)
  process.exit(1)
}
console.log('pack is valid')
