// Fits the map in packs/core/world.yaml and the pack's borders to each other. The map is the
// Voronoi diagram of the nations' points (packages/engine/src/map.ts), with a ring of sea round
// the coast and the straits listed below. Who touches whom on that map is written back into
// `borders:` in neighbours.yaml and nations.yaml, so the borders the rules use are the borders
// the map draws. The player's nation must touch exactly the five marked near; if it doesn't,
// move the points and run it again. Draws map.svg (into out/, or the folder given) to look at.
//
//   node scripts/map-fit.ts [folder for the preview]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadPack } from '../packages/content/src/load.ts'
import { HOME, mapProblems, voronoi, type Point } from '../packages/engine/src/index.ts'

const root = join(import.meta.dirname, '..')
const pack = join(root, 'packs/core')
const { content } = loadPack(pack)
const map = content.world.map
if (!map) throw new Error('world.yaml has no map to fit')

// Straits and inland seas, placed by hand for the look of the thing.
const STRAITS: Point[] = [
  [640, 245], // the Eskersund, between Eskerland, Kessmark and Ardune
  [430, 520], // the Bay of Holm, south of the player's coast
  [690, 520], // the Velsan lakes
  [880, 480], // the Tarvos gulf
  [300, 120], // the northern sound
  [235, 615], // the Skerry channel
  [600, 690], // the southern bight
]

// The coast: a ring of sea just inside the frame, a little irregular so it reads as a coast.
const ring: Point[] = []
const step = 70
let k = 0
const wobble = () => ((k++ * 37) % 23) - 11
for (let x = 0; x <= map.width; x += step) ring.push([x, 10 + wobble()], [x, map.height - 10 + wobble()])
for (let y = step; y < map.height; y += step) ring.push([10 + wobble(), y], [map.width - 10 + wobble(), y])
const sea = [...ring, ...STRAITS]

const cells = voronoi([...Object.entries(map.sites).map(([id, p]) => ({ id, p })), ...sea.map((p, i) => ({ id: `sea-${i}`, p, sea: true }))], map.width, map.height)
const touching = new Map(cells.filter((c) => !c.sea).map((c) => [c.id, c.neighbours.filter((x) => !x.startsWith('sea-'))]))

// The player's border is the pack's to set, not the map's: it must match.
const near = content.neighbours.filter((n) => n.near).map((n) => n.id).sort()
const home = [...(touching.get(HOME) ?? [])].sort()
if (JSON.stringify(near) !== JSON.stringify(home)) {
  console.log(`The player's nation touches ${home.join(', ')} on the map, but the pack says ${near.join(', ')}. Move the points.`)
}
const lonely = content.neighbours.filter((n) => (touching.get(n.id) ?? []).length === 0).map((n) => n.id)
if (lonely.length) console.log(`No land border at all: ${lonely.join(', ')}. That is allowed (an island), but check it is meant.`)

// Write each nation's borders back, in place of its old `borders:` line.
for (const file of ['neighbours.yaml', 'nations.yaml']) {
  const path = join(pack, file)
  let text = readFileSync(path, 'utf8')
  for (const n of content.neighbours) {
    const others = (touching.get(n.id) ?? []).filter((x) => x !== HOME)
    text = text.replace(new RegExp(`(\\n- id: ${n.id}\\r?\\n[\\s\\S]*?\\n  borders: )\\[[^\\]]*\\]`), `$1[${others.join(', ')}]`)
  }
  writeFileSync(path, text)
}

// And the sea into world.yaml, in place of the old list.
const lines: string[] = []
for (let i = 0; i < sea.length; i += 8) lines.push(`    ${sea.slice(i, i + 8).map((p) => `[${p[0]}, ${p[1]}]`).join(', ')},`)
const worldFile = join(pack, 'world.yaml')
writeFileSync(worldFile, readFileSync(worldFile, 'utf8').replace(/\n  sea:[\s\S]*$/, `\n  sea: [\n${lines.join('\n').replace(/,$/, '')}\n  ]\n`))

const after = loadPack(pack).content
const problems = mapProblems(after)
console.log(problems.length ? problems.join('\n') : 'the map and the borders agree')
for (const n of after.neighbours) console.log(`  ${n.id}: ${n.borders.join(', ')}${n.near ? ', home' : ''}`)

const svg = [
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${map.width} ${map.height}" width="${map.width}" height="${map.height}" font-family="Georgia" font-size="13">`,
  ...cells.map((c) => `<polygon points="${c.points.map((p) => p.join(',')).join(' ')}" fill="${c.sea ? '#9fc3d6' : c.id === HOME ? '#d4a72c' : '#e8e4d6'}" stroke="${c.sea ? '#9fc3d6' : '#555'}" stroke-width="1"/>`),
  ...cells.filter((c) => !c.sea).map((c) => `<text x="${c.centre[0]}" y="${c.centre[1]}" text-anchor="middle">${c.id}</text>`),
  '</svg>',
].join('\n')
const out = process.argv[2] ?? join(root, 'out')
mkdirSync(out, { recursive: true })
writeFileSync(join(out, 'map.svg'), svg)
