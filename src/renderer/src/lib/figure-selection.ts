import type { SelectionAnchor } from '../../../shared/paper-harness'

type Point = { x: number; y: number }
export function figureRect(start: Point, end: Point) {
  const clamp = (value: number) => Math.max(0, Math.min(1, value))
  const x = Math.min(clamp(start.x), clamp(end.x)), y = Math.min(clamp(start.y), clamp(end.y))
  return { x, y, width: Math.max(clamp(start.x), clamp(end.x)) - x, height: Math.max(clamp(start.y), clamp(end.y)) - y }
}

export function figureAnchor(page: number, rect: ReturnType<typeof figureRect>): SelectionAnchor {
  return { id: `figure:${page}:${crypto.randomUUID()}`, page, kind: 'figure', text: `${page}페이지 · 선택한 그림·표`, ranges: [], rects: [rect] }
}

export function keyboardFigureRect(rect: ReturnType<typeof figureRect>, key: string, resize: boolean) {
  const dx = key === 'ArrowLeft' ? -.01 : key === 'ArrowRight' ? .01 : 0
  const dy = key === 'ArrowUp' ? -.01 : key === 'ArrowDown' ? .01 : 0
  if (resize) return { ...rect, width: Math.max(.03, Math.min(1 - rect.x, rect.width + dx)), height: Math.max(.03, Math.min(1 - rect.y, rect.height + dy)) }
  return { ...rect, x: Math.max(0, Math.min(1 - rect.width, rect.x + dx)), y: Math.max(0, Math.min(1 - rect.height, rect.y + dy)) }
}
