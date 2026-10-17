import type { Content, GameState, MotionKind, Proposal } from '@diplomat/engine'
import { useId, useMemo, useState } from 'react'
import { proposalChoices } from '../logic/world.ts'
import { Button } from '../ui/index.ts'

// Putting a motion down: a kind, what it names, and the player's own wording if they want it.
// The kind and its target are what the rules act on; the wording is read out and kept.
export function ProposalForm({
  state,
  content,
  body,
  busy,
  onPropose,
}: {
  state: GameState
  content: Content
  body: 'assembly' | 'council'
  busy: boolean
  onPropose(proposal: Proposal): void
}) {
  const choices = useMemo(() => proposalChoices(state, content, body), [state, content, body])
  const [kind, setKind] = useState<MotionKind>(choices.kinds[0]!.kind)
  const [target, setTarget] = useState('')
  const [war, setWar] = useState('')
  const [claim, setClaim] = useState('')
  const [resource, setResource] = useState(choices.resources[0]?.id ?? '')
  const [text, setText] = useState('')
  const id = useId()
  const needs = choices.kinds.find((k) => k.kind === kind)?.needs ?? 'none'
  const nations = choices.nations.filter((n) => (kind === 'admit' ? !n.member : kind === 'expel' ? n.member : true))
  const ready = needs === 'war' ? Boolean(war) : needs === 'claim' ? Boolean(claim) : needs === 'none' ? true : Boolean(target) && (needs !== 'nation+resource' || Boolean(resource))

  function submit() {
    if (!ready) return
    onPropose({
      body,
      kind,
      ...(needs === 'nation' || needs === 'nation+resource' ? { target } : {}),
      ...(needs === 'nation+resource' ? { resource } : {}),
      ...(needs === 'war' ? { war } : {}),
      ...(needs === 'claim' ? { claim } : {}),
      ...(text.trim() ? { text: text.trim() } : {}),
    })
    setText('')
  }

  return (
    <fieldset className="stack world__propose">
      <legend className="label">{body === 'council' ? 'Put a resolution to the Council' : 'Put down a motion'}</legend>
      <div className="row">
        <label className="field" htmlFor={`${id}-kind`}>
          <span className="label">Kind</span>
          <select id={`${id}-kind`} className="field__input" value={kind} onChange={(e) => setKind(e.target.value as MotionKind)}>
            {choices.kinds.map((k) => (
              <option key={k.kind} value={k.kind}>
                {k.label}
              </option>
            ))}
          </select>
        </label>
        {(needs === 'nation' || needs === 'nation+resource') && (
          <label className="field" htmlFor={`${id}-target`}>
            <span className="label">Nation</span>
            <select id={`${id}-target`} className="field__input" value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="">Choose a nation</option>
              {nations.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {needs === 'nation+resource' && (
          <label className="field" htmlFor={`${id}-resource`}>
            <span className="label">Embargo on</span>
            <select id={`${id}-resource`} className="field__input" value={resource} onChange={(e) => setResource(e.target.value)}>
              {choices.resources.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {needs === 'war' && (
          <label className="field" htmlFor={`${id}-war`}>
            <span className="label">War</span>
            <select id={`${id}-war`} className="field__input" value={war} onChange={(e) => setWar(e.target.value)}>
              <option value="">{choices.wars.length ? 'Choose a war' : 'No war is going on'}</option>
              {choices.wars.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {needs === 'claim' && (
          <label className="field" htmlFor={`${id}-claim`}>
            <span className="label">Claim</span>
            <select id={`${id}-claim`} className="field__input" value={claim} onChange={(e) => setClaim(e.target.value)}>
              <option value="">{choices.claims.length ? 'Choose a claim' : 'No claim is open'}</option>
              {choices.claims.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <label className="field" htmlFor={`${id}-text`}>
        <span className="label">The wording, if you want to give it (optional)</span>
        <textarea id={`${id}-text`} className="field__input" rows={3} maxLength={600} value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      <p className="small soft">The wording is read out and kept, and the other nations see it. Friends of yours lean your way; enemies the other.</p>
      <p>
        <Button size="small" look="primary" disabled={busy || !ready} onClick={submit}>
          {body === 'council' ? 'Put it to the Council' : 'Put it down'}
        </Button>
      </p>
    </fieldset>
  )
}
