import './styles/tokens.css'
import './styles/base.css'
import './styles/components.css'
import './styles/screens.css'
import './styles/world.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App.tsx'
import { pack } from './pack.ts'
import { browserStore } from './store/browser.ts'
import { GameProvider } from './store/game.tsx'
import { createGameStore } from './store/gameStore.ts'
import { SettingsProvider } from './store/settings.tsx'
import { Announcer } from './ui/index.ts'

const { kv, persistent } = browserStore()
const store = createGameStore(kv, pack)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SettingsProvider kv={kv}>
      <GameProvider store={store}>
        <Announcer>
          <App persistent={persistent} />
        </Announcer>
      </GameProvider>
    </SettingsProvider>
  </StrictMode>,
)
