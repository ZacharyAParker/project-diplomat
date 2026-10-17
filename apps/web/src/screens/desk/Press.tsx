import { docRoute } from '../../logic/router.ts'
import { useGame, type Current } from '../../store/game.tsx'
import { TextLink } from '../../ui/index.ts'
import { readAlmanac } from '../gov/almanac.ts'
import { useLoad } from '../gov/shared.tsx'

// What the country's own papers led with, from the latest day the world has written. The
// engine's paper beside it says what moved; this says what people read over breakfast.
export function Press({ current }: { current: Current }) {
  const game = useGame()
  const latest = useLoad(`press:${current.id}:${current.state.day}`, async () => {
    const page = await game.archive({ series: 'almanac', limit: 1 })
    const head = page.documents[0]
    if (!head) return null
    const { document } = await game.document(head.id)
    return { document, day: readAlmanac(document.data) }
  })
  const found = latest.data
  if (!found || found.day.press.length === 0) return null
  const { document, day } = found
  return (
    <section className="press" aria-labelledby="press-title">
      <h2 id="press-title" className="press__title">
        The papers
      </h2>
      <p className="label soft">{document.date}</p>
      <ul className="press__list">
        {day.press.map((item, i) => (
          <li key={i} className="press__item">
            <p className="label soft">{item.outlet}</p>
            <p className="press__headline">{item.headline}</p>
            {item.text && <p className="small">{item.text}</p>}
          </li>
        ))}
      </ul>
      <p className="small">
        <TextLink to={docRoute(current.id, document.id)}>The whole day in the almanac</TextLink>
      </p>
    </section>
  )
}
