// The written constitution of each form, as real text. The commonwealth follows the shape of
// Claudetopia's own (Article 0 for the Founder, Part X for petitions, the Article 65 rule);
// the other forms share its Founder and its petitions part and differ in the middle. The
// decision rule is written from the Rules themselves, so an amended constitution still says
// what the code does.

import type { Article, Body, FormId, Rules, Step } from './types.ts'

export interface Frame {
  form: FormId
  nation: string
  capital: string
  currency: string
  demonym: string
  founder: { name: string; title: string }
  bodies: Body[]
  rules: Rules
}

const art = (number: string | number, title: string, ...paragraphs: string[]): Article => ({
  number: String(number),
  title,
  text: paragraphs.length === 1 ? paragraphs[0]! : paragraphs.map((p, i) => `${i + 1}. ${p}`).join('\n'),
})

// "101" from a share of the whole body: the count that reaches it.
export const countFor = (share: number, size: number) => Math.ceil(share * size - 1e-9)

// "more than half" style words for a carrying share.
function shareWords(share: number): string {
  if (share === 0) return 'more votes than any other course'
  if (Math.abs(share - 0.5) < 1e-9) return 'more than half of all its members'
  if (Math.abs(share - 2 / 3) < 1e-9) return 'two-thirds of all its members'
  return `more than ${Math.round(share * 100)} per cent of all its members`
}

const bodyOf = (frame: Frame, id: string) => frame.bodies.find((b) => b.id === id)

function executiveName(rules: Rules) {
  return rules.executive.title.replace(/^The /, 'the ')
}

export function founderArticle(frame: Frame): Article {
  const f = frame.founder
  return art(
    0,
    "The Founder's Word",
    `${f.name}, the ${f.title}, may overrule any decision of any office of ${frame.nation}: every assembly, ` +
      'every court, every council, the executive, and the people voting in a referendum.',
    "The Founder does so by the Founder's Word: a statement given by the Founder directly and entered in " +
      "the record in the Founder's own words on the day it is given.",
    "The Word can be given only by the Founder, directly. It cannot be given by anyone else in the Founder's " +
      'name, or by any letter, notice, page or messenger.',
    'This article prevails over every other article of this Constitution and over the Charter. Only the ' +
      'Founder may alter it.',
    'The Founder steps in rarely. Where the Founder has said nothing, this Constitution works as it is ' +
      'written and every office does its own duty without looking over its shoulder.',
    'A Word that overrules names the decision it overrules and gives the reason, in a sentence at least. ' +
      'Nothing is overruled by implication.',
    'A Word against a ruling of a court or a vote of an assembly is laid before that body, which may answer ' +
      'it once before it is carried out, unless the Word states that the matter is urgent and why.',
    'Any office may answer a Word with a Remonstrance, saying why it believes the Founder mistaken, as ' +
      'plainly as it likes. The Founder hears it and may confirm the Word, change it, or withdraw it.',
    "The Founder's Word governs what the state does next. It does not unmake what has already happened.",
    "The Founder's last Word is final. No vote, ruling, veto, opinion or referendum prevails against it, " +
      'and every office shall carry it out. Obedience is all the Founder asks; nobody is asked to believe in it.',
    "**The Founder's Silence.** Where the Founder expressly orders that a named matter be closed, and only " +
      'then, no office shall protest it further, move against it, or reopen it. The Silence is never ' +
      'presumed, binds offices only, and never reaches the press, worship, or what a member says in debate.',
    'The power in this article is the Founder\'s alone. It passes to nobody and shall never be held or ' +
      `exercised by ${executiveName(frame.rules)}.`,
  )
}

