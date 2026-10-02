import type { Change } from '@diplomat/engine'
import { useState } from 'react'
import { DEFAULT_FLAG, LAYOUTS, withLayout } from '../logic/flags.ts'
import { EMPTY_TEXT } from '../logic/identity.ts'
import { THEMES, type Theme } from '../logic/settings.ts'
import { useGame } from '../store/game.tsx'
import { useSettings } from '../store/settings.tsx'
import {
  Bar,
  Button,
  ChangeList,
  ChoiceList,
  Dialog,
  EntrySheet,
  FileButton,
  Flag,
  FlagEditor,
  IdentityFields,
  LinkTo,
  Masthead,
  Meter,
  Notice,
  Pips,
  Rule,
  Screen,
  Segmented,
  Sheet,
  Spark,
  Steps,
  Tag,
  TextField,
  TextLink,
} from '../ui/index.ts'

const PACES = [
  { value: 'slow', label: 'Slow' },
  { value: 'steady', label: 'Steady' },
  { value: 'brisk', label: 'Brisk' },
] as const
type Pace = (typeof PACES)[number]['value']

const THEME_NAMES: Record<Theme, string> = { system: 'Follow the system', light: 'Day', dark: 'Night' }

function sampleChanges(factions: string[], portfolios: string[]): Change[] {
  const changes: Change[] = [
    { kind: 'indicator', target: 'debt', by: 8, why: 'The week ended in deficit and the gap was borrowed.' },
    { kind: 'indicator', target: 'health', by: 2, why: 'Nobody loses an hour of sleep in March.' },
    {
      kind: 'indicator',
      target: 'inequality',
      by: -5,
      why: 'The top rate went up and the bottom rate went down.',
    },
  ]
  if (factions[0])
    changes.push({ kind: 'faction', target: factions[0], by: 9, why: 'They asked for this in writing.' })
  if (factions[1])
    changes.push({ kind: 'faction', target: factions[1], by: -3, why: 'They asked for the opposite.' })
  if (portfolios[0]) {
    changes.push({
      kind: 'minister',
      target: portfolios[0],
      by: -14,
      why: 'The minister was overruled in front of everyone.',
    })
  }
  return changes
}

