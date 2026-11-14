import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { createPortal } from 'react-dom'
import { ArrowUp, BookOpen, Loader2, Trash2, X } from 'lucide-react'
import AnswerText from './AnswerText'
import { Button } from '@/components/ui/button'
import { paperPrompt } from '../../../shared/paper-harness'
import type { ChatMessage, SelectionAnchor, SelectionThread } from '../../../shared/paper-harness'
import type { PaperSession } from '@/lib/paper-session'
import { selectionPopup } from '../../../shared/selection-layout'

export default function InlineDiscussion({ fast, anchor, thread, source, session, provider, model, onSave, onRemove, onClose, onPin, onHold, onLeave }: {
  fast: boolean;
  anchor: SelectionAnchor; thread?: SelectionThread; source: RefObject<HTMLDivElement | null>; session: PaperSession; provider: string; model: string
  onSave: (thread: SelectionThread) => Promise<void>; onRemove: (id: string) => Promise<void>; onClose: () => void; onPin: () => void; onHold: () => void; onLeave: () => void
}) {
  const [draft, setDraft] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>(thread?.messages ?? [])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState(!!thread?.messages.length)
  const [position, setPosition] = useState({ left: 0, top: 0, width: 340, maxHeight: 560, visible: false })
  const popup = useRef<HTMLDivElement>(null)
  const body = useRef<HTMLDivElement>(null)
  useEffect(() => { setMessages(thread?.messages ?? []); setExpanded(!!thread?.messages.length); setDraft(''); setError('') }, [anchor.id])
  useEffect(() => { body.current?.scrollTo({ top: messages.filter((message) => message.role === 'assistant').length > 1 || (busy && messages.length > 2) ? body.current.scrollHeight : 0 }) }, [messages, busy])
  useLayoutEffect(() => {
    let frame = 0
    const update = () => {
      const box = source.current?.getBoundingClientRect(), popupBox = popup.current?.getBoundingClientRect()
      const reader = source.current?.closest('.reader-scroll')?.getBoundingClientRect()
      if (!box || !popupBox || !reader) return
      const next = selectionPopup(box, reader, anchor.rects, popupBox.height, expanded ? 440 : 340, { width: innerWidth, height: innerHeight })
      setPosition((current) => !next ? current.visible ? { ...current, visible: false } : current : current.visible && current.left === next.left && current.top === next.top && current.width === next.width && current.maxHeight === next.maxHeight ? current : { ...next, visible: true })
    }
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(update) }
    update()
    const observer = new ResizeObserver(schedule)
    if (popup.current) observer.observe(popup.current)
    if (source.current) observer.observe(source.current)
    document.addEventListener('scroll', schedule, true); window.addEventListener('resize', schedule)
    return () => { observer.disconnect(); cancelAnimationFrame(frame); document.removeEventListener('scroll', schedule, true); window.removeEventListener('resize', schedule) }
  }, [anchor, source, expanded])
  useEffect(() => {
    const outside = (event: PointerEvent) => { if (!popup.current?.contains(event.target as Node)) onClose() }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape) }
  }, [onClose, source])
  async function send(question = draft.trim()) {
    if (!question || busy) return
    onPin(); setExpanded(true); setBusy(true); setError(''); setDraft('')
    const previous = messages
    const exchange: ChatMessage[] = [...previous, { role: 'user', text: question }]
    setMessages(exchange)
    try {
      const ask = (prompt: string) => window.paperglim.askAI(provider === 'claude' ? 'claude' : 'codex', prompt, model, fast)
      const reference = await session.reference(`${provider}:${model}`, ask)
      const answer = await ask(paperPrompt(reference, question, previous, anchor))
      const complete: ChatMessage[] = [...exchange, { role: 'assistant', text: answer }]
      setMessages(complete)
      try { await onSave({ ...anchor, messages: complete, updatedAt: new Date().toISOString() }) }
      catch { setError('답변은 표시했지만 저장하지 못했어. 이 창을 닫기 전에 내용을 복사해 둬.') }
    } catch (cause) { setMessages(previous); setError(cause instanceof Error ? cause.message : '설명 요청에 실패했어.'); setDraft(question) }
    finally { setBusy(false) }
  }
  return createPortal(<div ref={popup} className={`selection-popover ${expanded ? 'selection-expanded' : ''}`} style={{ left: position.left, top: position.top, width: position.width, maxHeight: position.maxHeight, visibility: position.visible ? 'visible' : 'hidden' }} inert={!position.visible} role={expanded ? 'dialog' : 'toolbar'} aria-label={expanded ? '선택 영역 설명' : '선택 영역 도구'} onMouseEnter={onHold} onMouseLeave={onLeave} onFocus={onPin}>
    {expanded ? <><header><strong>{anchor.page}페이지 · 선택 영역</strong><div>{thread && <Button variant="ghost" size="icon-xs" disabled={busy} aria-label="이 선택 영역 설명 삭제" onClick={() => void onRemove(anchor.id).then(onClose).catch(() => setError('설명을 지우지 못했어.'))}><Trash2 /></Button>}<Button variant="ghost" size="icon-xs" aria-label="선택 영역 설명 닫기" onClick={onClose}><X /></Button></div></header><blockquote>{anchor.text}</blockquote><div className="selection-messages" ref={body}>{messages.map((message, index) => <div key={index} className={`selection-message ${message.role}`}><strong>{message.role === 'user' ? '나' : '설명'}</strong><AnswerText text={message.text} citations={message.role === 'assistant'} /></div>)}{busy && <p role="status"><Loader2 className="animate-spin" />논문 전체의 맥락을 확인하는 중…</p>}</div></> : <Button variant="ghost" size="sm" onPointerDown={(event) => event.preventDefault()} onClick={() => void send('이 부분을 설명해 줘.')}><BookOpen />설명</Button>}
    <form className="selection-composer" onSubmit={(event) => { event.preventDefault(); void send() }}><input aria-label={expanded ? '선택 영역 후속 질문' : '선택 영역에 질문'} placeholder={expanded ? '이 부분에 대해 이어서 질문해…' : '이 부분에 질문…'} value={draft} onChange={(event) => { setDraft(event.target.value); onPin() }} /><Button size="icon-sm" aria-label="선택 영역 질문 보내기" disabled={busy || !draft.trim()} type="submit"><ArrowUp /></Button></form>
    {!expanded && <Button variant="ghost" size="icon-xs" aria-label="선택 영역 도구 닫기" onClick={onClose}><X /></Button>}
    {error && <p className="selection-error" role="alert">{error}</p>}
  </div>, document.body)
}
