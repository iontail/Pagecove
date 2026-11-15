import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { ArrowUp, Check, ChevronDown, Copy, FileText, MessageSquare, PanelRightClose, Plus, Square, Zap } from 'lucide-react'
import { AIRequest } from '@/lib/ai-request'
import ModelPicker from './ModelPicker'
import ProviderLogo from './ProviderLogo'
import AnswerText from './AnswerText'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { paperPrompt, summaryPrompt, parseSummary, readingQuestions } from '../../../shared/paper-harness'
import type { AnswerIntent, ChatMessage, PaperSummary } from '../../../shared/paper-harness'
import type { ProviderStatus } from '../../../shared/types'
import type { PaperSession } from '@/lib/paper-session'

export default function AssistantPanel({ fast, onFast, onModel, onProvider, paperId, session, provider, onSettings, onClose, open, model }: {
  fast: boolean; onFast: (value: boolean) => void; onModel: (value: string) => void; onProvider: (value: string) => void
  paperId: string | null; session: PaperSession | null; provider: string; onSettings: () => void
  onClose: () => void; open: boolean; model: string
}) {
  const [draft, setDraft] = useState('')
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')
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
  const [tab, setTab] = useState<'chat' | 'summary'>('chat')
  useEffect(() => () => { void pending.current?.cancel().catch(() => {}) }, [paperId, provider, model, fast])
  const requestKey = `${paperId}:${provider}:${model}:${fast}`
  const active = useRef(requestKey)
  active.current = requestKey
  const sending = useRef(false)
  const generation = useRef(0)
  const body = useRef<HTMLDivElement>(null)
  const status = useSyncExternalStore(session?.subscribe ?? (() => () => {}), session?.snapshot ?? (() => 'PDF를 먼저 열어줘'))
  useEffect(() => { generation.current++; sending.current = false; setDraft(''); setError(''); setMessages([]); setSummary(null); setBusy(null); setTab('chat') }, [paperId])
  useEffect(() => { generation.current++; sending.current = false; setBusy(null); setError('') }, [provider, model, fast])
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
    return () => { current = false }
  }, [provider])
  async function stop() {
    setStopping(true)
    try { await pending.current?.cancel() }
    catch { setError('중지 요청을 보내지 못했어. 다시 눌러줘.') }
    finally { setStopping(false); draftInput.current?.focus() }
  }
  async function send(question = draft.trim(), intent: AnswerIntent = 'chat') {
    if (!question || busy || sending.current || !session || installed !== true) return
    sending.current = true
    const request = ++generation.current
    const operation = new AIRequest(provider, model, fast)
    pending.current = operation
    setNotice('')
    const previous = messages
    setMessages([...previous, { role: 'user', text: question }]); if (question === draft.trim()) setDraft(''); setBusy('chat'); setError(''); setTab('chat')
    try {
      const reference = await operation.reference(session)
      const answer = await operation.ask(paperPrompt(reference, question, previous, null, intent))
      if (active.current === requestKey && generation.current === request) setMessages([...previous, { role: 'user', text: question }, { role: 'assistant', text: answer }])
    } catch (cause) { if (active.current === requestKey && generation.current === request) { if (operation.cancelled) setNotice('요청을 중지했어. 질문은 입력창에 남겼어.'); else setError(cause instanceof Error ? cause.message : 'AI 요청에 실패했어.'); setMessages(previous); setDraft((current) => current.trim() ? current : question) } }
    finally { if (pending.current === operation) pending.current = null; if (generation.current === request) { sending.current = false; setBusy(null) } }
  }
  async function summarize() {
    setTab('summary')
    if (summary || busy || sending.current || !session) return
    sending.current = true
    const request = ++generation.current
    const operation = new AIRequest(provider, model, fast)
    pending.current = operation
    setNotice('')
    setBusy('summary'); setError('')
    try {
      const reference = await operation.reference(session)
      const value = parseSummary(await operation.ask(summaryPrompt(reference)))
      if (active.current === requestKey && generation.current === request) setSummary(value)
    } catch (cause) { if (active.current === requestKey && generation.current === request) { if (operation.cancelled) setNotice('요약을 중지했어.'); else setError(cause instanceof Error ? cause.message : '요약하지 못했어. 다시 시도해 줘.') } }
    finally { if (pending.current === operation) pending.current = null; if (generation.current === request) { sending.current = false; setBusy(null) } }
  }
  async function copyPrompt() {
    try { await window.paperglim.copyText(draft); setCopied(true); setTimeout(() => setCopied(false), 1800) }
    catch { setError('복사하지 못했어. 다시 시도해 줘.') }
  }
  const summaryText = summary ? [
    '### 3문장 요약',
    summary.sentences.map((sentence, index) => `${index + 1}. ${sentence}`).join('\n'),
    '### 전체 흐름', summary.overview,
    ...(['question', 'method', 'results', 'limitations'] as const).flatMap((key, index) => [
      `#### ${['문제와 동기', '핵심 방법', '주요 결과', '한계와 적용 범위'][index]}`, summary.sections[key]
    ])
  ].join('\n\n') : ''
  return <aside id="assistant-pane" className="assistant-pane" aria-label="AI 대화 패널" hidden={!open}>
    <header className="assistant-header"><div className="flex items-center gap-2"><MessageSquare size={15} /><h2>함께 읽기</h2></div><Button variant="ghost" size="icon-sm" aria-label="AI 패널 접기" onClick={onClose}><PanelRightClose /></Button></header>
    <button className="provider-picker" onClick={onSettings}><span className="provider-mark"><ProviderLogo provider={provider} /></span><span>{provider === 'codex' ? 'Codex' : 'Claude Code'}</span><span className="connection-label">{installed === null ? '확인 중' : installed ? '설치됨' : '설치 필요'}</span><ChevronDown size={13} /></button>
    <div className="assistant-tabs"><button aria-pressed={tab === 'chat'} onClick={() => setTab('chat')}><MessageSquare size={14} />대화</button><button aria-pressed={tab === 'summary'} disabled={!session || installed !== true} onClick={() => void summarize()}><FileText size={14} />논문 요약</button><Button variant="ghost" size="icon-sm" aria-label="새 대화" title="새 대화 · 논문 컨텍스트 유지" disabled={!!busy} onClick={() => { setMessages([]); setDraft(''); setError(''); setNotice(''); setTab('chat') }}><Plus /></Button></div>
    <p className="paper-context-status" role="status">{status}</p>
    <div className="assistant-body" ref={body}>
      {tab === 'summary' ? <div className="paper-summary">{summary ? <><AnswerText text={summaryText} /><Button variant="outline" size="sm" disabled={!!busy} onClick={() => { setSummary(null); setTab('chat') }}>요약 지우기</Button></> : <p>{busy === 'summary' ? '논문 전체를 바탕으로 요약하는 중…' : busy === 'chat' ? '답변을 만들고 있어. 완료되면 논문 요약을 다시 눌러줘.' : '논문 요약 버튼을 눌러 다시 요청해 줘.'}</p>}</div> : messages.length ? <div className="chat-messages">{messages.map((message, index) => <div key={index} className={`chat-message ${message.role}`}><strong>{message.role === 'user' ? '나' : provider === 'codex' ? 'Codex' : 'Claude Code'}{message.role === 'assistant' && <button className="answer-copy" aria-label="답변 복사" title="답변 복사" onClick={() => void window.paperglim.copyText(message.text).catch(() => setError('답변을 복사하지 못했어.'))}><Copy size={12} /></button>}</strong><AnswerText text={message.text} citations={message.role === 'assistant'} /></div>)}{busy && <p role="status">{busy === 'summary' ? '논문 전체를 바탕으로 요약하는 중…' : '논문 전체를 참고해 답변하는 중…'}</p>}</div> : <><div className="assistant-intro"><h3>논문에 질문하기</h3><p>본문 전체를 참고해서 답해.<br />문장을 선택하면 PDF 위에서 설명을 볼 수 있어.</p></div><div className="question-suggestions">{readingQuestions.map(({ id, label }) => <button key={id} disabled={!session || installed !== true || !!busy} onClick={() => void send(label, id)}>{label}</button>)}</div></>}
    </div>
    <div className="composer-area">
      <div className="question-composer"><Textarea ref={draftInput} disabled={!session} aria-label="논문에 대한 질문" placeholder={session ? '논문 전체에 대해 질문해…' : 'PDF를 먼저 열어줘'} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.nativeEvent.isComposing && (event.metaKey || event.ctrlKey)) { event.preventDefault(); void send() } }} /><div className="composer-actions">
        <div className="composer-model"><ModelPicker provider={provider} model={model} providers={providers} onModel={onModel} onProvider={onProvider} disabled={!!busy} /></div>
        <button type="button" role="switch" aria-label="Fast 모드" aria-checked={fast && supportsFast} className={`fast-toggle ${fast && supportsFast ? 'enabled' : ''}`} disabled={!!busy || !supportsFast} title={supportsFast ? '대화·요약·선택 설명에 적용돼. Fast는 사용량을 더 소모해. 번역은 Standard를 사용해.' : installed !== true ? 'CLI를 설치하고 모델 목록을 확인해 줘.' : !providerStatus?.fastMode ? providerStatus?.fastModeNote || '이 CLI에서는 Fast를 지원하지 않아.' : '선택한 모델에서 Fast 지원을 확인할 수 없어.'} onClick={() => onFast(!fast)}><Zap size={13} /><span>Fast</span></button>
        <Button variant="ghost" size="icon-xs" aria-label={copied ? '복사했어' : '질문 복사'} title="질문 복사" disabled={!draft.trim()} onClick={() => void copyPrompt()}>{copied ? <Check /> : <Copy />}</Button>
        {busy ? <Button key="stop" size="icon-sm" aria-label="AI 요청 중지" title="실행 중인 AI 요청 중지" disabled={stopping} onClick={() => void stop()}><Square size={13} /></Button> : <Button key="send" size="icon-sm" disabled={!draft.trim() || !session || installed !== true} aria-label="AI에 보내기" title="보내기 (⌘Enter)" onClick={() => void send()}><ArrowUp /></Button>}
      </div></div>
      {fast && supportsFast && <p className="model-note">Fast 사용 중 · 구독 한도를 더 소모해</p>}
      {provider === 'claude' && <p className="model-note">Fast는 구독 외 크레딧 과금이 필요해서 꺼뒀어.</p>}
      {notice && <p className="model-note" role="status">{notice}</p>}
      {error && <p className="text-destructive text-xs" role="alert">{error}</p>}
      <p className="chat-context-note">대화는 임시로 유지돼 · 새 대화로 분리</p>
      <button className="connect-helper" onClick={onSettings}>내 AI 연결 상태 확인하기</button>
    </div>
  </aside>
}
