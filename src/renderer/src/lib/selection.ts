import type { SelectionAnchor } from '../../../shared/paper-harness'

export function selectedAnchor(source: HTMLElement, page: number): SelectionAnchor | null {
  const selection = window.getSelection()
  if (!selection?.rangeCount || selection.isCollapsed || !selection.anchorNode || !selection.focusNode || !source.contains(selection.anchorNode) || !source.contains(selection.focusNode)) return null
  const range = selection.getRangeAt(0), text = selection.toString().trim()
  if (!text || text.length > 20000) return null
  const ranges = [...source.querySelectorAll<HTMLElement>('[data-text-index]')].flatMap((element) => {
    if (!range.intersectsNode(element)) return []
    const prefix = document.createRange()
    prefix.selectNodeContents(element)
    let start = 0, end = element.textContent?.length ?? 0
    if (element.contains(range.startContainer)) { prefix.setEnd(range.startContainer, range.startOffset); start = prefix.toString().length }
    if (element.contains(range.endContainer)) { prefix.selectNodeContents(element); prefix.setEnd(range.endContainer, range.endOffset); end = prefix.toString().length }
    return end > start ? [{ itemIndex: Number(element.dataset.textIndex), start, end }] : []
  })
  const box = source.getBoundingClientRect()
  const rects = [...range.getClientRects()].flatMap((rect) => {
    const left = Math.max(rect.left, box.left), top = Math.max(rect.top, box.top)
    const right = Math.min(rect.right, box.right), bottom = Math.min(rect.bottom, box.bottom)
    return right > left && bottom > top ? [{ x: (left - box.left) / box.width, y: (top - box.top) / box.height, width: (right - left) / box.width, height: (bottom - top) / box.height }] : []
  }).filter((rect, index, all) => !all.slice(0, index).some((other) => Math.abs(other.x - rect.x) < .001 && Math.abs(other.y - rect.y) < .001 && Math.abs(other.width - rect.width) < .001 && Math.abs(other.height - rect.height) < .001))
  if (!ranges.length || !rects.length) return null
  let hash = 2166136261
  for (const char of text) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619)
  return { id: `${page}:${ranges[0].itemIndex}:${ranges[0].start}:${ranges.at(-1)!.itemIndex}:${ranges.at(-1)!.end}:${hash >>> 0}`, page, text, ranges, rects }
}
