import type { DocumentHead, GovernmentState } from '@diplomat/government'
import { useEffect, useId, useState, type CSSProperties, type ReactNode } from 'react'
import { SERIES_NAMES } from '../../logic/forms.ts'
import { flagShapes } from '../../logic/flags.ts'
import { docRoute, routeHref, type GovRoute } from '../../logic/router.ts'
import type { Current } from '../../store/game.tsx'
import { Flag, Notice, Screen, TextLink } from '../../ui/index.ts'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

// The nation's own date for an engine day, as the Archive writes it. Day 1 is the calendar's
// start. The same sum as packages/government/documents.ts, kept here so the page needs
// nothing from that package at run time.
export function nationDate(government: GovernmentState | null, day: number): string {
  const start = government?.institutions.calendar.start
  const parts = start?.split('-').map(Number)
  if (!parts || parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return `Day ${day}`
  const date = new Date(Date.UTC(parts[0]!, parts[1]! - 1, parts[2]! + day - 1))
  return `${DAYS[date.getUTCDay()]} ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`
}

export interface Loaded<T> {
  data: T | null
  error: string | null
  loading: boolean
}

// Reads something from the server for a page, again whenever the key changes. A late
// answer for an old key is dropped.
export function useLoad<T>(key: string, load: () => Promise<T>): Loaded<T> {
  const [state, setState] = useState<Loaded<T> & { key: string }>({ key: '', data: null, error: null, loading: true })
  useEffect(() => {
    let live = true
    setState((old) => ({ ...old, key, loading: true, error: null }))
    load().then(
      (data) => live && setState({ key, data, error: null, loading: false }),
      (error: unknown) =>
        live && setState({ key, data: null, error: error instanceof Error ? error.message : 'It could not be read.', loading: false }),
    )
    return () => {
      live = false
    }
    // The key says when to load again; the loader is a fresh closure every render.
  }, [key])
  return state.key === key ? state : { data: null, error: null, loading: true }
}

export function Loading<T>({ loaded, what, children }: { loaded: Loaded<T>; what: string; children(data: T): ReactNode }) {
  if (loaded.error) {
    return (
      <Notice tone="problem" title={`${what} could not be read`}>
        <p>{loaded.error}</p>
      </Notice>
    )
  }
  if (loaded.loading || loaded.data === null) return <p className="soft small">Fetching {what.toLowerCase()} from the Archive.</p>
  return <>{children(loaded.data)}</>
}

export function DocLine({ nation, head, government }: { nation: string; head: DocumentHead; government: GovernmentState | null }) {
  return (
    <li className="doclist__item">
      <TextLink to={docRoute(nation, head.id)} className="doclist__title">
        {head.title}
      </TextLink>
      <span className="doclist__meta small soft">
        {SERIES_NAMES[head.series] ?? head.series}, {head.issuer}, {head.date || nationDate(government, head.day)}
      </span>
    </li>
  )
}

export function DocList({
  nation,
  heads,
  government,
  empty,
}: {
  nation: string
  heads: readonly DocumentHead[]
  government: GovernmentState | null
  empty: string
}) {
  if (heads.length === 0) return <p className="gov-none">{empty}</p>
  return (
    <ul className="doclist">
      {heads.map((head) => (
        <DocLine key={head.id} nation={nation} head={head} government={government} />
      ))}
    </ul>
  )
}

// The government website's sections, in the order its own navigation gives them.
function sections(current: Current): { route: GovRoute; label: string; key: string }[] {
  const id = current.id
  const bodies = (current.government?.institutions.bodies ?? []).filter((b) => b.kind !== 'ministry')
  return [
    { route: { name: 'gov', id, page: 'today' }, label: 'Today', key: 'today' },
    { route: { name: 'gov', id, page: 'library', query: {} }, label: 'Library', key: 'library' },
    { route: { name: 'gov', id, page: 'in-force' }, label: 'In force', key: 'in-force' },
    ...bodies.map((b) => ({
      route: { name: 'gov', id, page: 'body', body: b.id } as GovRoute,
      label: b.shortName.charAt(0).toUpperCase() + b.shortName.slice(1),
      key: `body:${b.id}`,
    })),
    { route: { name: 'gov', id, page: 'executive' }, label: 'Executive', key: 'executive' },
    { route: { name: 'gov', id, page: 'country' }, label: 'Country', key: 'country' },
    { route: { name: 'gov', id, page: 'founder' }, label: 'Founder’s page', key: 'founder' },
  ]
}

export interface GovFrameProps {
  current: Current
  // Which section is showing, as the menu keys them.
  here: string
  title: string
  kicker?: string
  intro?: ReactNode
  // The Founder's page is midnight and gold in both themes.
  founder?: boolean
  children: ReactNode
}

// Every page of the government website: the official strip, the masthead with the flag as
// its seal, the site's own navigation, then the page. The flag's colours are the accents.
export function GovFrame({ current, here, title, kicker, intro, founder, children }: GovFrameProps) {
  const government = current.government
  const { identity } = current.state
  const colours = [...new Set(flagShapes(identity.flag).map((s) => s.colour))]
  const style = {
    '--flag-a': colours[0] ?? 'var(--gov-navy)',
    '--flag-b': colours[1] ?? colours[0] ?? 'var(--gov-gold)',
  } as CSSProperties
  const stateName = government?.institutions.constitution.stateName ?? identity.name
  return (
    <div className={founder ? 'gov gov--founder' : 'gov'} style={style}>
      <p className="gov__official small">
        <strong>An official website of {stateName}.</strong> It is served from this computer and keeps its record
        there.
      </p>
      <div className="gov__masthead">
        <Flag flag={identity.flag} className="gov__seal" />
        <div className="gov__names">
          <p className="gov__state">{stateName}</p>
          {identity.motto && <p className="gov__motto">{identity.motto}</p>}
        </div>
        <p className="gov__date small">
          <span>{nationDate(government, current.state.day)}</span>
          <span className="soft">Day {current.state.day}</span>
        </p>
      </div>
      <nav className="gov__nav" aria-label="The government website">
        <ul>
          {sections(current).map((section) => (
            <li key={section.key}>
              <a href={routeHref(section.route)} aria-current={section.key === here ? 'page' : undefined}>
                {section.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <Screen title={title} kicker={kicker} intro={intro} className="gov__page">
        {government ? (
          children
        ) : (
          <p className="gov-none">This nation has no government on record. The server sent none.</p>
        )}
      </Screen>
    </div>
  )
}

// A titled, ruled section of a government page.
export function Band({ title, children }: { title: string; children: ReactNode }) {
  const id = useId()
  return (
    <section className="gov-band" aria-labelledby={id}>
      <h2 id={id}>{title}</h2>
      {children}
    </section>
  )
}
