import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'

export default function ThemeCord({ dark, onToggle }: { dark: boolean; onToggle: () => void }) {
  const [pull, setPull] = useState(0)
  const [held, setHeld] = useState(false)
  const gesture = useRef<{ id: number; x: number; y: number; distance: number; travel: number } | null>(null)
  const suppressClick = useRef(false)
  const wire = useRef<SVGLineElement>(null)
  const grip = useRef<SVGGElement>(null)
  function release() { gesture.current = null; setHeld(false); setPull(0) }
  function cancel() { if (gesture.current) { suppressClick.current = true; release() } }
  useEffect(() => { window.addEventListener('blur', cancel); return () => window.removeEventListener('blur', cancel) }, [])
  function clickFeedback() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    wire.current?.animate([{ transform: 'scaleY(1)' }, { transform: 'scaleY(1.65)', offset: .35 }, { transform: 'scaleY(1)' }], { duration: 340, easing: 'ease-out' })
    grip.current?.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(11px)', offset: .35 }, { transform: 'translateY(0)' }], { duration: 340, easing: 'ease-out' })
  }
  return <>
    <Button className="theme-cord" variant="ghost" role="switch" aria-label="다크 모드" aria-checked={dark}
      aria-describedby="theme-cord-help" title={`${dark ? '밝은' : '어두운'} 테마로 전환 · 클릭하거나 아래로 당겨줘`}
      data-held={held} onPointerDown={(event) => {
        if (event.button !== 0 || !event.isPrimary) return
        suppressClick.current = false
        wire.current?.getAnimations().forEach((animation) => animation.cancel())
        grip.current?.getAnimations().forEach((animation) => animation.cancel())
        event.currentTarget.setPointerCapture(event.pointerId)
        gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, distance: 0, travel: 0 }
        setHeld(true)
      }} onPointerMove={(event) => {
        const current = gesture.current
        if (!current || current.id !== event.pointerId) return
        current.distance = Math.max(0, event.clientY - current.y)
        current.travel = Math.max(current.travel, Math.hypot(event.clientX - current.x, event.clientY - current.y))
        setPull(window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : Math.min(32, current.distance * .7))
      }} onPointerUp={(event) => {
        const current = gesture.current
        if (!current || current.id !== event.pointerId) return
        suppressClick.current = current.travel > 5
        if (current.distance >= 22) onToggle()
        release()
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
      }} onPointerCancel={cancel} onLostPointerCapture={cancel}
      onClick={(event) => {
        if (event.detail > 0 && suppressClick.current) { suppressClick.current = false; return }
        onToggle(); clickFeedback()
      }}>
      <svg className="cord-lamp size-auto" viewBox="0 0 52 48" aria-hidden="true" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <path d="M19 0v8M13 8h12l7 12H6z" />
        <path className="cord-bulb" d="M15 21a4 4 0 0 0 8 0" />
        <line ref={wire} className="cord-wire" x1="33" y1="18" x2="33" y2="34" style={{ transform: `scaleY(${1 + pull / 16})` }} />
        <g ref={grip} className="cord-grip" style={{ transform: `translateY(${pull}px)` }}><circle cx="33" cy="38" r="4" /></g>
      </svg>
    </Button>
    <span id="theme-cord-help" className="sr-only">클릭하거나 Enter 또는 Space를 눌러 테마를 바꾸세요. 끈을 아래로 당겼다 놓아도 돼요.</span>
  </>
}
