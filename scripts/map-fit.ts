// Fits the map in packs/core/world.yaml and the pack's borders to each other. The map is drawn
// from the nations' points and the seas listed below (packages/engine/src/map.ts). Who touches
// whom on it is written back into `borders:` in neighbours.yaml and nations.yaml, so the borders
// the rules use are the borders the map draws. The player's nation must touch exactly the five
// marked near; if it doesn't, move the points and run it again. Draws map.svg (into out/, or the
// folder given) to look at.
//
//   node scripts/map-fit.ts [folder for the preview]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadPack } from '../packages/content/src/load.ts'
import { HOME, drawMap, mapProblems, type Point } from '../packages/engine/src/index.ts'

const root = join(import.meta.dirname, '..')
const pack = join(root, 'packs/core')
const { content } = loadPack(pack)
const map = content.world.map
if (!map) throw new Error('world.yaml has no map to fit')

// Seas, bays and lakes, placed by hand: each is a point the water grows round.
const SEAS: Point[] = [
  [640, 245], // the Eskersund, between Eskerland, Kessmark and Ardune
  [430, 535], // the Bay of Holm, south of the player's coast
  [700, 520], // the Velsan lakes
  [880, 480], // the Tarvos gulf
  [290, 110], // the northern sound
  [240, 620], // the Skerry channel
  [590, 700], // the southern bight
  [60, 40],
  [960, 40],
  [40, 690],
  [990, 690],
]

const def = { ...map, sea: SEAS }
const drawn = drawMap(def)
const touching = drawn.neighbours

const near = content.neighbours.filter((n) => n.near).map((n) => n.id).sort()
const home = (touching[HOME] ?? []).filter((x) => !x.startsWith('sea')).sort()
if (JSON.stringify(near) !== JSON.stringify(home)) {
  console.log(`The player's nation touches ${home.join(', ')} on the map, but the pack says ${near.join(', ')}. Move the points.`)
}
for (const n of content.neighbours) if (!drawn.regions.some((r) => r.id === n.id)) console.log(`${n.id} has no land at all. Move its point.`)

for (const file of ['neighbours.yaml', 'nations.yaml']) {
  const path = join(pack, file)
  let text = readFileSync(path, 'utf8')
  for (const n of content.neighbours) {
    const others = (touching[n.id] ?? []).filter((x) => x !== HOME)
    text = text.replace(new RegExp(`(\\n- id: ${n.id}\\r?\\n[\\s\\S]*?\\n  borders: )\\[[^\\]]*\\]`), `$1[${others.join(', ')}]`)
  }
  writeFileSync(path, text)
}

const worldFile = join(pack, 'world.yaml')
const lines = SEAS.map((p) => `    [${p[0]}, ${p[1]}],`)
writeFileSync(worldFile, readFileSync(worldFile, 'utf8').replace(/\n  sea:[\s\S]*$/, `\n  sea: [\n${lines.join('\n').replace(/,$/, '')}\n  ]\n`))

const after = loadPack(pack).content
const problems = mapProblems(after)
console.log(problems.length ? problems.join('\n') : 'the map and the borders agree')
for (const n of after.neighbours) console.log(`  ${n.id}: ${n.borders.join(', ')}${n.near ? ', home' : ''}`)

// A preview in atlas colours.
const tints = ['#e8d9a8', '#cfe0b4', '#f0c9a8', '#d9c8e3', '#c9dcea', '#f2e3a2', '#e6c3c3', '#c4e0d2']
const svg = [
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${map.width} ${map.height}" width="${map.width}" height="${map.height}" font-family="Georgia">`,
  `<rect width="${map.width}" height="${map.height}" fill="#a9cbe0"/>`,
  `<path d="${drawn.coast}" fill="none" stroke="#c9e0ee" stroke-width="16" stroke-linejoin="round"/>`,
  `<path d="${drawn.coast}" fill="none" stroke="#b9d6e8" stroke-width="8" stroke-linejoin="round"/>`,
  ...drawn.regions.filter((r) => !r.sea).map((r, i) => `<path d="${r.d}" fill="${r.id === HOME ? '#e3b94d' : tints[i % tints.length]}" stroke="${r.id === HOME ? '#e3b94d' : tints[i % tints.length]}" stroke-width="0.6"/>`),
  ...drawn.borders.map((b) => `<path d="${b.d}" fill="none" stroke="#7a5f4a" stroke-width="1.2" stroke-dasharray="5 3"/>`),
  `<path d="${drawn.coast}" fill="none" stroke="#5d7f93" stroke-width="1.4" stroke-linejoin="round"/>`,
  ...drawn.mountains.map((p) => `<path d="M${p[0] - 5},${p[1] + 3}L${p[0]},${p[1] - 5}L${p[0] + 5},${p[1] + 3}" fill="none" stroke="#8a7357" stroke-width="1"/>`),
  ...drawn.regions.filter((r) => !r.sea).map((r) => `<text x="${r.centre[0]}" y="${r.centre[1]}" text-anchor="middle" font-size="12" letter-spacing="2" fill="#3b2f25">${r.id.toUpperCase()}</text>`),
  '</svg>',
].join('\n')
const out = process.argv[2] ?? join(root, 'out')
mkdirSync(out, { recursive: true })
writeFileSync(join(out, 'map.svg'), svg)
