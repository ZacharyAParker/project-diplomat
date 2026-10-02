import type { Identity } from '@diplomat/engine'
import type { ReactNode } from 'react'
import { dayLabel, electionLabel, percent } from '../logic/changes.ts'
import { routeHref, type NationPage } from '../logic/router.ts'
import { Flag } from './Flag.tsx'

export interface MastheadNation {
  id: string
  identity: Identity
  day: number
  className: string
  support: number
  electionIn: number
}

export interface MastheadProps {
  // The nation in play. Left out on the screens that are not inside one.
  nation?: MastheadNation
  // Which of the nation's pages is showing, to mark it in the navigation.
  page?: NationPage
}

const PAGES: readonly { page: NationPage; label: string }[] = [
  { page: 'desk', label: 'Desk' },
  { page: 'nation', label: 'Nation' },
  { page: 'record', label: 'Record' },
  { page: 'settings', label: 'Settings' },
]

// The top of every page, set like a newspaper's nameplate: the name large, a dateline
// under it, and a thick and thin rule to close it off.
export function Masthead({ nation, page }: MastheadProps) {
  if (!nation) {
    return (
      <header className="masthead">
        <a className="masthead__plate" href={routeHref({ name: 'home' })}>
          Project Diplomat
        </a>
        <p className="masthead__dateline label soft">A nation game. No right answers.</p>
      </header>
    )
  }
  const { identity } = nation
  return (
    <header className="masthead masthead--nation">
      <a className="masthead__back label" href={routeHref({ name: 'home' })}>
        All nations
      </a>
      <a className="masthead__plate" href={routeHref({ name: 'nation', id: nation.id, page: 'desk' })}>
        <Flag flag={identity.flag} width="1.5em" className="masthead__flag" />
        <span>{identity.name}</span>
      </a>
      <ul className="masthead__dateline label" aria-label="The state of the nation">
        <li>{dayLabel(nation.day)}</li>
        <li>{nation.className}</li>
        <li>{electionLabel(nation.electionIn)}</li>
        <li>Support {percent(nation.support)}</li>
      </ul>
      <nav className="nav" aria-label="Pages">
        <ul>
          {PAGES.map((item) => (
            <li key={item.page}>
              <a
                className="nav__link label"
                href={routeHref({ name: 'nation', id: nation.id, page: item.page })}
                aria-current={item.page === page ? 'page' : undefined}
              >
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
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
      <Masthead nation={nation} page={page} />
      <main id="main" className="shell__main" tabIndex={-1}>
        {children}
      </main>
      <footer className="colophon small soft">{colophon}</footer>
    </div>
  )
}

// The address bar belongs to the router, so the skip link moves focus by hand and
// leaves the hash alone.
function skipToMain(event: { preventDefault(): void }) {
  event.preventDefault()
  document.getElementById('main')?.focus()
}
