import type { GovRoute } from '../../logic/router.ts'
import type { Current } from '../../store/game.tsx'
import { BodyPage } from './BodyPage.tsx'
import { Country } from './Country.tsx'
import { DocumentPage } from './DocumentPage.tsx'
import { Executive } from './Executive.tsx'
import { Founder } from './Founder.tsx'
import { InForce } from './InForce.tsx'
import { Library } from './Library.tsx'
import { Today } from './Today.tsx'

// The nation's government website, inside the game: #/n/<id>/gov/...
export function GovSite({ route, current }: { route: GovRoute; current: Current }) {
  switch (route.page) {
    case 'today':
      return <Today current={current} />
    case 'library':
      return <Library current={current} query={route.query} />
    case 'doc':
      return <DocumentPage key={route.doc} current={current} docId={route.doc} />
    case 'body':
      return <BodyPage current={current} bodyId={route.body} />
    case 'in-force':
      return <InForce current={current} />
    case 'executive':
      return <Executive current={current} />
    case 'country':
      return <Country current={current} />
    case 'founder':
      return <Founder current={current} />
  }
}