// One copy of every base component. It is printed twice, once per theme, so a change
// to a token can be checked in both without touching the settings.
function Specimens() {
  const { content } = useGame()
  const [text, setText] = useState('Vesland')
  const [identity, setIdentity] = useState(EMPTY_TEXT)
  const [flag, setFlag] = useState(DEFAULT_FLAG)
  const [pace, setPace] = useState<Pace>('steady')
  const [choice, setChoice] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const changes = sampleChanges(
    content.factions.map((f) => f.id),
    content.portfolios.map((p) => p.id),
  )

  return (
    <div className="kit__specimens">
      <Sheet kicker="Type" title="A headline set in Besley">
        <h3>A smaller heading, for inside a sheet</h3>
        <p className="lede">
          The lede is a size up from the text, for the one paragraph that sets a page going.
        </p>
        <p>
          The text face is Source Serif. It does the reading: descriptions, speeches, reasons. Figures in
          running text are old-style, like 45 days, and in tables they line up.
        </p>
        <p className="small soft">Small and soft, for hints and asides.</p>
        <p className="label">A label, in spaced capitals</p>
      </Sheet>

      <Sheet kicker="Masthead" title="Nameplates">
        <Masthead />
        <Masthead
          nation={{
            id: 'kit',
            identity: { ...EMPTY_TEXT, name: 'Vesland', capital: 'Highmarch', flag },
            day: 12,
            className: 'Muddle',
            support: 51.4,
            electionIn: 33,
          }}
          page="desk"
        />
      </Sheet>

      <Sheet kicker="Entries and trends" title="What happened, and which way it is going">
        <EntrySheet
          entry={{
            day: 12,
            kind: 'decision',
            headline: 'Clocks to stay where they are',
            text: 'The motion was carried at ten past, or possibly ten to.',
            changes: changes.slice(0, 2),
          }}
          content={content}
        />
        <p className="row">
          <Spark values={[48, 49, 47, 51, 55, 54, 58]} />
          <Spark values={[60, 52, 50, 44, 41]} />
          <Spark values={[50]} />
        </p>
      </Sheet>

      <Sheet kicker="Buttons and links" title="Things to press">
        <div className="row">
          <Button look="primary">Primary</Button>
          <Button look="secondary">Secondary</Button>
          <Button look="accent">Confirm</Button>
          <Button look="danger">Danger</Button>
          <Button look="quiet">Quiet</Button>
          <Button look="secondary" size="small">
            Small
          </Button>
          <Button look="primary" disabled>
            Disabled
          </Button>
        </div>
        <div className="row">
          <LinkTo to={{ name: 'kit' }} look="primary">
            A link that looks like a button
          </LinkTo>
          <TextLink to={{ name: 'kit' }}>A link in running text</TextLink>
          <FileButton look="secondary" onText={() => {}}>
            Pick a file
          </FileButton>
        </div>
        <Button look="primary" wide>
          Wide, for the foot of a phone screen
        </Button>
      </Sheet>

      <Sheet kicker="Sheets" title="A column, which is the default">
        <p>A column is a ruled stretch of the page. Most things are columns.</p>
        <Sheet look="paper" kicker="From the box" title="A paper" level={3}>
          <p>A paper is a separate sheet handed to the player to deal with. Use few of them.</p>
        </Sheet>
        <Rule />
        <Rule weight="heavy" />
        <Rule weight="double" />
        <div className="row">
          <Tag>Plain</Tag>
          <Tag tone="accent">Accent</Tag>
          <Tag tone="good">For the better</Tag>
          <Tag tone="bad">For the worse</Tag>
        </div>
        <Notice title="A note">
          <p>Something the player should know and need not act on.</p>
        </Notice>
        <Notice
          tone="problem"
          title="A problem"
          actions={<Button size="small">Do something about it</Button>}
        >
          <p>Something went wrong. It says what, and what can be done.</p>
        </Notice>
      </Sheet>

      <Sheet kicker="Numbers" title="Meters, bars and pips">
        <Meter
          label="Reservoir level"
          value={45}
          valueText="45 of 100"
          hint="The large gauge, for the number a card is about."
        />
        <div>
          <Bar label="Debt" value={62} was={54} note="Up 8 since yesterday, which is worse." />
          <Bar label="Living standards" value={47} />
          <Bar label="Legitimacy" value={71} was={75} />
        </div>
        <div className="row">
          <Pips size="small" tone="good" /> <span className="small">a little</span>
          <Pips size="moderate" tone="neutral" /> <span className="small">somewhat</span>
          <Pips size="large" tone="bad" /> <span className="small">a lot</span>
        </div>
      </Sheet>

      <Sheet kicker="Changes" title="What moved, and why">
        <ChangeList changes={changes} content={content} reason="shown" />
        <h3>With the reasons folded away</h3>
        <ChangeList changes={changes.slice(0, 3)} content={content} reason="folded" />
      </Sheet>

      <Sheet kicker="Forms" title="Fields and choices">
        <TextField label="Name of the nation" hint="A hint goes here." value={text} onChange={setText} />
        <TextField label="Capital" value="" onChange={() => {}} error="This cannot be left blank." />
        <Segmented<Pace> legend="Pace" options={PACES} value={pace} onChange={setPace} />
        <ChoiceList
          legend={<h3>Which statue goes outside the parliament?</h3>}
          options={[
            { value: 'pens', label: 'People holding pens.' },
            {
              value: 'flags',
              label: 'People holding flags.',
              detail: 'A second line, for anything that needs one.',
            },
            { value: 'none', label: 'There was no budget for statues.' },
          ]}
          value={choice}
          onChange={setChoice}
        />
        <Steps label="An example of steps" steps={['Name', 'Flag', 'Character']} current={1} />
      </Sheet>

      <Sheet kicker="Identity" title="The five names, with suggestions">
        <IdentityFields value={identity} onChange={setIdentity} errors={{}} />
      </Sheet>

      <Sheet kicker="Flags" title="Every layout, and the editor">
        <ul className="kit__flags">
          {LAYOUTS.map((layout) => (
            <li key={layout.id}>
              <Flag flag={withLayout(flag, layout.id)} width="100%" label={layout.name} />
              <span className="small">{layout.name}</span>
            </li>
          ))}
        </ul>
        <FlagEditor value={flag} onChange={setFlag} />
      </Sheet>

      <Sheet kicker="Dialog" title="For the moments that should stop the player">
        <Button look="secondary" onClick={() => setOpen(true)}>
          Open the dialog
        </Button>
        <Dialog
          open={open}
          title="End the day with papers on the desk?"
          onClose={() => setOpen(false)}
          actions={
            <>
              <Button look="secondary" onClick={() => setOpen(false)}>
                Go back
              </Button>
              <Button look="accent" onClick={() => setOpen(false)}>
                End the day
              </Button>
            </>
          }
        >
          <p>Anything left undecided is gone in the morning.</p>
        </Dialog>
      </Sheet>
    </div>
  )
}

export function Kit() {
  const { settings, change } = useSettings()
  return (
    <Screen
      title="The kit"
      kicker="For whoever builds the next screen"
      intro={<p>Every base component, in the day edition and the night edition.</p>}
      className="kit"
    >
      <div className="kit__settings row">
        <Segmented
          legend="Theme for the whole app"
          options={THEMES.map((theme) => ({ value: theme, label: THEME_NAMES[theme] }))}
          value={settings.theme}
          onChange={(theme) => change({ theme })}
        />
        <Segmented
          legend="Motion"
          options={[
            { value: 'full', label: 'As designed' },
            { value: 'reduced', label: 'Reduced' },
          ]}
          value={settings.reduceMotion ? 'reduced' : 'full'}
          onChange={(value) => change({ reduceMotion: value === 'reduced' })}
        />
      </div>
      <div className="kit__editions">
        <section data-theme="light" className="kit__edition" aria-label="Day edition">
          <p className="label">Day edition</p>
          <Specimens />
        </section>
        <section data-theme="dark" className="kit__edition" aria-label="Night edition">
          <p className="label">Night edition</p>
          <Specimens />
        </section>
      </div>
    </Screen>
  )
}