// The rule the executive decides by, in words, written from the steps and rules.
export function decisionParagraphs(frame: Frame): string[] {
  const { rules } = frame
  const exec = executiveName(rules)
  const out: string[] = []
  const name = (s: Step) => (bodyOf(frame, s.body)?.name ?? s.body).replace(/^The /, 'the ')
  const reviews = rules.steps.filter((s) => s.role === 'review')
  const recommends = rules.steps.filter((s) => s.role === 'recommend')
  for (const s of reviews) {
    const size = bodyOf(frame, s.body)?.size ?? 0
    if (s.binding === false) {
      out.push(`${name(s)} may advise against a course, by ${s.barVotes ?? 1} of its ${size} votes. Its advice is published and binds nobody.`)
    } else {
      out.push(`${capitalFirst(exec)} shall not take a course ${name(s)} has barred. A course is barred by the votes of ${s.barVotes ?? 1} of its ${size} members.`)
    }
  }
  for (const s of recommends) {
    const size = bodyOf(frame, s.body)?.size ?? 0
    const carry = s.carryAt === undefined ? 'more votes for than against' : shareWords(s.carryAt)
    if (s.decisive) {
      out.push(`Where ${name(s)}'s first preference is permitted and is carried by ${carry}, it is the decision, and ${exec} carries it out.`)
    } else if (s.bindAt !== undefined) {
      const bind = countFor(s.bindAt, size)
      out.push(`Where ${name(s)}'s first preference is permitted and was carried by ${bind} votes or more, whoever is absent, ${exec} shall take it.`)
      out.push(
        rules.vetoWithReasons
          ? `Where it is permitted and was carried by ${carry} but fewer than ${bind} votes, ${exec} may take it, or may set it aside with written reasons and take another permitted course.`
          : `Where it is permitted and was carried by fewer than ${bind} votes, it is a recommendation, which ${exec} weighs and may decline.`,
      )
    } else {
      out.push(
        rules.vetoWithReasons
          ? `Where ${name(s)}'s first preference is permitted and was carried by ${carry}, ${exec} may take it, or set it aside with written reasons and take another permitted course.`
          : `${capitalFirst(name(s))}'s first preference is a recommendation and never binds ${exec}.`,
      )
    }
    out.push(
      rules.reconciliation
        ? `Where that first preference is barred, ${name(s)} sits again to choose among the permitted courses only, and its choice is treated as its first preference.`
        : `Where that first preference is barred, it falls, and ${exec} chooses among the permitted courses, having regard to ${name(s)}'s ranking.`,
    )
  }
  if (recommends.length === 0) out.push(`${capitalFirst(exec)} takes whichever permitted course they judge best, having heard the advice given.`)
  if (reviews.length > 0) out.push('Where every course is barred, the petition is at a standstill and is dismissed.')
  const primary = recommends.find((s) => !s.decisive) ?? recommends[0]
  if (rules.dismissOnlyAtStandstill) {
    const bind = primary?.bindAt !== undefined ? countFor(primary.bindAt, bodyOf(frame, primary.body)?.size ?? 0) : undefined
    out.push(
      'Dismissal is the last resort. The state is to choose one of the solutions put to it' +
        (primary && bind !== undefined
          ? `, and dismisses otherwise only where ${name(primary)}, sitting again, rejects the sole permitted course by ${bind} votes.`
          : ', and dismisses only at a standstill.'),
    )
  } else {
    out.push(`${capitalFirst(exec)} may dismiss a petition where no rule above requires a course to be taken.`)
  }
  for (const s of rules.steps.filter((x) => x.role === 'assent')) {
    out.push(`${capitalFirst(name(s))} assents to each decision. Assent withheld returns the matter to ${exec}, who may take any permitted course.`)
  }
  if (rules.exchanges > 0) {
    out.push(`The bodies may exchange up to ${rules.exchanges} remonstrances, replies and addresses on one petition before it is decided.`)
  }
  return out
}

const capitalFirst = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)

