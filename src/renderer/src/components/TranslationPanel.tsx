import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import RecoveryNotice from './RecoveryNotice'
import { Copy, Square, Trash2, Languages, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { PageContext, SourceLocation } from '../../../shared/reading'
import type { TranslationSession } from '@/lib/translation-session'

export default function TranslationPanel({ context, page, store, open, onLocate, onClose }: {
  context: PageContext | null; page: number; store: TranslationSession; open: boolean
  onLocate: (location: SourceLocation | null) => void; onClose: () => void
}) {
  useSyncExternalStore(store.subscribe, store.snapshot)
  const [notice, setNotice] = useState('')
  const [selected, setSelected] = useState('')
  const [copied, setCopied] = useState(false)
  const [included, setIncluded] = useState<string[]>(() => store.scope(page))
  const [copyError, setCopyError] = useState('')
  const body = useRef<HTMLDivElement>(null)
  const state = store.read(page, included)
  const translations = state?.results ?? []
  const busy = state?.status === 'queued' || state?.status === 'running'
  const warnings = translations.flatMap((paragraph) => paragraph.sentences).filter((sentence) => sentence.warning).length
  const hasText = !!context && (context.translation ? context.translation.blocks.length + included.length > 0 : context.blocks.length > 0)
  useEffect(() => { setIncluded(store.scope(page)); setSelected(''); setNotice('') }, [store, page])
  useEffect(() => { body.current?.scrollTo({ top: 0 }); setSelected(''); setCopied(false) }, [included])
  function clearLocation() { setSelected(''); onLocate(null) }
  if (!open) return null
  return <section className="translation-panel translation-paper" aria-label={`${page}페이지 한글번역`} onMouseLeave={clearLocation}>
    <header className="translation-page-header"><strong>한글번역</strong><span>{page}</span><Button variant="ghost" size="icon-sm" aria-label="나란히 번역 닫기" onClick={() => { clearLocation(); onClose() }}><X /></Button></header>
    <div className="translation-page-body" ref={body}>
      {context?.translation && <details className="translation-scope"><summary>번역 범위 · 영어 용어 유지</summary><p>본문 {context.translation.blocks.length}개 · 도표·여백 {context.translation.excluded.length - included.length}개 제외. 주요 전문 용어는 영어로 표시해요.</p>{context.translation.partial && <p role="status">도표를 일부 확인하지 못했어요. 번역에서 빠진 항목을 원문과 비교해 주세요.</p>}<div>{context.translation.excluded.map(({ block, reason }) => <label key={block.id}><input type="checkbox" aria-label={`${block.id} 번역에 포함`} checked={included.includes(block.id)} disabled={busy} onChange={(event) => setIncluded(event.target.checked ? [...included, block.id] : included.filter((id) => id !== block.id))} /><span><small>{reason}</small>{block.text}</span><button aria-label={`${block.id} 제외 원문 위치 보기`} onClick={() => onLocate({ paperId: context.paperId, page, itemIndexes: block.itemIndexes, token: Date.now() })}>위치</button></label>)}</div></details>}
      {busy && <p className="translation-pending" role="status"><Loader2 className="animate-spin" />{state.status === 'queued' ? '번역 대기 중…' : '페이지 번역 중…'}</p>}
      {state?.error && <RecoveryNotice error={state.error} disabled={busy} onRetry={() => { if (context) void store.translate(context, included, true) }} />}
      {(copyError || store.storageError) && <p className="zotero-error" role="alert">{copyError || store.storageError}{store.storageError && !!translations.length && <button className="translation-save-retry" onClick={() => void store.save()}>저장 다시 시도</button>}</p>}
      {(notice || state?.status === 'cancelled') && <p className="translation-notice" role="status">{notice || '번역을 중지했어요. 다시 시작하려면 ‘다시 번역’을 누르세요.'}</p>}
      {!!warnings && <p className="translation-notice" role="status">확인이 필요한 {warnings}개 문장은 원문으로 표시했어요.</p>}
      {!busy && !translations.length && !notice && state?.status !== 'cancelled' && <p className="translation-empty">{!hasText ? '번역할 본문이 없어요. ‘번역 범위’에서 필요한 텍스트를 선택하세요. 스캔 PDF의 문자 인식(OCR)은 아직 지원하지 않아요.' : '번역 범위를 바꿨다면 ‘다시 번역’을 누르세요.'}</p>}
      <div className="translation-paragraphs">{translations.map(({ source, sentences }) => <p key={source.id} className={`translation-paragraph ${source.kind === 'caption' ? 'translation-caption' : ''}`} data-paragraph-id={source.id}>{source.kind === 'caption' && <span className="translation-caption-label">그림·표 설명</span>}{sentences.map(({ source: sentence, text, warning }, index) => {
        function show() { if (context) { setSelected(sentence.id); onLocate({ paperId: context.paperId, page, itemIndexes: sentence.itemIndexes, ranges: sentence.ranges, token: Date.now() }) } }
        return <span key={sentence.id}>{index > 0 ? ' ' : ''}<span role="button" tabIndex={0} title={warning ? `원문 유지 · ${warning}` : undefined} aria-label={`번역 문장 ${sentence.id} 원문 보기`} data-source-text={sentence.text} data-fallback={warning ? 'true' : undefined} aria-pressed={selected === sentence.id} className={`translation-sentence ${selected === sentence.id ? 'selected' : ''} ${warning ? 'translation-unverified' : ''}`} onMouseEnter={show} onMouseLeave={clearLocation} onFocus={show} onBlur={clearLocation} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); show() } }}>{warning && <small className="translation-fallback-label">원문</small>}{text}</span></span>
      })}</p>)}</div>
    </div>
    <footer className="translation-page-footer">{busy ? <Button size="sm" variant="ghost" disabled={store.stopping} onClick={() => void store.stop()}><Square size={12} />{store.stopping ? '중지 중…' : '번역 중지'}</Button> : <Button size="sm" variant="ghost" disabled={!hasText || store.loading} title="선택한 모델로 다시 번역" onClick={() => { setNotice(''); if (context) void store.translate(context, included, true) }}><Languages />다시 번역</Button>}{!!translations.length && <Button variant="ghost" size="sm" onClick={() => void window.paperglim.copyText(translations.map((entry) => entry.text).join('\n\n')).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800) }).catch(() => setCopyError('복사하지 못했어요. 다시 시도해 주세요.'))}><Copy />{copied ? '복사 완료' : '복사'}</Button>}{!!translations.length && <Button size="icon-sm" variant="ghost" aria-label={`${page}페이지 저장 번역 삭제`} title="이 페이지의 저장 번역 삭제" disabled={busy || store.all.running} onClick={() => void store.clearPage(page).then(() => { clearLocation(); setIncluded([]); setNotice('저장한 번역을 지웠어요. ‘다시 번역’을 눌러 새 번역을 받을 수 있어요.') }).catch((error) => setCopyError(error.message))}><Trash2 size={13} /></Button>}</footer>
  </section>
}
