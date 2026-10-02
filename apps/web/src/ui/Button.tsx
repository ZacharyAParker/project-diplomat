import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from 'react'
import { routeHref, type Route } from '../logic/router.ts'

export type Look = 'primary' | 'secondary' | 'accent' | 'danger' | 'quiet'

interface Shared {
  look?: Look
  size?: 'regular' | 'small'
  // Fills the width of its container, for the one main action at the foot of a phone screen.
  wide?: boolean
}

function classes({ look = 'secondary', size = 'regular', wide = false }: Shared, extra?: string): string {
  return ['button', `button--${look}`, size === 'small' && 'button--small', wide && 'button--wide', extra]
    .filter(Boolean)
    .join(' ')
}

export type ButtonProps = Shared & ButtonHTMLAttributes<HTMLButtonElement>

export function Button({ look, size, wide, className, type = 'button', ...rest }: ButtonProps) {
  return <button type={type} className={classes({ look, size, wide }, className)} {...rest} />
}

export type LinkToProps = Shared & { to: Route } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>

// A link that looks like a button. Use it for anything that goes somewhere, and Button
// for anything that does something.
export function LinkTo({ to, look, size, wide, className, ...rest }: LinkToProps) {
  return <a href={routeHref(to)} className={classes({ look, size, wide }, className)} {...rest} />
}

export type TextLinkProps = { to: Route } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>

export function TextLink({ to, className, ...rest }: TextLinkProps) {
  return <a href={routeHref(to)} className={['link', className].filter(Boolean).join(' ')} {...rest} />
}
