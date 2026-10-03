import type { ReactNode } from 'react'
import type { FrontPage as Page, Story } from '../../logic/frontpage.ts'

function Brief({ story }: { story: Story }) {
  return (
    <li className="paper__brief">
      <p className="label soft">{story.kicker}</p>
      <h4 className="paper__brief-head">{story.headline}</h4>
      {story.text && <p>{story.text}</p>}
      {story.paragraphs.map((paragraph, i) => (
        <p key={i} className="soft">
          {paragraph}
        </p>
      ))}
    </li>
  )
}

export interface FrontPageProps {
  page: Page
  capital: string
  // Goes under the lead story: the way to the term report after an election or a fall.
  after?: ReactNode
}

// Paragraphs of the lead story printed before the rest is folded away.
const SHOWN = 2

// The morning paper. It reports the day before in sentences, and never prints a figure
// for a movement.
export function FrontPage({ page, capital, after }: FrontPageProps) {
  const { lead, briefs } = page
  return (
    <article className={page.quiet ? 'paper paper--quiet' : 'paper'} aria-labelledby="paper-name">
      <header className="paper__plate">
        <h2 id="paper-name" className="paper__name">
          {page.paper}
        </h2>
        <p className="paper__dateline label soft">
          Morning edition, day {page.day}. Printed in {capital}.
        </p>
      </header>

      <div className="paper__lead">
        <h3 className="paper__headline">{lead.headline}</h3>
        {lead.text && <p className="paper__standfirst">{lead.text}</p>}
        {lead.paragraphs.length > 0 && (
          <div className="paper__body">
            {lead.paragraphs.slice(0, SHOWN).map((paragraph, i) => (
              <p key={i}>{paragraph}</p>
            ))}
            {lead.paragraphs.length > SHOWN && (
              <details className="paper__rest">
                <summary>The full story</summary>
                {lead.paragraphs.slice(SHOWN).map((paragraph, i) => (
                  <p key={i}>{paragraph}</p>
                ))}
              </details>
            )}
          </div>
        )}
        {after}
      </div>

      {briefs.length > 0 && (
        <section className="paper__briefs" aria-labelledby="paper-briefs">
          <h3 id="paper-briefs" className="label">
            Also in today's paper
          </h3>
          <ul>
            {briefs.map((story, i) => (
              <Brief key={i} story={story} />
            ))}
          </ul>
        </section>
      )}
    </article>
  )
}
