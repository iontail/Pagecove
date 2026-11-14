import { visit } from 'unist-util-visit'
import type { Root, PhrasingContent, Emphasis } from 'mdast'

const citation = /\[pp?\.\s*(\d+(?:\s*(?:[-–]\s*\d+|,\s*(?:p\.\s*)?\d+))*)\]/gi

export default function pageCitations() {
  return (tree: Root) => {
    visit(tree, 'paragraph', (paragraph) => {
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
      const children = strip(paragraph.children)
      if (!pages.length) return
      const merged: [number, number][] = []
      for (const [start, end] of pages.sort((a, b) => a[0] - b[0])) {
        const last = merged.at(-1)
        if (last && start <= last[1] + 1) last[1] = Math.max(last[1], end)
        else merged.push([start, end])
      }
      const label = merged.map(([start, end]) => start === end ? String(start) : `${start}–${end}`).join(', ')
      const note: Emphasis = { type: 'emphasis', data: { hName: 'span', hProperties: { className: ['answer-citation'], role: 'note', ariaLabel: `근거 페이지 ${label}`, title: `근거 페이지 ${label}` } }, children: [{ type: 'text', value: `p. ${label}` }] }
      const tail = children.at(-1)
      if (tail?.type === 'text') tail.value = tail.value.trimEnd()
      paragraph.children = [...children, { type: 'text', value: ' ' }, note]
    })
  }
}