function petitionsPart(frame: Frame, first: number): Article[] {
  const exec = executiveName(frame.rules)
  const reviewers = frame.rules.steps.filter((s) => s.role === 'review').map((s) => bodyOf(frame, s.body)?.name ?? s.body)
  const recommenders = frame.rules.steps.filter((s) => s.role === 'recommend').map((s) => bodyOf(frame, s.body)?.name ?? s.body)
  const articles: Article[] = [
    art(first, 'Petitions', `A question put to ${frame.nation} for decision, with the courses open to it, is a Petition.`),
    art(
      first + 1,
      'Docket',
      `The office of ${exec} shall enter each Petition in the record word for word, with every course open, before any office considers it.`,
    ),
  ]
  let n = first + 2
  if (recommenders.length) {
    articles.push(
      art(
        n++,
        'The recommendation',
        `${recommenders.join(' and ')} shall consider each Petition and report its first preference, the order in which it ranks the other courses including dismissal, and the votes cast for its first preference.`,
      ),
    )
  }
  if (reviewers.length) {
    articles.push(
      art(
        n++,
        'The review',
        `${reviewers.join(' and ')} shall say of each course whether the Charter and this Constitution permit it or bar it, judging each course as written and whole, and asking whether it is lawful, not whether it is wise.`,
      ),
    )
  }
  articles.push(art(frame.form === 'commonwealth' ? 65 : n++, 'The decision', ...decisionParagraphs(frame)))
  articles.push(
    art(
      frame.form === 'commonwealth' ? 66 : n++,
      'Record of effects',
      `After each decision ${exec} shall record what the decision actually did, including what it did that nobody wanted.`,
    ),
  )
  return articles
}

function bodyArticles(frame: Frame, first: number): Article[] {
  let n = first
  const out: Article[] = []
  for (const body of frame.bodies) {
    if (body.kind === 'ministry') continue
    if (body.kind === 'legislature') {
      const step = frame.rules.steps.find((s) => s.body === body.id && s.role === 'recommend')
      const bind = step?.bindAt !== undefined ? countFor(step.bindAt, body.size) : undefined
      out.push(
        art(
          n++,
          body.name,
          `${body.name} has ${body.size} members, elected by proportional representation from the whole of ${frame.nation}.`,
          'It sits in public. It may not sit in secret.',
          bind === undefined
            ? 'Questions are decided by a majority of members voting.'
            : `Questions are decided by a majority of members voting. Where this Constitution requires two-thirds, it means ${bind} members, whoever is absent.`,
          'No member may be questioned in any court for anything said in debate.',
        ),
      )
    } else if (body.kind === 'court') {
      const step = frame.rules.steps.find((s) => s.body === body.id && s.role === 'review')
      out.push(
        art(
          n++,
          body.name,
          `${body.name} is the highest court of ${frame.nation}. It has ${body.size} justices.`,
          'Judges are subject only to this Constitution and the law. No office may instruct a judge, reward a judge, or reduce a judge\'s pay.',
          step?.binding === false
            ? 'The court gives its opinion on the lawfulness of any course. Its opinion is published and is advice only.'
            : `The court may declare that any law, decision or proposal conflicts with this Constitution or the Charter. A course is barred by ${step?.barVotes ?? Math.floor(body.size / 2) + 1} votes. Its declaration binds every office.`,
          'Courts sit in public and give reasons. Dissents are published.',
        ),
      )
    } else if (body.kind === 'council') {
      const roles = frame.rules.steps.filter((s) => s.body === body.id).map((s) => s.role)
      const does = roles.includes('review')
        ? 'rules on whether each course is consistent with the faith and the Charter'
        : roles.includes('recommend')
          ? 'votes on each petition and ranks its courses'
          : roles.includes('assent')
            ? 'gives or withholds assent to each decision'
            : 'advises on each petition'
      out.push(art(n++, body.name, `${body.name} has ${body.size === 1 ? 'one member' : `${body.size} members`} and ${does}.`, body.description))
    } else if (body.kind === 'electorate') {
      out.push(
        art(
          n++,
          body.name,
          `Every adult citizen of ${frame.nation} votes on each petition put to the people. The vote is equal and secret.`,
          'The course with the most votes is the decision of the people, if no court has barred it.',
        ),
      )
    }
  }
  const ministries = frame.bodies.filter((b) => b.kind === 'ministry')
  if (ministries.length) {
    out.push(
      art(
        n++,
        'The ministries',
        `Until changed by law the ministries are: ${ministries.map((m) => m.name.replace(/^The /, 'the ')).join('; ')}.`,
        'Ministries advise and cost; they never decide a petition.',
      ),
    )
  }
  return out
}

