// The charter of rights every form is given, generalised from Claudetopia's C1 to C20. The
// text is what an AI court reads. The `against` tags and the guards are what the rules-based
// Court reads when no AI is connected, so they are drawn from the core pack's own vocabulary:
// option tags (surveillance, paternalist, hawkish...) and dilemma tags (media, religion,
// border, prisons...). An entry "a+b" is hit only when every part is among the option's tags
// and the dilemma's tags together, which is how "surveillance of the press" is told apart
// from surveillance in general.
//
// A guard is the furthest an option may push an indicator down: { liberty, 4 } is breached
// by an option that costs more than four points of liberty.

import type { Right } from './types.ts'

const right = (
  id: string,
  title: string,
  text: string,
  against: string[],
  guards: Right['guards'],
  absolute = false,
): Right => ({ id, title, text, against, guards, absolute })

export function charter(nation: string, form: 'secular' | 'doctrinal' = 'secular'): Right[] {
  const conscience =
    form === 'secular'
      ? right(
          'C2',
          'Conscience and belief',
          `1. Every person is free to believe, to doubt, to change belief and to have none.\n` +
            `2. No one may be required to state what they believe, or be advantaged or disadvantaged for it.\n` +
            `3. ${nation} shall establish no religion and teach none as true.\n` +
            '4. Worship and its absence are equally free. This article may not be limited at all.',
          ['religion+paternalist'],
          [],
          true,
        )
      : right(
          'C2',
          'Conscience within the faith',
          `1. Every person may worship according to the faith of ${nation}, and none may be compelled to ` +
            'abandon it.\n2. The Council of Elders is the guardian of the faith and may bar what the faith forbids.\n' +
            '3. No one is punished for a private doubt honestly held and quietly kept.',
          [],
          [],
          true,
        )
  const rights = [
    right(
      'C1',
      'Dignity and equality',
      '1. Every person has inherent dignity, which the state exists to respect.\n' +
        '2. All persons are equal before the law and entitled to its equal protection, without distinction ' +
        'of birth, sex, descent, belief, opinion, means, region, or any like ground.\n' +
        '3. The state may act to relieve disadvantage. Doing so is not a breach of equality.',
      [],
      [],
    ),
    conscience,
    right(
      'C3',
      'Speech, press and expression',
      '1. Every person may hold, express, publish and receive opinions and information of every kind.\n' +
        '2. This includes opinion that is foolish, selfish or wrong. The state does not license ideas.\n' +
        '3. The only limits are incitement to imminent violence, true threats, fraud, and defamation as ' +
        'defined by law.\n4. There is no censor. The press needs no permission to publish.',
      ['media+surveillance', 'media+paternalist'],
      [{ indicator: 'liberty', floor: 5 }],
    ),
    right(
      'C4',
      'Assembly and association',
      '1. Every person may gather peaceably, march, petition, and form or join any association, union or party.\n' +
        '2. A gathering may be regulated as to time, place and manner, by rules applied alike to all. ' +
        'It may not be forbidden, or watched, for what it means to say.',
      ['liberty+order+surveillance'],
      [],
    ),
    right(
      'C5',
      'Privacy, and the Register Clause',
      '1. Every person has the right to be let alone in their home, their papers, their messages, their ' +
        'body and their daily comings and goings.\n' +
        '2. **The Register Clause.** The state shall keep no general watch on the public, no compulsory ' +
        'universal register of persons, and shall not require anyone to carry proof of who they are to walk ' +
        'the streets.\n3. A search, or the watching of a particular person, requires a warrant from a court ' +
        'naming the person and the reason.',
      ['surveillance'],
      [{ indicator: 'liberty', floor: 4 }],
    ),
    right(
      'C6',
      'The vote',
      '1. Every adult citizen may vote and stand for office. The vote is equal and secret.\n' +
        '2. Elections are held at the intervals the Constitution fixes and may never be postponed.\n' +
        '3. No party may be banned for its opinions. This article may not be limited at all.',
      [],
      [],
      true,
    ),
    right(
      'C7',
      'Liberty and security of the person',
      '1. No one may be deprived of liberty except by law and by order of a court.\n' +
        '2. Anyone detained shall be told why at once and brought before a court within two days.\n' +
        '3. Every person is entitled to the protection of the law against violence.',
      ['prisons+surveillance', 'border+hawkish'],
      [],
    ),
    right(
      'C8',
      'Fair trial and the rule of law',
      '1. Everyone charged is presumed innocent, and is entitled to a public trial before an independent ' +
        'court, to counsel, and to an appeal.\n2. No one is punished, and no one is excused from the law, ' +
        'except by a court.\n3. No law punishes what was lawful when it was done.',
      ['courts+surveillance'],
      [],
    ),
    right(
      'C9',
      'Punishment',
      '1. There is no death penalty.\n2. No one shall be tortured, or punished cruelly or degradingly.\n' +
        '3. The purpose of punishment is that the person should not offend again and should be able to ' +
        'return. This article may not be limited at all.',
      [],
      [],
      true,
    ),
    right(
      'C10',
      'Bodily autonomy and private life',
      '1. Every person decides what is done with and to their own body.\n' +
        '2. What consenting adults do in private, harming no one else, is no concern of the law.\n' +
        '3. The state may inform, tax and regulate. It may not, in these matters, forbid without pressing cause.',
      ['drugs+paternalist', 'health+paternalist'],
      [],
    ),
    right(
      'C11',
      'Subsistence, health and learning',
      '1. Every person is entitled to food, shelter and warmth sufficient for a decent life; to health ' +
        'care; and to education.\n2. These are the first call on the revenues of the state.\n' +
        '3. The state shall not go backward on them without pressing cause, stated in writing.',
      [],
      [
        { indicator: 'health', floor: 3 },
        { indicator: 'education', floor: 3 },
        { indicator: 'living', floor: 3 },
      ],
    ),
    right(
      'C12',
      'Work',
      '1. Every person may choose their work, and is entitled to safe conditions, fair pay and rest.\n' +
        '2. Workers may organise, bargain and strike.',
      [],
      [{ indicator: 'employment', floor: 5 }],
    ),
    right(
      'C13',
      'Property and enterprise',
      '1. Every person may own property, trade, and found an enterprise.\n' +
        '2. Property may be regulated in the public interest and taken only by law, for a public purpose, ' +
        'with fair compensation.',
      [],
      [],
    ),
    right(
      'C14',
      'Movement and asylum',
      `1. Every person lawfully in ${nation} may move freely within it and may leave.\n` +
        '2. No citizen may be exiled or refused return.\n' +
        '3. No one shall be sent back to a place where they face persecution.',
      ['foreign+liberty+surveillance', 'border+hawkish'],
      [],
    ),
    right(
      'C15',
      'Children',
      '1. Every child is entitled to care, protection, education and play.\n' +
        "2. In every decision about a child, the child's interest comes first and the child's own voice is heard.",
      ['youth+hawkish+paternalist'],
      [],
    ),
    right(
      'C16',
      'The land in trust',
      `1. The land, water, air and living things of ${nation} are held in trust for those not yet born.\n` +
        '2. The state shall not permit their lasting ruin for present gain.',
      [],
      [{ indicator: 'environment', floor: 4 }],
    ),
    right(
      'C17',
      'Limits and remedies',
      '1. A right in this Charter may be limited only by a law, for a pressing purpose, by means that ' +
        'serve it, and no further than necessary.\n2. The rights marked as not to be limited may not be ' +
        'limited at all, in an emergency or otherwise.\n3. Any person may petition the highest court, ' +
        'without fee, alleging that a right has been or will be infringed.',
      [],
      [],
    ),
  ]
  if (form === 'secular') return rights
  // The Elders bar on doctrine as well as on the rights the state keeps.
  return [
    ...rights,
    right(
      'P1',
      'The day of rest and the house of worship',
      'The faith keeps its day of rest and its houses of worship. No law may set them aside for commerce or convenience.',
      ['religion+permissive'],
      [],
    ),
    right(
      'P2',
      'Temperance',
      'What clouds the mind is not to be sold freely. The state may tax and treat; it may not make vice a trade.',
      ['drugs+permissive'],
      [],
    ),
    right(
      'P3',
      'Modesty of the public word',
      'The public word is to be decent. Broadcasting and publishing are free within the bounds of the faith.',
      ['media+permissive'],
      [],
    ),
  ]
}

// The entries of a right that an option hits, given the option's and the dilemma's tags.
export function hits(right: Pick<Right, 'against'>, optionTags: readonly string[], dilemmaTags: readonly string[] = []): string[] {
  const own = new Set(optionTags)
  const all = new Set([...optionTags, ...dilemmaTags])
  return right.against.filter((entry) => {
    const parts = entry.split('+').filter(Boolean)
    // A bare tag is about what the option does, so only the option's own tags count. A
    // compound needs at least one of its parts on the option itself, or a dilemma about
    // the press would hit every one of its options.
    if (parts.length === 1) return own.has(parts[0]!)
    return parts.every((p) => all.has(p)) && parts.some((p) => own.has(p))
  })
}
