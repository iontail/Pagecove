import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { createPortal } from 'react-dom'
import { ArrowUp, Bookmark, BookOpen, Download, Loader2, Sigma, Square, Trash2, X } from 'lucide-react'
import { AIRequest } from '@/lib/ai-request'
import AnswerText from './AnswerText'
import RecoveryNotice from './RecoveryNotice'
import { Button } from '@/components/ui/button'
import { paperPrompt } from '../../../shared/paper-harness'
import type { ChatMessage, SelectionAnchor, SelectionThread } from '../../../shared/paper-harness'
import type { PaperSession } from '@/lib/paper-session'
import { selectionPopup } from '../../../shared/selection-layout'
import { studyMarkdown, studyPrompt } from '../../../shared/study-harness'
import type { StudyMode } from '../../../shared/study-harness'

export default function InlineDiscussion({ fast, anchor, thread, source, session, provider, model, onSave, onRemove, onClose, onPin, onHold, onLeave }: {
  fast: boolean;
  anchor: SelectionAnchor; thread?: SelectionThread; source: RefObject<HTMLDivElement | null>; session: PaperSession; provider: string; model: string
  onSave: (thread: SelectionThread) => Promise<void>; onRemove: (id: string) => Promise<void>; onClose: () => void; onPin: () => void; onHold: () => void; onLeave: () => void
}) {
  const [draft, setDraft] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>(thread?.messages ?? [])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [retryable, setRetryable] = useState(false)
  const [notice, setNotice] = useState('')
  const [study, setStudy] = useState<StudyMode | undefined>(anchor.kind === 'figure' ? 'figure' : thread?.study)
  const [review, setReview] = useState(!!thread?.review)
  const [saving, setSaving] = useState(false)
  const pending = useRef<AIRequest | null>(null)
  const draftInput = useRef<HTMLInputElement>(null)
  useEffect(() => () => { void pending.current?.cancel().catch(() => {}) }, [anchor.id])
  const [expanded, setExpanded] = useState(!!thread)
  const [position, setPosition] = useState({ left: 0, top: 0, width: 340, maxHeight: 560, visible: false })
  const popup = useRef<HTMLDivElement>(null)
  const body = useRef<HTMLDivElement>(null)
  useEffect(() => { setMessages(thread?.messages ?? []); setExpanded(!!thread); setReview(!!thread?.review); setStudy(anchor.kind === 'figure' ? 'figure' : thread?.study); setDraft(''); setError('') }, [anchor.id])
  useEffect(() => { body.current?.scrollTo({ top: messages.filter((message) => message.role === 'assistant').length > 1 || (busy && messages.length > 2) ? body.current.scrollHeight : 0 }) }, [messages, busy])
  useLayoutEffect(() => {
    let frame = 0
    const update = () => {
      const box = source.current?.getBoundingClientRect(), popupBox = popup.current?.getBoundingClientRect()
      const reader = source.current?.closest('.reader-scroll')?.getBoundingClientRect()
      if (!box || !popupBox || !reader) return
      const next = selectionPopup(box, reader, anchor.rects, popupBox.height, expanded ? 480 : 400, { width: innerWidth, height: innerHeight })
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
  async function toggleReview() {
    if (busy || saving) return
    onPin(); setSaving(true); setError(''); setRetryable(false)
    try {
      if (review && !messages.length) await onRemove(anchor.id)
      else await onSave({ ...anchor, messages, review: !review, study: study === 'concept' ? 'concept' : undefined, updatedAt: new Date().toISOString() })
      setReview(!review); setNotice(review ? '다시 보기 표시를 해제했어.' : '다시 보기에 저장했어. 저장된 설명 목록에서 찾을 수 있어.')
    } catch { setError('다시 보기 표시를 저장하지 못했어. 다시 눌러 줘.') }
    finally { setSaving(false) }
  }
  async function send(question = draft.trim(), mode: StudyMode | null = study ?? null) {
    if (!question || busy || saving || pending.current) return
    setStudy(mode ?? undefined)
    const operation = new AIRequest(provider, model, fast)
    pending.current = operation
    setNotice('')
    onPin(); setExpanded(true); setBusy(true); setError(''); setRetryable(false); setDraft('')
    const previous = messages
    const exchange: ChatMessage[] = [...previous, { role: 'user', text: question }]
    setMessages(exchange)
    try {
      const reference = await operation.reference(session)
      const pageText = mode ? (await session.page(anchor.page)).blocks.map((block) => block.text).join('\n\n') : ''
      const image = mode === 'figure' ? await session.image(anchor) : undefined
      const raw = await operation.ask(mode ? studyPrompt(reference, question, previous, anchor, mode, pageText) : paperPrompt(reference, question, previous, anchor), image)
      const answer = mode ? studyMarkdown(raw, mode) : raw
      const complete: ChatMessage[] = [...exchange, { role: 'assistant', text: answer }]
      setMessages(complete)
      try { await onSave({ ...anchor, messages: complete, review, study: mode === 'concept' ? 'concept' : undefined, updatedAt: new Date().toISOString() }) }
      catch { setRetryable(false); setError('답변은 표시했지만 저장하지 못했어. 이 창을 닫기 전에 내용을 복사해 둬.') }
    } catch (cause) { setMessages(previous); if (operation.cancelled) setNotice('요청을 중지했어.'); else { setRetryable(true); setError(cause instanceof Error ? cause.message : '설명 요청에 실패했어.') } setDraft((current) => current.trim() ? current : question) }
    finally { if (pending.current === operation) pending.current = null; setBusy(false) }
  }
  const actions = <div className="selection-study-actions"><Button variant="ghost" size="xs" disabled={busy || saving} onPointerDown={(event) => event.preventDefault()} onClick={() => void send(anchor.kind === 'figure' ? '선택한 그림·표를 해설해 줘.' : '이 부분을 설명해 줘.', anchor.kind === 'figure' ? 'figure' : null)}><BookOpen data-icon="inline-start" />{anchor.kind === 'figure' ? '그림·표 해설' : '설명'}</Button>{anchor.kind !== 'figure' && <Button variant="ghost" size="xs" disabled={busy || saving} onPointerDown={(event) => event.preventDefault()} onClick={() => void send('이 부분의 수식·개념을 단계적으로 풀어 줘.', 'concept')}><Sigma data-icon="inline-start" />수식·개념 풀이</Button>}<Button variant="ghost" size="xs" aria-pressed={review} disabled={busy || saving} onClick={() => void toggleReview()}><Bookmark data-icon="inline-start" />{review ? '다시 보기 해제' : '다시 보기'}</Button>{!expanded && <Button variant="ghost" size="icon-xs" aria-label="선택 영역 도구 닫기" onClick={onClose}><X /></Button>}</div>
  return createPortal(<div ref={popup} className={`selection-popover ${expanded ? 'selection-expanded' : 'selection-tools'}`} style={{ left: position.left, top: position.top, width: position.width, maxHeight: position.maxHeight, visibility: position.visible ? 'visible' : 'hidden' }} inert={!position.visible} role={expanded ? 'dialog' : 'toolbar'} aria-label={expanded ? '선택 영역 설명' : '선택 영역 도구'} onMouseEnter={onHold} onMouseLeave={onLeave} onFocus={onPin}>
    {expanded && <header><strong>{anchor.page}페이지 · {study === 'figure' ? '그림·표 해설' : study === 'concept' ? '수식·개념 풀이' : '선택 영역'}</strong><div><Button variant="ghost" size="icon-xs" disabled={busy || !messages.length} aria-label="선택 영역 설명 내보내기" onClick={async () => { try { const text = `p. ${anchor.page}\n\n> ${anchor.text.replace(/\n/g, '\n> ')}\n\n${messages.map((message) => `### ${message.role === 'user' ? '질문' : '설명'}\n\n${message.text}`).join('\n\n')}`; if (await window.paperglim.exportMarkdown(session.paperId, text, '선택 영역 설명')) setNotice('Markdown 파일로 내보냈어.') } catch { setRetryable(false); setError('내보내지 못했어. 저장 위치를 확인해 줘.') } }}><Download /></Button>{thread && <Button variant="ghost" size="icon-xs" disabled={busy || saving} aria-label="이 선택 영역 설명 삭제" onClick={() => void onRemove(anchor.id).then(onClose).catch(() => { setRetryable(false); setError('설명을 지우지 못했어.') })}><Trash2 /></Button>}<Button variant="ghost" size="icon-xs" aria-label="선택 영역 설명 닫기" onClick={onClose}><X /></Button></div></header>}
    {actions}
    {expanded && <>{anchor.kind !== 'figure' && <blockquote>{anchor.text}</blockquote>}<div className="selection-messages" ref={body}>{!messages.length && <p className="selection-empty">{review ? '다시 볼 부분으로 저장했어. 필요할 때 설명을 요청하거나 질문해.' : '이 부분의 설명을 요청하거나 다시 볼 부분으로 표시해.'}</p>}{messages.map((message, index) => index === 0 && message.role === 'user' && ['이 부분의 수식·개념을 단계적으로 풀어 줘.', '선택한 그림·표를 해설해 줘.'].includes(message.text) ? null : <div key={index} className={`selection-message ${message.role}`}><strong>{message.role === 'user' ? '나' : '설명'}</strong><AnswerText text={message.text} citations={message.role === 'assistant'} /></div>)}{busy && <p role="status"><Loader2 className="animate-spin" />{study === 'figure' ? '선택 이미지와 논문 본문을 함께 확인하는 중…' : '논문 전체의 맥락을 확인하는 중…'}</p>}</div></>}
    <form className="selection-composer" onSubmit={(event) => { event.preventDefault(); void send() }}><input ref={draftInput} aria-label={expanded ? '선택 영역 후속 질문' : '선택 영역에 질문'} placeholder={expanded ? '이 부분에 대해 이어서 질문해…' : '이 부분에 질문…'} value={draft} onChange={(event) => { setDraft(event.target.value); onPin() }} />{busy ? <Button key="stop" size="icon-sm" aria-label="선택 영역 요청 중지" type="button" onClick={async (event) => { event.preventDefault(); try { await pending.current?.cancel() } catch { setError('중지 요청을 보내지 못했어.') } finally { draftInput.current?.focus() } }}><Square size={13} /></Button> : <Button key="send" size="icon-sm" aria-label="선택 영역 질문 보내기" disabled={!draft.trim()} type="submit"><ArrowUp /></Button>}</form>
    {notice && <p className="selection-notice" role="status">{notice}</p>}
    <RecoveryNotice error={error} disabled={busy} onRetry={retryable && draft.trim() ? () => void send() : undefined} />
  </div>, document.body)
}
