import { useRef } from 'react'

export default function PanelResizer({ side, controls, width, min, max, onChange, onDragging, onReset }: {
  side: 'library' | 'assistant' | 'translation'; controls?: string; width: number; min: number; max: number
  onChange: (width: number) => void; onDragging: (active: boolean) => void; onReset: () => void
}) {
  const drag = useRef<{ x: number; width: number } | null>(null)
  const direction = side === 'library' ? 1 : -1
  const change = (value: number) => onChange(Math.max(min, Math.min(max, value)))
  function finish() { if (drag.current) { drag.current = null; onDragging(false) } }
  return <div className={`panel-resizer ${side}-resizer`} role="separator" tabIndex={0}
    aria-label={side === 'library' ? '라이브러리 패널 너비' : side === 'translation' ? '번역 칸 너비' : 'AI 패널 너비'} aria-orientation="vertical"
    aria-controls={controls ?? `${side}-pane`} aria-valuemin={Math.round(min)} aria-valuemax={Math.round(max)} aria-valuenow={Math.round(width)}
    title="드래그로 너비 조절 · 두 번 클릭하면 기본 너비"
    onDoubleClick={onReset}
    onPointerDown={(event) => { if (event.button !== 0) return; event.preventDefault(); event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId); drag.current = { x: event.clientX, width }; onDragging(true) }}
    onPointerMove={(event) => { if (drag.current) change(drag.current.width + (event.clientX - drag.current.x) * direction) }}
    onPointerUp={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); finish() }}
    onPointerCancel={finish} onLostPointerCapture={finish}
    onKeyDown={(event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
      event.preventDefault()
      change(event.key === 'Home' ? min : event.key === 'End' ? max : width + (event.key === 'ArrowRight' ? 16 : -16) * direction)
    }}><span /></div>
}
