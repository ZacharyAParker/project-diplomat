import type { Identity } from '@diplomat/engine'
import type { ReactNode } from 'react'
import { dayLabel, electionLabel, percent } from '../logic/changes.ts'
import { routeHref, type NationPage } from '../logic/router.ts'
import { Banner } from './Banner.tsx'
import { Flag } from './Flag.tsx'
import { Icon, type IconName } from './Icons.tsx'

export interface MastheadNation {
  id: string
  identity: Identity
  day: number
  className: string
  support: number
  electionIn: number
  // True once the sandbox has changed it, which every page then says.
  sandbox?: boolean
  // The newest few headlines from the record, newest first, for the sidebar.
  latest?: readonly { day: number; headline: string }[]
}

export interface MastheadProps {
  // The nation in play. Left out on the screens that are not inside one.
  nation?: MastheadNation
  // Which of the nation's pages is showing, to mark it in the navigation.
  page?: NationPage
}

const PAGES: readonly { page: NationPage; label: string; icon: IconName }[] = [
  { page: 'desk', label: 'Issues', icon: 'desk' },
  { page: 'nation', label: 'Nation', icon: 'nation' },
  { page: 'record', label: 'Record', icon: 'record' },
  { page: 'settings', label: 'Settings', icon: 'settings' },
  { page: 'sandbox', label: 'Sandbox', icon: 'sandbox' },
]

function Wordmark() {
  return (
    <a className="side__mark" href={routeHref({ name: 'home' })}>
      <span className="side__mark-word">Project</span>
      <span className="side__mark-word side__mark-word--big">Diplomat</span>
      <span className="side__mark-by">a nation game</span>
    </a>
  )
}

// The menu down the left of every page. On a phone it folds into a bar along the top.
function Side({ nation, page }: MastheadProps) {
  return (
    <aside className="side" aria-label="Menu">
      <Wordmark />
      {nation ? (
        <nav className="side__nav" aria-label="Pages">
          <ul>
            {PAGES.map((item) => (
              <li key={item.page}>
                <a
                  className="side__link"
                  href={routeHref({ name: 'nation', id: nation.id, page: item.page })}
                  aria-current={item.page === page ? 'page' : undefined}
                >
                  <Icon name={item.icon} />
                  <span>{item.label}</span>
                </a>
              </li>
            ))}
            <li className="side__away">
              <a className="side__link" href={routeHref({ name: 'home' })}>
                <Icon name="nations" />
                <span>All nations</span>
              </a>
            </li>
          </ul>
        </nav>
      ) : (
        <nav className="side__nav" aria-label="Pages">
          <ul>
            <li>
              <a className="side__link" href={routeHref({ name: 'home' })}>
                <Icon name="nations" />
                <span>All nations</span>
              </a>
            </li>
            <li>
              <a className="side__link" href={routeHref({ name: 'found', step: 'identity' })}>
                <Icon name="found" />
                <span>New nation</span>
              </a>
            </li>
            <li className="side__away">
              <a className="side__link" href={routeHref({ name: 'admin' })}>
                <Icon name="admin" />
                <span>Admin</span>
              </a>
            </li>
          </ul>
        </nav>
      )}
      {nation?.latest && nation.latest.length > 0 && (
        <section className="side__latest" aria-labelledby="side-latest">
          <p id="side-latest" className="side__heading">
            Latest in the record
          </p>
          <ul>
            {nation.latest.map((item, i) => (
              <li key={i}>
                <a href={routeHref({ name: 'nation', id: nation.id, page: 'record' })}>{item.headline}</a>{' '}
                <span className="soft">(day {item.day})</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </aside>
  )
}

// The nation's strip across the top: its landscape, its flag, its name, and the four figures
// a player checks every morning.
export function Masthead({ nation, page }: MastheadProps) {
  if (!nation) return null
  const { identity } = nation
  // The nation page sets out the flag and the name at full size itself.
  if (page === 'nation') {
    return (
      <header className="masthead masthead--bare">
        <Banner id={nation.id} flag={identity.flag} />
      </header>
    )
  }
  return (
    <header className="masthead">
      <Banner id={nation.id} flag={identity.flag} />
      <div className="masthead__plate">
        <a className="masthead__flag-link" href={routeHref({ name: 'nation', id: nation.id, page: 'nation' })}>
          <Flag flag={identity.flag} className="masthead__flag" />
        </a>
        <div className="masthead__names">
          <a className="masthead__name" href={routeHref({ name: 'nation', id: nation.id, page: 'nation' })}>
            {identity.name}
          </a>
          <p className="masthead__class">
            {nation.className}
            {nation.sandbox && <span className="sandbox-mark">Sandbox</span>}
          </p>
        </div>
      </div>
      <ul className="masthead__dateline" aria-label="The state of the nation">
        <li>{dayLabel(nation.day)}</li>
        <li>{electionLabel(nation.electionIn)}</li>
        <li>Support {percent(nation.support)}</li>
      </ul>
    </header>
  )
}

export interface ShellProps extends MastheadProps {
  // Printed at the foot of every page.
  colophon: ReactNode
  children: ReactNode
}

export function Shell({ nation, page, colophon, children }: ShellProps) {
  return (
    <div className={nation ? 'shell shell--nation' : 'shell'}>
      <a className="skip" href="#main" onClick={skipToMain}>
        Skip to the page
      </a>
      <Side nation={nation} page={page} />
      <div className="shell__page">
        <Masthead nation={nation} page={page} />
        <main id="main" className="shell__main" tabIndex={-1}>
          {children}
        </main>
        <footer className="colophon small soft">{colophon}</footer>
      </div>
    </div>
  )
}

// The address bar belongs to the router, so the skip link moves focus by hand and
// leaves the hash alone.
function skipToMain(event: { preventDefault(): void }) {
  event.preventDefault()
  document.getElementById('main')?.focus()
}
