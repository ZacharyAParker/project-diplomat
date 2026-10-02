import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { hasNavigated } from '../store/route.ts'

export interface ScreenProps {
  // The h1, and the start of the browser tab's title.
  title: string
  // Small capitals above the title.
  kicker?: string
  // Shown under the title, as part of the header.
  intro?: ReactNode
  // Changing it hands focus back to the title, for a screen that turns into another
  // without the address changing.
  focusKey?: string | number
  className?: string
  children: ReactNode
}

// Every screen is one of these. It owns the h1 and takes focus to it after navigation,
// so a keyboard or screen reader user lands at the top of the new page and not wherever
// the old one left them.
export function Screen({ title, kicker, intro, focusKey, className, children }: ScreenProps) {
  const heading = useRef<HTMLHeadingElement>(null)
  const first = useRef(true)

  useEffect(() => {
    document.title = `${title} · Project Diplomat`
  }, [title])

  useEffect(() => {
    const arrived = first.current ? hasNavigated() : true
    first.current = false
    if (!arrived) return
    heading.current?.focus({ preventScroll: true })
    document.documentElement.scrollTop = 0
  }, [focusKey])

  return (
    <div className={['screen', className].filter(Boolean).join(' ')}>
      <header className="screen__head">
        {kicker && <p className="label soft">{kicker}</p>}
        <h1 ref={heading} tabIndex={-1}>
          {title}
        </h1>
        {intro && <div className="screen__intro lede measure">{intro}</div>}
      </header>
      {children}
    </div>
  )
}

const AnnounceContext = createContext<(message: string) => void>(() => {})

// One polite live region for the whole app. A screen calls announce() with the result
// of something the player did, and a screen reader says it without moving focus.
export function Announcer({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState('')
  const announce = useCallback((text: string) => {
    // Cleared first, so saying the same thing twice in a row is still heard twice.
    setMessage('')
    window.setTimeout(() => setMessage(text), 30)
  }, [])
  return (
    <AnnounceContext.Provider value={announce}>
      {children}
      <div className="visually-hidden" role="status" aria-live="polite">
        {message}
      </div>
    </AnnounceContext.Provider>
  )
}

export function useAnnounce(): (message: string) => void {
  return useContext(AnnounceContext)
}

export interface StepsProps {
  label: string
  steps: readonly string[]
  // Index of the step the player is on.
  current: number
}

export function Steps({ label, steps, current }: StepsProps) {
  return (
    <ol className="steps" aria-label={label}>
      {steps.map((step, i) => (
        <li
          key={step}
          className={
            i === current
              ? 'steps__step steps__step--current'
              : i < current
                ? 'steps__step steps__step--done'
                : 'steps__step'
          }
          aria-current={i === current ? 'step' : undefined}
        >
          <span className="steps__number figures" aria-hidden="true">
            {i + 1}
          </span>
          <span className="label">{step}</span>
          {i < current && <span className="visually-hidden"> (done)</span>}
        </li>
      ))}
    </ol>
  )
}
