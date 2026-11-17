import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { figureAnchor, figureRect, keyboardFigureRect } from '@/lib/figure-selection'
import type { SelectionAnchor } from '../../../shared/paper-harness'

export default function FigureSelection({ page, onSelect, onCancel }: { page: number; onSelect: (anchor: SelectionAnchor) => void; onCancel: () => void }) {
  const start = useRef<{ x: number; y: number } | null>(null)
  const overlay = useRef<HTMLDivElement>(null)
  const initial = { x: .25, y: .3, width: .5, height: .3 }
  const [rect, setRect] = useState<ReturnType<typeof figureRect> | null>(initial)
  const [error, setError] = useState('')
  useEffect(() => { overlay.current?.focus() }, [])
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); onCancel() } }
    window.addEventListener('keydown', escape)
    return () => window.removeEventListener('keydown', escape)
  }, [onCancel])
  const point = (event: React.PointerEvent<HTMLElement>) => { const box = event.currentTarget.getBoundingClientRect(); return { x: (event.clientX - box.left) / box.width, y: (event.clientY - box.top) / box.height } }
  return <>
    <div ref={overlay} className="figure-selection-overlay" role="group" tabIndex={0} aria-label="그림·표 영역 선택" aria-describedby={`figure-help-${page}`} onKeyDown={(event) => {
      if (event.key.startsWith('Arrow')) { event.preventDefault(); event.stopPropagation(); setError(''); setRect((value) => keyboardFigureRect(value ?? initial, event.key, event.shiftKey)) }
      if (event.key === 'Enter' && rect) { event.preventDefault(); event.stopPropagation(); onSelect(figureAnchor(page, rect)); requestAnimationFrame(() => document.querySelector<HTMLButtonElement>('.selection-popover button')?.focus()) }
    }} onPointerDown={(event) => { if (event.button !== 0) return; event.stopPropagation(); event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); start.current = point(event); setError(''); setRect(null) }} onPointerMove={(event) => { if (start.current) setRect(figureRect(start.current, point(event))) }} onPointerUp={(event) => {
      event.stopPropagation(); if (!start.current) return
      const next = figureRect(start.current, point(event)); start.current = null
      const box = event.currentTarget.getBoundingClientRect()
      if (next.width * box.width < 24 || next.height * box.height < 24) { setRect(null); setError('영역이 너무 작아. 축과 캡션을 포함해 다시 선택해 줘.'); return }
      onSelect(figureAnchor(page, next))
    }} onPointerCancel={() => { start.current = null; setRect(null) }}>
      {rect && <span className="figure-selection-rect" style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.width * 100}%`, height: `${rect.height * 100}%` }} />}
      <span className="sr-only" aria-live="polite">{rect && `선택 영역: 왼쪽 ${Math.round(rect.x * 100)}%, 위 ${Math.round(rect.y * 100)}%, 너비 ${Math.round(rect.width * 100)}%, 높이 ${Math.round(rect.height * 100)}%`}</span>
    </div>
    <div className="figure-selection-guide" role="region" aria-label="영역 선택 안내" onMouseUp={(event) => event.stopPropagation()}><p id={`figure-help-${page}`} role={error ? 'alert' : 'status'}>{error || '축·범례·캡션을 포함해 선택해. 방향키로 이동, Shift+방향키로 크기 조절, Enter로 선택할 수 있어. 마우스 드래그도 가능해.'}</p><div><Button variant="ghost" size="xs" onClick={() => onSelect(figureAnchor(page, { x: 0, y: 0, width: 1, height: 1 }))}>페이지 전체 선택</Button><Button variant="ghost" size="xs" onClick={onCancel}>취소</Button></div></div>
  </>
}