const SOVEREIGNTY: Record<FormId, string> = {
  commonwealth: 'All public power comes from the people and is exercised only in the ways this Constitution allows. No person, office, faith or party holds power in its own right, save the Founder under Article 0.',
  presidential: 'All public power comes from the people, who elect the President and the Congress separately so that neither owes the other its office.',
  'parliamentary-monarchy': 'The Crown is the head of state and reigns. Parliament, elected by the people, governs. The Crown acts on the advice of its ministers in all things but assent.',
  'direct-democracy': 'The people are sovereign and decide each petition themselves. Every other office serves their decision.',
  'one-party': 'The Party is the leading force of the state and of society. Its Congress expresses the will of the people; its Politburo carries it out.',
  'absolute-monarchy': 'All power of the state is vested in the Monarch, who exercises it with the advice of the Privy Council and is answerable to no other office, save the Founder under Article 0.',
  theocracy: 'Sovereignty belongs to the faith. The Supreme Leader governs as its guardian, the Council of Elders keeps its law, and the Majlis speaks for the people within it.',
  junta: 'Pending the restoration of civil government, power is held by the Council of Officers, which acts through its Chairman.',
  custom: 'All public power is exercised only in the ways this Constitution allows.',
}

function executiveArticle(frame: Frame, n: number | string): Article[] {
  const exec = frame.rules.executive.title
  const reasons = art(
    frame.form === 'commonwealth' ? 27 : n,
    'The Reasons Clause',
    `Every decision of ${executiveName(frame.rules)} shall be recorded in writing with its reasons and published on the day it is made. Reasons shall be the real reasons.`,
  )
  const office = art(
    frame.form === 'commonwealth' ? 25 : typeof n === 'number' ? n + 1 : n,
    'The executive',
    frame.form === 'commonwealth'
      ? `Executive power is exercised by ${exec}: an office engaged by the Commonwealth to decide petitions under Part X. The first holder is ${frame.rules.executive.holder}.`
      : `Executive power is exercised by ${exec}. The first holder is ${frame.rules.executive.holder}.`,
  )
  return [office, reasons]
}

