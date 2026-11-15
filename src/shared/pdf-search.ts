import type { PageContext, SourceLocation } from './reading'

export type SearchMatch = { page: number; snippet: string; location: Omit<SourceLocation, 'token'> }
export function searchPages(pages: PageContext[], query: string): SearchMatch[] {
  const words = query.trim().split(/\s+/).filter(Boolean)
  if (!words.length) return []
  const expression = new RegExp(words.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+'), 'giu')
  const matches: SearchMatch[] = []
  for (const page of pages) for (const block of page.blocks) {
    for (const match of block.text.matchAll(expression)) {
      const start = match.index, end = start + match[0].length
      const ranges = (block.spans ?? []).flatMap((span) => {
        const left = Math.max(start, span.start), right = Math.min(end, span.end)
        return right > left ? [{ itemIndex: span.itemIndex, start: left - span.start, end: right - span.start }] : []
      })
      matches.push({ page: page.page, snippet: block.text.slice(Math.max(0, start - 28), end + 60), location: { paperId: page.paperId, page: page.page, itemIndexes: ranges.length ? [...new Set(ranges.map((range) => range.itemIndex))] : block.itemIndexes, ranges } })
    }
  }
  return matches
}
