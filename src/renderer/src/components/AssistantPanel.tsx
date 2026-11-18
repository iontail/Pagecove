import { useUpdateBlocker } from '@/lib/update-safety'
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { ArrowUp, Check, ChevronDown, Copy, Download, FileText, Loader2, MessageSquare, PanelRightClose, Plus, Square, Zap } from 'lucide-react'
import { AIRequest } from '@/lib/ai-request'
import ModelPicker from './ModelPicker'
import ProviderLogo from './ProviderLogo'
import ThinkingIndicator from './ThinkingIndicator'
import AnswerText from './AnswerText'
import RecoveryNotice from './RecoveryNotice'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { paperPrompt, summaryPrompt, parseSummary, summaryMarkdown, readingQuestions } from '../../../shared/paper-harness'
import type { AnswerIntent, ChatMessage, PaperSummary } from '../../../shared/paper-harness'
import type { ProviderStatus } from '../../../shared/types'
import type { PaperSession } from '@/lib/paper-session'

export default function AssistantPanel({ fast, onFast, onModel, onProvider, paperId, session, provider, onSettings, onClose, open, model }: {
  fast: boolean; onFast: (value: boolean) => void; onModel: (value: string) => void; onProvider: (value: string) => void
  paperId: string | null; session: PaperSession | null; provider: string; onSettings: () => void
  onClose: () => void; open: boolean; model: string
}) {
  const [draft, setDraft] = useState('')
  const [completed, setCompleted] = useState(false)
  const [focused, setFocused] = useState(false)
  const [composing, setComposing] = useState(false)
  const [atEnd, setAtEnd] = useState(true)
  const [dismissedSuggestion, setDismissedSuggestion] = useState('')
  useEffect(() => { if (!completed) return; const timer = setTimeout(() => setCompleted(false), 1800); return () => clearTimeout(timer) }, [completed])
  const [copied, setCopied] = useState(false)
  const [copiedAnswer, setCopiedAnswer] = useState<number | null>(null)
  useEffect(() => { if (copiedAnswer === null) return; const timer = setTimeout(() => setCopiedAnswer(null), 1800); return () => clearTimeout(timer) }, [copiedAnswer])
  const [error, setError] = useState('')
  const [retryTask, setRetryTask] = useState<'chat' | 'summary' | null>(null)
  const [notice, setNotice] = useState('')
  const [stopping, setStopping] = useState(false)
  const pending = useRef<AIRequest | null>(null)
  const draftInput = useRef<HTMLTextAreaElement>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [busy, setBusy] = useState<'chat' | 'summary' | null>(null)
  const [providers, setProviders] = useState<ProviderStatus[]>([])
  const providerStatus = providers.find((entry) => entry.id === provider) ?? null
  const installed = providerStatus?.installed ?? null
  const availableModels = providerStatus?.models ?? []
  const selectedModel = availableModels.find((entry) => entry.id === model) ?? (!model ? availableModels[0] : undefined)
  const supportsFast = providerStatus?.fastMode === true && selectedModel?.supportsFast === true
  const [summary, setSummary] = useState<PaperSummary | null>(null)
  useUpdateBlocker(!!busy || !!draft.trim(), '진행 중인 질문을 마치고 초안을 정리해 주세요.')
  const [tab, setTab] = useState<'chat' | 'summary'>('chat')
  useEffect(() => () => { void pending.current?.cancel().catch(() => {}) }, [paperId, provider, model, fast])
  const requestKey = `${paperId}:${provider}:${model}:${fast}`
  const active = useRef(requestKey)
  active.current = requestKey
  const sending = useRef(false)
  const retryIntent = useRef<AnswerIntent>('chat')
  const generation = useRef(0)
  const body = useRef<HTMLDivElement>(null)
  const status = useSyncExternalStore(session?.subscribe ?? (() => () => {}), session?.snapshot ?? (() => 'PDF를 먼저 여세요'))
  useEffect(() => { generation.current++; sending.current = false; setDraft(''); setCompleted(false); setNotice(''); setRetryTask(null); setError(''); setMessages([]); setCopiedAnswer(null); setSummary(null); setBusy(null); setTab('chat') }, [paperId])
  useEffect(() => { generation.current++; sending.current = false; setBusy(null); setCompleted(false); setError('') }, [provider, model, fast])
  useEffect(() => { if (providerStatus && fast && !supportsFast) onFast(false) }, [providerStatus, fast, supportsFast, onFast])
  useLayoutEffect(() => {
    const pane = body.current
    if (!pane) return
    const questions = pane.querySelectorAll('.chat-message.user')
    const question = questions.item(questions.length - 1)
    pane.scrollTo({ top: tab === 'chat' && question ? pane.scrollTop + question.getBoundingClientRect().top - pane.getBoundingClientRect().top - 8 : 0 })
  }, [messages, busy, tab])
  useEffect(() => {
    let current = true
    setProviders([])
    window.paperglim.getProviders().then((entries) => { if (current) setProviders(entries) }).catch(() => { if (current) setProviders([{ id: provider === 'claude' ? 'claude' : 'codex', name: provider, installed: false, version: null }]) })
    const refresh = () => { void window.paperglim.getProviders().then((entries) => { if (current) setProviders(entries) }).catch(() => {}) }
    window.addEventListener('paperglim:refresh-providers', refresh)
    return () => { current = false; window.removeEventListener('paperglim:refresh-providers', refresh) }
  }, [provider])
  async function stop() {
    setStopping(true)
    try { await pending.current?.cancel() }
    catch { setRetryTask(null); setError('요청을 중지하지 못했어요. 다시 시도해 주세요.') }
    finally { setStopping(false); draftInput.current?.focus() }
  }
  async function send(question = draft.trim(), intent: AnswerIntent = 'chat') {
    if (!question || busy || sending.current || !session || installed !== true) return
    retryIntent.current = intent
    setRetryTask('chat')
    sending.current = true
    const request = ++generation.current
    const operation = new AIRequest(provider, model, fast)
    pending.current = operation
    setNotice('')
    setCompleted(false)
    const previous = messages
    setMessages([...previous, { role: 'user', text: question }]); if (question === draft.trim()) setDraft(''); setBusy('chat'); setError(''); setTab('chat')
    try {
      const reference = await operation.reference(session)
      const answer = await operation.ask(paperPrompt(reference, question, previous, null, intent))
      if (active.current === requestKey && generation.current === request) { setMessages([...previous, { role: 'user', text: question }, { role: 'assistant', text: answer }]); setCompleted(true) }
    } catch (cause) { if (active.current === requestKey && generation.current === request) { if (operation.cancelled) setNotice('요청을 중지했어요. 질문은 입력창에 남아 있어요.'); else setError(cause instanceof Error ? cause.message : 'AI 답변을 받지 못했어요.'); setMessages(previous); setDraft((current) => current.trim() ? current : question) } }
    finally { if (pending.current === operation) pending.current = null; if (generation.current === request) { sending.current = false; setBusy(null) } }
  }
  async function summarize() {
    setTab('summary')
    if (summary || busy || sending.current || !session) return
    setRetryTask('summary')
    sending.current = true
    const request = ++generation.current
    const operation = new AIRequest(provider, model, fast)
    pending.current = operation
    setNotice('')
    setCompleted(false); setBusy('summary'); setError('')
    try {
      const reference = await operation.reference(session)
      const value = parseSummary(await operation.ask(summaryPrompt(reference), undefined, 'summary'))
      if (active.current === requestKey && generation.current === request) { setSummary(value); setCompleted(true) }
    } catch (cause) { if (active.current === requestKey && generation.current === request) { if (operation.cancelled) setNotice('요약을 중지했어요.'); else setError(cause instanceof Error ? cause.message : '논문을 요약하지 못했어요. 다시 시도해 주세요.') } }
    finally { if (pending.current === operation) pending.current = null; if (generation.current === request) { sending.current = false; setBusy(null) } }
  }
  async function copyPrompt() {
    try { await window.paperglim.copyText(draft); setCopied(true); setTimeout(() => setCopied(false), 1800) }
    catch { setRetryTask(null); setError('복사하지 못했어요. 다시 시도해 주세요.') }
  }
  async function exportText(text: string, kind: '답변' | '요약') {
    if (!paperId) return
    try { if (await window.paperglim.exportMarkdown(paperId, text, kind)) setNotice('Markdown 파일로 저장했어요.') }
    catch { setRetryTask(null); setError('파일을 저장하지 못했어요. 저장 위치와 권한을 확인해 주세요.') }
  }
  const summaryText = summary ? summaryMarkdown(summary) : ''
  const suggestion = focused && !composing && atEnd && !busy && draft.length >= 2 && !draft.includes('\n') && dismissedSuggestion !== draft
    ? readingQuestions.find(({ label }) => label.startsWith(draft) && label !== draft)?.label ?? '' : ''
  function acceptSuggestion() {
    if (!suggestion) return
    setDraft(suggestion)
    draftInput.current?.focus()
    requestAnimationFrame(() => draftInput.current?.setSelectionRange(suggestion.length, suggestion.length))
  }
  return <aside id="assistant-pane" className="assistant-pane" aria-label="AI 대화 패널" hidden={!open}>
    <header className="assistant-header"><div className="flex items-center gap-2"><MessageSquare size={15} /><h2>함께 읽기</h2></div><Button variant="ghost" size="icon-sm" aria-label="AI 패널 접기" onClick={onClose}><PanelRightClose /></Button></header>
    <button className="provider-picker" onClick={onSettings}><span className="provider-mark"><ProviderLogo provider={provider} /></span><span>{provider === 'codex' ? 'Codex' : 'Claude Code'}</span><span className="connection-label">{installed === null ? '확인 중' : installed ? '설치됨' : '설치 필요'}</span><ChevronDown size={13} /></button>
    <div className="assistant-tabs" data-tab={tab}><span className="assistant-tab-indicator" aria-hidden="true" /><button aria-pressed={tab === 'chat'} onClick={() => setTab('chat')}><MessageSquare size={14} />대화</button><button aria-pressed={tab === 'summary'} disabled={!session || installed !== true} onClick={() => void summarize()}><FileText size={14} />논문 요약</button><Button variant="ghost" size="icon-sm" aria-label="새 대화" title="새 대화 시작 · 같은 논문 참고" disabled={!!busy} onClick={() => { setMessages([]); setCopiedAnswer(null); setDraft(''); setCompleted(false); setError(''); setNotice(''); setTab('chat') }}><Plus /></Button></div>
    <p className="paper-context-status" role="status">{status}</p>
    <div className="assistant-body" ref={body}>
      {tab === 'summary' ? <div className="paper-summary">{summary ? <><AnswerText text={summaryText} /><Button variant="outline" size="sm" onClick={() => void exportText(summaryText, '요약')}><Download data-icon="inline-start" />요약 내보내기</Button><Button variant="outline" size="sm" disabled={!!busy} onClick={() => { setSummary(null); setTab('chat') }}>요약 지우기</Button></> : busy === 'summary' ? <ThinkingIndicator label="논문을 요약하고 있어요" /> : <p>{busy === 'chat' ? '답변이 끝나면 ‘논문 요약’을 눌러 주세요.' : '‘논문 요약’을 눌러 다시 요청하세요.'}</p>}</div> : messages.length ? <div className="chat-messages">{messages.map((message, index) => <div key={index} className={`chat-message ${message.role}`}><strong>{message.role === 'user' ? '나' : provider === 'codex' ? 'Codex' : 'Claude Code'}{message.role === 'assistant' && <button className="answer-copy" aria-label="답변 복사" title="답변 복사" data-copied={copiedAnswer === index} onClick={() => void window.paperglim.copyText(message.text).then(() => setCopiedAnswer(index)).catch(() => { setRetryTask(null); setError('답변을 복사하지 못했어요.') })}>{copiedAnswer === index ? <Check size={12} /> : <Copy size={12} />}</button>}{message.role === 'assistant' && <button className="answer-copy" aria-label="답변 Markdown 내보내기" title="답변 내보내기" onClick={() => void exportText(`## 질문\n\n${messages[index - 1]?.text ?? ''}\n\n## 답변\n\n${message.text}`, '답변')}><Download size={12} /></button>}</strong><AnswerText text={message.text} citations={message.role === 'assistant'} /></div>)}<ThinkingIndicator active={!!busy} label={busy === 'summary' ? '논문을 요약하고 있어요' : '답변을 준비하고 있어요'} /></div> : <><div className="assistant-intro"><h3>논문에 질문하기</h3><p>논문 전체를 참고해 답해요.<br />문장을 선택하면 그 자리에서 설명을 볼 수 있어요.</p></div><div className="question-suggestions">{readingQuestions.map(({ id, label }) => <button key={id} disabled={!session || installed !== true || !!busy} onClick={() => void send(label, id)}>{label}</button>)}</div></>}
    </div>
    <div className="composer-area" data-tab={tab}>
      <div className="question-composer">
        <div className="question-input-wrap" hidden={tab === 'summary'}>
          {suggestion && <div className="question-ghost" aria-hidden="true"><span>{draft}</span>{suggestion.slice(draft.length)}</div>}
          <Textarea ref={draftInput} disabled={!session} aria-label="논문에 대한 질문" aria-describedby={suggestion ? 'question-suggestion-hint' : undefined} placeholder={session ? '이 논문에 대해 질문하세요' : 'PDF를 먼저 여세요'} value={draft}
            onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
            onCompositionStart={() => setComposing(true)} onCompositionEnd={() => setComposing(false)}
            onSelect={(event) => setAtEnd(event.currentTarget.selectionStart === draft.length && event.currentTarget.selectionEnd === draft.length)}
            onScroll={(event) => { const ghost = event.currentTarget.previousElementSibling; if (ghost) ghost.scrollTop = event.currentTarget.scrollTop }}
            onChange={(event) => { setDraft(event.target.value); setDismissedSuggestion(''); setAtEnd(event.target.selectionStart === event.target.value.length) }}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing || composing) return
              if (event.key === 'Tab' && !event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey && suggestion) { event.preventDefault(); acceptSuggestion() }
              else if (event.key === 'Escape' && suggestion) { event.preventDefault(); event.stopPropagation(); setDismissedSuggestion(draft) }
              else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); void send() }
            }} />
        </div>
        <div className="composer-feedback">
          {suggestion && <button id="question-suggestion-hint" className="ghost-accept" onMouseDown={(event) => event.preventDefault()} onClick={acceptSuggestion}>Tab으로 질문 완성</button>}
          <span className="send-feedback" role="status" data-state={busy ? 'pending' : completed ? 'success' : 'idle'}>{busy ? <><Loader2 size={12} className="animate-spin" /><span>응답 중</span></> : completed ? <><Check size={12} /><span>답변 완료</span></> : null}</span>
        </div>
        <div className="composer-actions">
        <div className="composer-model"><ModelPicker provider={provider} model={model} providers={providers} onModel={onModel} onProvider={onProvider} disabled={!!busy} /></div>
        <button type="button" role="switch" aria-label="Fast 모드" aria-checked={fast && supportsFast} className={`fast-toggle ${fast && supportsFast ? 'enabled' : ''}`} disabled={!!busy || !supportsFast} title={supportsFast ? '대화, 요약, 선택 영역 설명에 적용돼요. Fast는 사용 한도를 더 빨리 소모해요. 번역은 Standard로 실행돼요.' : installed !== true ? 'CLI를 설치한 뒤 모델 목록을 확인하세요.' : !providerStatus?.fastMode ? providerStatus?.fastModeNote || '이 CLI는 Fast를 지원하지 않아요.' : '이 모델이 Fast를 지원하는지 확인할 수 없어요.'} onClick={() => onFast(!fast)}><Zap size={13} /><span>Fast</span></button>
        {tab === 'chat' && <Button variant="ghost" size="icon-xs" aria-label={copied ? '복사 완료' : '질문 복사'} title="질문 복사" disabled={!draft.trim()} onClick={() => void copyPrompt()}>{copied ? <Check /> : <Copy />}</Button>}
        {busy ? <Button key="stop" size="icon-sm" aria-label="AI 요청 중지" title="실행 중인 AI 요청 중지" disabled={stopping} onClick={() => void stop()}><Square size={13} /></Button> : tab === 'chat' ? <Button key="send" size="icon-sm" disabled={!draft.trim() || !session || installed !== true} aria-label="AI에 보내기" title="보내기 (⌘Enter)" onClick={() => void send()}><ArrowUp /></Button> : null}
      </div></div>
      {fast && supportsFast && <p className="model-note">Fast 사용 중 · 사용 한도를 더 빨리 소모해요.</p>}
      {provider === 'claude' && <p className="model-note">Claude의 Fast는 별도 크레딧이 필요해 이 앱에서 사용할 수 없어요.</p>}
      {notice && <p className="model-note" role="status">{notice}</p>}
      <RecoveryNotice error={error} disabled={!!busy} onRetry={retryTask && (retryTask === 'summary' || draft.trim()) ? () => { if (retryTask === 'summary') void summarize(); else void send(draft.trim(), retryIntent.current) } : undefined} />
      <p className="chat-context-note">이 대화는 임시예요.</p>
      <button className="connect-helper" onClick={onSettings}>AI 연결 확인</button>
    </div>
  </aside>
}
