import { useMemo, useSyncExternalStore } from 'react'
import { parseRoute, routeHref, type Route } from '../logic/router.ts'

let navigations = 0

function subscribe(listener: () => void) {
  const heard = () => {
    navigations += 1
    listener()
  }
  window.addEventListener('hashchange', heard)
  return () => window.removeEventListener('hashchange', heard)
}

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash)
  return useMemo(() => parseRoute(hash), [hash])
}

// Replacing is for redirects, so that Back does not bounce straight forward again.
export function go(route: Route, how: 'push' | 'replace' = 'push') {
  const href = routeHref(route)
  if (how === 'replace') window.location.replace(href)
  else window.location.hash = href
}

// False until the first move inside the app. A screen takes focus when it is navigated
// to, and not when the page is first loaded, where the browser's own start is better.
export function hasNavigated(): boolean {
  return navigations > 0
}
