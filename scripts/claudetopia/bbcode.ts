// NationStates factbook BBCode to Markdown. Covers what Claudetopia's factbooks use:
// [b] [i] [u] [size] [hr] [list] [list=1] [*] [table] [tr] [td] [url] [quote] [color].
// Anything else is left as written, so no text is lost.

function cellText(cell: string): string {
  return inline(cell).replace(/\s*\n\s*/g, ' ').replace(/\|/g, '\\|').trim()
}

function inline(text: string): string {
  return text
    .replace(/\[b\]([\s\S]*?)\[\/b\]/gi, (_, t: string) => (t.trim() ? `**${t.trim()}**` : t))
    .replace(/\[i\]([\s\S]*?)\[\/i\]/gi, (_, t: string) => (t.trim() ? `*${t.trim()}*` : t))
    .replace(/\[u\]([\s\S]*?)\[\/u\]/gi, '$1')
    .replace(/\[color=[^\]]*\]([\s\S]*?)\[\/color\]/gi, '$1')
    .replace(/\[url=([^\]]+)\]([\s\S]*?)\[\/url\]/gi, '[$2]($1)')
    .replace(/\[url\]([\s\S]*?)\[\/url\]/gi, '<$1>')
}

function table(body: string): string {
  const rows = [...body.matchAll(/\[tr\]([\s\S]*?)\[\/tr\]/gi)].map((r) =>
    [...r[1]!.matchAll(/\[td\]([\s\S]*?)\[\/td\]/gi)].map((c) => cellText(c[1]!)),
  )
  if (!rows.length) return body
  const cols = Math.max(...rows.map((r) => r.length))
  const line = (cells: string[]) => `| ${Array.from({ length: cols }, (_, k) => cells[k] ?? '').join(' | ')} |`
  // A NationStates table has no header row; Markdown needs one, so the first row is it.
  return ['', line(rows[0]!), `|${' --- |'.repeat(cols)}`, ...rows.slice(1).map(line), ''].join('\n')
}

function list(body: string, ordered: boolean): string {
  const items = body.split(/\[\*\]/).slice(1)
  return ['', ...items.map((item, k) => `${ordered ? `${k + 1}.` : '-'} ${inline(item).trim().replace(/\n+/g, ' ')}`), ''].join('\n')
}

export function bbcodeToMarkdown(source: string): string {
  let text = source.replace(/\r\n/g, '\n')
  text = text.replace(/\[table\]([\s\S]*?)\[\/table\]/gi, (_, b: string) => table(b))
  // innermost lists first, so a nested list becomes part of its item
  for (let guard = 0; guard < 10 && /\[list(=[^\]]*)?\]/i.test(text); guard++) {
    text = text.replace(/\[list(=[^\]]*)?\]((?:(?!\[list)[\s\S])*?)\[\/list\]/gi, (_, kind: string | undefined, b: string) =>
      list(b, !!kind),
    )
  }
  // [size=200][b]Title[/b][/size] on a line of its own is a heading
  text = text.replace(/^\s*\[size=(\d+)\]\s*(?:\[b\])?([\s\S]*?)(?:\[\/b\])?\s*\[\/size\]\s*$/gim, (_, size: string, t: string) => {
    const n = Number(size)
    const level = n >= 200 ? 1 : n >= 150 ? 2 : 3
    return `\n${'#'.repeat(level)} ${inline(t).replace(/\*\*/g, '').trim()}\n`
  })
  text = text.replace(/\[size=[^\]]*\]([\s\S]*?)\[\/size\]/gi, '$1')
  text = text.replace(/\[hr\]/gi, '\n---\n')
  text = text.replace(/\[quote(=[^\]]*)?\]([\s\S]*?)\[\/quote\]/gi, (_, _a, b: string) =>
    b.trim().split('\n').map((l) => `> ${l}`).join('\n'),
  )
  text = inline(text)
  return text.replace(/\n{3,}/g, '\n\n').trim() + '\n'
}
