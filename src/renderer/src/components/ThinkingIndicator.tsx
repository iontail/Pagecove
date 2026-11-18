import { useEffect, useId, useRef, useState } from 'react'

// Goo motion adapted for real request states from designbookmark.com/motion#db-goo-thinking.
export default function ThinkingIndicator({ active = true, label = '답변을 준비하고 있어요' }: { active?: boolean; label?: string }) {
  const filter = useId()
  const root = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    let inView = false
    const update = () => setVisible(inView && !document.hidden)
    const observer = new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; update() })
    if (root.current) observer.observe(root.current)
    document.addEventListener('visibilitychange', update)
    return () => { observer.disconnect(); document.removeEventListener('visibilitychange', update) }
  }, [])
  return <div ref={root} className="thinking-indicator" data-active={active} data-visible={visible} role={active ? 'status' : undefined} aria-live="polite" aria-hidden={!active}>
    <div><span className="thinking-goo" aria-hidden="true"><svg viewBox="0 0 64 32" width="64" height="32"><defs><filter id={filter} x="-30%" y="-50%" width="160%" height="200%" colorInterpolationFilters="sRGB"><feGaussianBlur in="SourceGraphic" stdDeviation="2" /><feColorMatrix values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7" /></filter></defs><g filter={`url(#${filter})`}>{[18, 31, 44].map((x, index) => <circle key={x} cx={x} cy="18" r="4.5" style={{ animationDelay: `${index * 160}ms` }} />)}</g></svg></span><span>{label}</span></div>
  </div>
}