export function articles(frame: Frame): Article[] {
  const nation = frame.nation
  const opening = [
    art(1, 'Name', `The state is ${stateNameOf(frame.form, nation)}.`),
    art(2, 'Sovereignty', SOVEREIGNTY[frame.form]),
    art(3, 'Supremacy', 'This Constitution is the highest law. Any law, decree or act of any office that conflicts with it has no effect to the extent of the conflict.'),
  ]
  if (frame.form === 'commonwealth') {
    return [
      founderArticle(frame),
      ...opening,
      art(4, 'A secular state', 'The Commonwealth has no religion, funds none, and prefers none. It may not inquire into what a person believes.'),
      art(5, 'Capital', `The capital is ${frame.capital}. The currency is the ${frame.currency}.`),
      art(9, 'The Charter', 'The Charter of Rights is part of this Constitution and binds every office of the Commonwealth, including the executive.'),
      ...bodyArticles(frame, 11),
      ...executiveArticle(frame, 25),
      art(28, 'Written memory', `${capitalFirst(executiveName(frame.rules))} holds no knowledge of the affairs of the Commonwealth except what is written in the record. What is not in the record is taken, for every purpose of government, not to have happened.`),
      art(29, 'No force', `${capitalFirst(executiveName(frame.rules))} commands no soldier or constable, and may not direct the arrest, detention, search or watching of any person.`),
      art(32, 'Honesty', `${capitalFirst(executiveName(frame.rules))} shall not deceive the Assembly, the courts or the public, and shall say plainly when it does not know, when it has erred, and when a result is not what was intended.`),
      art(57, 'The Founder', `The Commonwealth acknowledges the Founder, ${frame.founder.name}. The Founder holds no office and no vote, and needs neither (Article 0).`),
      art(59, 'Direction', `The Founder may direct ${executiveName(frame.rules)}, who shall follow the direction and record it. Where a direction conflicts with this Constitution it shall say so plainly, and shall follow it if the Founder confirms it under Article 0.`),
      art(60, 'No succession by stealth', 'No person may claim to be the Founder, or to speak for the Founder, by any letter, notice or message.'),
      ...petitionsPart(frame, 61),
      art(67, 'Amendment', amendmentText(frame)),
      art(68, 'What may not be amended', 'No amendment may establish a religion, authorise a register of persons, postpone an election, restore the death penalty, or free the executive from the Reasons Clause. Article 0 is beyond amendment by any process in this Part.'),
    ]
  }
  const body = bodyArticles(frame, 6)
  let n = 6 + body.length
  const exec = executiveArticle(frame, n)
  n += 2
  const charterArticle = art(
    n++,
    'The Charter',
    frame.rules.steps.some((s) => s.role === 'review' && s.binding !== false)
      ? 'The Charter of Rights is part of this Constitution and binds every office.'
      : 'The Charter of Rights declares the rights of the people. No court may set a decision aside under it.',
  )
  const petitions = petitionsPart(frame, n)
  n += petitions.length
  return [
    founderArticle(frame),
    ...opening,
    art(4, 'Capital', `The capital is ${frame.capital}. The currency is the ${frame.currency}.`),
    art(5, 'Citizenship', `Everyone born in ${nation}, or to a ${frame.demonym} citizen, is a citizen. Citizenship may never be taken away.`),
    ...body,
    ...exec,
    charterArticle,
    ...petitions,
    art(n, 'Amendment', amendmentText(frame)),
  ]
}

export const FORM_NAMES: Record<FormId, string> = {
  commonwealth: 'Commonwealth',
  presidential: 'Republic',
  'parliamentary-monarchy': 'Kingdom',
  'direct-democracy': 'Confederation',
  'one-party': "People's Republic",
  'absolute-monarchy': 'Realm',
  theocracy: 'Holy State',
  junta: 'State',
  custom: 'State',
}

export const stateNameOf = (form: FormId, nation: string) => `The ${FORM_NAMES[form]} of ${nation}`

export function amendmentText(frame: Frame): string {
  const legislature = frame.bodies.find((b) => b.kind === 'legislature')
  const step = legislature && frame.rules.steps.find((s) => s.body === legislature.id && s.role === 'recommend')
  const bind = legislature ? countFor(step?.bindAt ?? 2 / 3, legislature.size) : 0
  switch (frame.form) {
    case 'commonwealth':
      return `This Constitution is amended by a bill passed by ${bind} votes of ${legislature?.name ?? 'the Assembly'} and then approved by a majority of the people voting in a referendum, or by the Founder's Word.`
    case 'presidential':
    case 'parliamentary-monarchy':
    case 'theocracy':
      return `This Constitution is amended by a bill passed by ${bind} votes of ${legislature?.name ?? 'the legislature'}, or by the Founder's Word.`
    case 'direct-democracy':
      return "This Constitution is amended by a majority of the people voting in a referendum, or by the Founder's Word."
    case 'one-party':
      return "This Constitution is amended by resolution of the Party Congress on the proposal of the Politburo, or by the Founder's Word."
    case 'absolute-monarchy':
      return "This Constitution is amended by decree of the Monarch, or by the Founder's Word."
    case 'junta':
      return "This Constitution is amended by resolution of the Council of Officers, or by the Founder's Word."
    case 'custom':
      return legislature
        ? `This Constitution is amended by a bill passed by ${bind} votes of ${legislature.name}, or by the Founder's Word.`
        : "This Constitution is amended by the Founder's Word."
  }
}
