import { visit } from 'unist-util-visit'
import type { Root, PhrasingContent, Paragraph, Blockquote } from 'mdast'

const citation = /\[pp?\.\s*(\d+(?:\s*(?:[-–]\s*\d+|,\s*(?:p\.\s*)?\d+))*)\]/gi

export default function pageCitations() {
  return (tree: Root) => {
    const sources: Paragraph[] = []
    visit(tree, ['paragraph', 'heading', 'tableCell'], (node) => {
      if (node.type !== 'paragraph' && node.type !== 'heading' && node.type !== 'tableCell') return
      const pages: [number, number][] = []
      const strip = (children: PhrasingContent[]): PhrasingContent[] => children.map((child): PhrasingContent => {
        if (child.type === 'text') return { ...child, value: child.value.replace(citation, (original, body: string) => {
          const ranges = [...body.matchAll(/\d+(?:\s*[-–]\s*\d+)?/g)].map(([part]): [number, number] => {
            const [start, end = start] = part.split(/\s*[-–]\s*/).map(Number)
            return [start, end]
          })
          if (ranges.some(([start, end]) => !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 1 || end < start)) return original
          pages.push(...ranges)
          return ''
        }) }
        if (child.type === 'strong' || child.type === 'emphasis' || child.type === 'delete') return { ...child, children: strip(child.children) }
        return child
      })
      const children = strip(node.children)
      if (!pages.length) return
      const merged: [number, number][] = []
      for (const [start, end] of pages.sort((a, b) => a[0] - b[0])) {
        const last = merged.at(-1)
        if (last && start <= last[1] + 1) last[1] = Math.max(last[1], end)
        else merged.push([start, end])
      }
      const tail = children.at(-1)
      if (tail?.type === 'text') tail.value = tail.value.trimEnd()
      node.children = children
      const excerpt = children.flatMap((child) => child.type === 'text' ? [child.value] : 'children' in child ? child.children.filter((part) => part.type === 'text').map((part) => part.value) : []).join('').trim()
      const preview = Array.from(excerpt).slice(0, 64).join('')
      const links: PhrasingContent[] = merged.flatMap(([start, end], index) => [
        ...(index ? [{ type: 'text' as const, value: ', ' }] : []),
        { type: 'link' as const, url: `#paperglim-page-${start}-${end}`, children: [{ type: 'text' as const, value: start === end ? `p. ${start}` : `p. ${start}–${end}` }] }
      ])
      sources.push({ type: 'paragraph', children: [{ type: 'text', value: `${preview}${excerpt.length > 64 ? '…' : ''} · ` }, ...links] })
    })
    if (sources.length) {
      const details: Blockquote = { type: 'blockquote', data: { hName: 'details', hProperties: { className: ['answer-sources'] } }, children: [
        { type: 'paragraph', data: { hName: 'summary' }, children: [{ type: 'text', value: '근거 보기' }] },
        ...sources
      ] }
      tree.children.push(details)
    }
  }
}
