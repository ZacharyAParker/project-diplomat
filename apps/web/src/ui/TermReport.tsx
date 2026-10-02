import type { Content, TimelineEntry } from '@diplomat/engine'
import { VERDICTS, dayLabel, percent } from '../logic/changes.ts'
import { VERDICT_LINES, type TermReport, type TermRow } from '../logic/term.ts'
import { ChangeList } from './Changes.tsx'
import { Meter } from './Meter.tsx'
import { Sheet } from './Sheet.tsx'

const ARROWS = { up: 'Up', down: 'Down', none: 'No change' } as const

function Row({ row }: { row: TermRow }) {
  const figure = (value: number | null) => (value === null ? 'Not kept' : Math.round(value))
  return (
    <tr className={`term__row term__row--${row.tone}`}>
      <th scope="row">{row.name}</th>
      <td className="figures">{figure(row.start)}</td>
      <td className="figures">{figure(row.end)}</td>
      <td>
        {row.start === null || row.end === null ? (
          <span className="soft">Unknown</span>
        ) : (
          <>
            {ARROWS[row.direction]}
            {VERDICTS[row.tone] && `, ${VERDICTS[row.tone]}`}
          </>
        )}
      </td>
    </tr>
  )
}

export interface TermReportViewProps {
  report: TermReport
  // The election or the fall itself.
  ending: TimelineEntry
  content: Content
}

// How a term ended and what it did: the result, the support figure, every indicator at
// both ends, the decisions that moved the most, and the promises that fell due.
export function TermReportView({ report, ending, content }: TermReportViewProps) {
  const { support } = report
  return (
    <div className={`term term--${report.verdict}`}>
      <div className="term__result">
        <p className="term__verdict">{VERDICT_LINES[report.verdict]}</p>
        <h2 className="term__headline">{ending.headline}</h2>
        {ending.text && <p className="lede measure">{ending.text}</p>}
        {support && (
          <div className="term__support measure">
            <Meter
              label={
                support.when === 'polling' ? 'Support on polling day' : 'Support as the new government starts'
              }
              value={support.value}
              valueText={percent(support.value)}
            />
          </div>
        )}
        <ChangeList changes={ending.changes} content={content} reason="shown" />
        {report.cleared && (
          <p className="measure">
            The cabinet has been replaced. Promises still outstanding have lapsed with the government that
            made them. Everything else is inherited.
          </p>
        )}
      </div>

      <div className="term__sheets">
        <Sheet kicker="The term report" title={`${dayLabel(report.from)} to day ${report.to}`}>
          <table className="term__table">
            <caption className="visually-hidden">Each indicator at the start and the end of the term</caption>
            <thead>
              <tr className="label soft">
                <th scope="col">Indicator</th>
                <th scope="col">Start</th>
                <th scope="col">End</th>
                <th scope="col">Which way</th>
              </tr>
            </thead>
            <tbody>
              {report.rows.map((row) => (
                <Row key={row.id} row={row} />
              ))}
            </tbody>
          </table>
          {report.cleared && (
            <p className="small soft">
              Legitimacy at the end is the figure the new government starts on, not the one the old one left
              with.
            </p>
          )}
        </Sheet>

        <div className="term__side">
          <Sheet kicker="What moved things most" title="The decisions that counted" level={3}>
            {report.decisions.length === 0 ? (
              <p className="soft">Nothing was decided this term that moved anything.</p>
            ) : (
              <ol className="term__decisions">
                {report.decisions.map((entry, i) => (
                  <li key={i}>
                    <span className="label soft">{dayLabel(entry.day)}</span>
                    <span>{entry.headline}</span>
                  </li>
                ))}
              </ol>
            )}
          </Sheet>

          <Sheet kicker="Promises" title="Kept and broken" level={3}>
            {report.kept.length === 0 && report.broken.length === 0 && (
              <p className="soft">No promise fell due this term.</p>
            )}
            {report.kept.length > 0 && <PromiseList label="Kept" promises={report.kept} />}
            {report.broken.length > 0 && <PromiseList label="Broken" promises={report.broken} />}
          </Sheet>
        </div>
      </div>
    </div>
  )
}

function PromiseList({ label, promises }: { label: string; promises: string[] }) {
  return (
    <div className="term__promises">
      <p className="label soft">{label}</p>
      <ul>
        {promises.map((text, i) => (
          <li key={i}>{text}</li>
        ))}
      </ul>
    </div>
  )
}
