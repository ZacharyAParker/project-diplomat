import type { ReactNode } from 'react'

export interface SheetProps {
  // The small capitals above the rule: what kind of thing this is.
  kicker?: string
  title?: ReactNode
  level?: 2 | 3
  // "column" is a ruled section of the page, the default. "paper" is a separate sheet
  // lying on the desk, for the few things that are handed to the player to deal with.
  look?: 'column' | 'paper'
  as?: 'section' | 'article' | 'aside' | 'div'
  className?: string
  children: ReactNode
}

export function Sheet(props: SheetProps) {
  const { kicker, title, level = 2, look = 'column', as: Element = 'section', className, children } = props
  const Heading = level === 2 ? 'h2' : 'h3'
  return (
    <Element className={['sheet', `sheet--${look}`, className].filter(Boolean).join(' ')}>
      {kicker && <p className="sheet__kicker label">{kicker}</p>}
      {title && <Heading className="sheet__title">{title}</Heading>}
      {children}
    </Element>
  )
}

export function Rule({ weight = 'hair' }: { weight?: 'hair' | 'heavy' | 'double' }) {
  return <hr className={`rule rule--${weight}`} />
}

export interface TagProps {
  tone?: 'plain' | 'accent' | 'good' | 'bad'
  children: ReactNode
}

export function Tag({ tone = 'plain', children }: TagProps) {
  return <span className={`tag tag--${tone} label`}>{children}</span>
}

export interface NoticeProps {
  // A problem is announced at once. Anything else waits its turn.
  tone?: 'note' | 'problem'
  title?: string
  children: ReactNode
  actions?: ReactNode
}

export function Notice({ tone = 'note', title, children, actions }: NoticeProps) {
  return (
    <div className={`notice notice--${tone}`} role={tone === 'problem' ? 'alert' : 'status'}>
      {title && <p className="notice__title label">{title}</p>}
      <div className="notice__body">{children}</div>
      {actions && <div className="notice__actions row">{actions}</div>}
    </div>
  )
}
