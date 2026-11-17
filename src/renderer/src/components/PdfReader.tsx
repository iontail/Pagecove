import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { Document, pdfjs } from 'react-pdf'
import { AlertCircle, ArrowLeft, ArrowRight, BookMarked, BookOpen, ChevronLeft, ChevronRight, FilePlus2, ListTree, Loader2, Minus, Plus, Scan, Search, Square, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import PdfSearch from './PdfSearch'
import SavedDiscussions from './SavedDiscussions'
import { AIRequest } from '@/lib/ai-request'
import type { SourceLocation } from '../../../shared/reading'
import PdfPageSpread from './PdfPageSpread'
import { TranslationSession } from '@/lib/translation-session'
import type { PaperSession } from '@/lib/paper-session'
import type { SelectionAnchor, SelectionThread } from '../../../shared/paper-harness'
import type { Paper } from '../../../shared/types'
import { translationLayout } from '../../../shared/panels'
import { pdfOutline } from '@/lib/pdf-outline'
import type { OutlineEntry } from '@/lib/pdf-outline'
import type { AppCommand } from '../../../shared/types'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import 'react-pdf/dist/Page/TextLayer.css'
import 'react-pdf/dist/Page/AnnotationLayer.css'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

export default function PdfReader({ sourceNavigation, onRelink, fast, session, threads, onSaveThread, onRemoveThread, resizing, onHome, paper, onOpen, onPage, translationOpen, onTranslationChange, provider, model }: {
  sourceNavigation: { paperId: string; page: number; token: number } | null
  onRelink: () => Promise<void>
  fast: boolean;
  session: PaperSession | null; threads: SelectionThread[]; onSaveThread: (thread: SelectionThread) => Promise<void>; onRemoveThread: (id: string) => Promise<void>
  resizing: boolean; onHome: () => void; paper: Paper | null; onOpen: () => void; onPage: (id: string, page: number) => void
  translationOpen: boolean; onTranslationChange: (open: boolean) => void; provider: string; model: string
}) {
  const [bytes, setBytes] = useState<Uint8Array | null>(null)
  const [error, setError] = useState('')
  const [pageCount, setPageCount] = useState(0)
  const [page, setPage] = useState(1)
  const [pageInput, setPageInput] = useState('1')
  const [zoom, setZoom] = useState(1)
  const [width, setWidth] = useState(640)
  const [aspect, setAspect] = useState(1.414)
  const [identity, setIdentity] = useState<{ paperId: string; fingerprint: string } | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [notesOpen, setNotesOpen] = useState(false)
  const [outlineOpen, setOutlineOpen] = useState(false)
  const [outline, setOutline] = useState<OutlineEntry[]>([])
  const [outlineError, setOutlineError] = useState('')
  const [relinking, setRelinking] = useState(false)
  const [history, setHistory] = useState<{ back: { page: number; ratio: number }[]; forward: { page: number; ratio: number }[] }>({ back: [], forward: [] })
  const [searchLocation, setSearchLocation] = useState<SourceLocation | null>(null)
  const navigationToken = useRef(0)
  const searchButton = useRef<HTMLButtonElement>(null)
  const notesButton = useRef<HTMLButtonElement>(null)
  const settings = useRef({ provider, model })
  settings.current = { provider, model }
  const [selection, setSelection] = useState<SelectionAnchor | null>(null)
  const [selectionPinned, setSelectionPinned] = useState(false)
  const selectionState = useRef({ anchor: selection, pinned: selectionPinned })
  selectionState.current = { anchor: selection, pinned: selectionPinned }
  const changeAnchor = useCallback((anchor: SelectionAnchor | null, pinned: boolean, expectedId?: string) => {
    if (expectedId && (selectionState.current.anchor?.id !== expectedId || selectionState.current.pinned)) return
    selectionState.current = { anchor, pinned }; setSelection(anchor); setSelectionPinned(pinned)
  }, [])
  const [translationShare, setTranslationShare] = useState(() => Math.max(.2, Math.min(.65, Number(localStorage.getItem('paperglim:translation-share')) || 1 / 3)))
  const translationStore = useMemo(() => session && identity?.paperId === session.paperId ? new TranslationSession(session, () => new AIRequest(settings.current.provider, settings.current.model), { fingerprint: identity.fingerprint, load: () => window.paperglim.getTranslations(session.paperId, identity.fingerprint), save: (cache) => window.paperglim.saveTranslations(session.paperId, cache) }) : null, [session, identity])
  useSyncExternalStore(translationStore?.subscribe ?? (() => () => {}), translationStore?.snapshot ?? (() => 0))
  useEffect(() => () => { void translationStore?.stop() }, [translationStore])
  useEffect(() => {
    let current = true
    void translationStore?.restored.then(() => { if (current && translationStore.visible.size) onTranslationChange(true) })
    return () => { current = false }
  }, [translationStore, onTranslationChange])
  const [translationDragging, setTranslationDragging] = useState(false)
  const scrollArea = useRef<HTMLDivElement>(null)
  const anchor = useRef({ page: 1, ratio: 0 })
  const frame = useRef(0)
  const contentHash = useRef('')
  const activePaper = useRef(paper?.id)
  activePaper.current = paper?.id
  const file = useMemo(() => bytes ? { data: bytes } : null, [bytes])
  const spreadWidth = Math.min(width, translationOpen ? 1200 : 800) * zoom
  const translation = translationLayout(spreadWidth, translationShare)
  const pageWidth = translationOpen ? translation.source : spreadWidth
  const renderWidth = useRef(pageWidth)
  if (!translationDragging) renderWidth.current = pageWidth

  useEffect(() => { if (!translationDragging) localStorage.setItem('paperglim:translation-share', String(translationShare)) }, [translationShare, translationDragging])

  useEffect(() => {
    let current = true
    const start = paper?.page ?? 1
    setIdentity(null); setSearchOpen(false); setNotesOpen(false); setSearchLocation(null); setSelection(null); setSelectionPinned(false); setBytes(null); setError(''); setPageCount(0); setPage(start); setZoom(1)
    setOutline([]); setOutlineOpen(false); setOutlineError(''); setHistory({ back: [], forward: [] })
    anchor.current = { page: start, ratio: 0 }
    if (paper) window.paperglim.readPdf(paper.id).then(({ data, fingerprint }) => { if (current) { contentHash.current = fingerprint; setBytes(data) } }, (cause) => { session?.fail(cause); if (current) setError(String(cause.message).replace(/^Error invoking remote method '[^']+': Error: /, '')) })
    return () => { current = false; cancelAnimationFrame(frame.current) }
  }, [paper?.id])

  useEffect(() => {
    const element = scrollArea.current
    if (!element || resizing) return
    setWidth(Math.max(260, element.clientWidth - 48))
    const observer = new ResizeObserver(() => setWidth(Math.max(260, element.clientWidth - 48)))
    observer.observe(element)
    return () => observer.disconnect()
  }, [resizing])

  useLayoutEffect(() => {
    const area = scrollArea.current
    const target = area?.querySelector<HTMLElement>(`[data-reading-page="${Math.min(anchor.current.page, pageCount)}"]`)
    if (area && target) area.scrollTop = target.offsetTop + anchor.current.ratio * target.offsetHeight
  }, [pageCount, pageWidth, paper?.id])

  useEffect(() => {
    setPageInput(String(page))
    if (paper && pageCount) onPage(paper.id, page)
  }, [page, pageCount, paper?.id, onPage])

  const jump = useCallback((location: { page: number; ratio: number }, remember = true) => {
    const area = scrollArea.current
    const target = area?.querySelector<HTMLElement>(`[data-reading-page="${location.page}"]`)
    if (!area || !target) return
    if (remember && (anchor.current.page !== location.page || Math.abs(anchor.current.ratio - location.ratio) > .01)) {
      const previous = { ...anchor.current }
      setHistory((current) => ({ back: [...current.back, previous].slice(-50), forward: [] }))
    }
    anchor.current = { ...location }
    area.scrollTop = target.offsetTop + location.ratio * target.offsetHeight
    setPage(location.page); setPageInput(String(location.page))
  }, [])
  useEffect(() => {
    if (!sourceNavigation || sourceNavigation.paperId !== paper?.id || sourceNavigation.page > pageCount) return
    changeAnchor(null, false); setSearchOpen(false); setSearchLocation(null); setNotesOpen(false); setOutlineOpen(false)
    jump({ page: sourceNavigation.page, ratio: 0 })
  }, [sourceNavigation, paper?.id, pageCount, jump, changeAnchor])
  const travel = useCallback((direction: 'back' | 'forward') => {
    const target = history[direction].at(-1)
    if (!target) return
    const previous = { ...anchor.current }
    const opposite = direction === 'back' ? 'forward' : 'back'
    setHistory((current) => ({ ...current, [direction]: current[direction].slice(0, -1), [opposite]: [...current[opposite], previous].slice(-50) }))
    jump(target, false)
  }, [history, jump])
  const locateSearch = useCallback((location: Omit<SourceLocation, 'token'> | null) => {
    setSearchLocation(location ? { ...location, token: ++navigationToken.current } : null)
    if (!location) return
    changeAnchor(null, false)
    jump({ page: location.page, ratio: 0 })
  }, [changeAnchor, jump])
  function closeSearch() { setSearchOpen(false); setSearchLocation(null); searchButton.current?.focus() }
  const changeZoom = useCallback((delta: number) => setZoom((value) => Math.max(.5, Math.min(2, Math.round((value + delta) * 100) / 100))), [])
  useEffect(() => {
    const area = scrollArea.current
    if (!area || !pageCount || !paper?.id) return
    const paperId = paper.id
    let delta = 0, pending = 0
    const wheel = (event: WheelEvent) => {
      if (activePaper.current !== paperId || !event.metaKey || event.altKey || !event.deltaY || document.querySelector('[role="dialog"][data-state="open"]')) return
      event.preventDefault()
      delta += event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? area.clientHeight : 1)
      if (!pending) pending = requestAnimationFrame(() => {
        changeZoom(Math.max(-.15, Math.min(.15, -delta * .0015)))
        delta = 0; pending = 0
      })
    }
    area.addEventListener('wheel', wheel, { passive: false })
    return () => { area.removeEventListener('wheel', wheel); cancelAnimationFrame(pending) }
  }, [paper?.id, pageCount, changeZoom])
  const runCommand = useCallback((command: AppCommand) => {
    if (!pageCount || document.querySelector('[role="dialog"][data-state="open"]')) return
    if (command === 'find') { changeAnchor(null, false); setNotesOpen(false); setOutlineOpen(false); setSearchOpen(true); requestAnimationFrame(() => document.querySelector<HTMLInputElement>('input[aria-label="본문 검색어"]')?.select()) }
    if (command === 'zoomIn') changeZoom(.15)
    if (command === 'zoomOut') changeZoom(-.15)
    if (command === 'resetZoom') setZoom(1)
    if (command === 'back' || command === 'forward') travel(command)
    if (command === 'outline') { setSearchOpen(false); setNotesOpen(false); setOutlineOpen((value) => !value) }
  }, [pageCount, changeAnchor, changeZoom, travel])
  useEffect(() => window.paperglim.onCommand(runCommand), [runCommand])
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.isComposing || !pageCount || document.querySelector('[role="dialog"][data-state="open"]')) return
      if (event.key.toLowerCase() === 'f') {
        event.preventDefault(); runCommand('find')
      } else if (event.key === '+' || event.key === '=' || event.code === 'NumpadAdd') {
        event.preventDefault(); changeZoom(.15)
      } else if (event.key === '-' || event.code === 'NumpadSubtract') {
        event.preventDefault(); changeZoom(-.15)
      } else if (event.key === '0') {
        event.preventDefault(); setZoom(1)
      } else if (event.key === '[' || event.key === ']') {
        event.preventDefault(); runCommand(event.key === '[' ? 'back' : 'forward')
      }
    }
    window.addEventListener('keydown', shortcut)
    return () => window.removeEventListener('keydown', shortcut)
  }, [pageCount, runCommand, changeZoom])
  function openSaved(thread: SelectionThread) {
    navigate(thread.page); setNotesOpen(false); changeAnchor(thread, true)
    requestAnimationFrame(() => {
      const mark = [...(scrollArea.current?.querySelectorAll<HTMLElement>('[data-annotation-id]') ?? [])].find((element) => element.dataset.annotationId === thread.id)
      mark?.scrollIntoView({ block: 'center', inline: 'nearest' })
    })
  }

  function trackPage() {
    cancelAnimationFrame(frame.current)
    frame.current = requestAnimationFrame(() => {
      const area = scrollArea.current
      if (!area) return
      const bounds = area.getBoundingClientRect()
      let best = 0
      let active: HTMLElement | null = null
      for (const row of area.querySelectorAll<HTMLElement>('[data-reading-page]')) {
        const rect = row.getBoundingClientRect()
        const overlap = Math.max(0, Math.min(rect.bottom, bounds.bottom) - Math.max(rect.top, bounds.top))
        if (overlap > best) { active = row; best = overlap }
      }
      if (active) {
        const number = Number(active.dataset.readingPage)
        anchor.current = { page: number, ratio: Math.max(0, (area.scrollTop - active.offsetTop) / active.offsetHeight) }
        setPage(number)
      }
    })
  }

  function navigate(value: number) {
    if (!pageCount || !Number.isInteger(value)) { setPageInput(String(page)); return }
    jump({ page: Math.max(1, Math.min(pageCount, value)), ratio: 0 })
  }

  return <section className={`reader-pane ${translationDragging ? 'resizing-translation' : ''}`} aria-label="PDF 뷰어">
    <div className="reader-document-header"><div className="reader-title-group">{paper && <Button variant="ghost" size="icon-sm" aria-label="시작 화면으로 돌아가기" title="시작 화면으로 돌아가기" onClick={onHome}><ArrowLeft /></Button>}<h1 title={paper?.name}>{paper?.name ?? '내 읽기 공간'}</h1></div><div className="reader-header-actions">{paper && <><Button variant="ghost" size="icon-sm" aria-label="문서 목차" title="문서 목차" aria-expanded={outlineOpen} disabled={!pageCount} onClick={() => runCommand('outline')}><ListTree /></Button><Button ref={searchButton} variant="ghost" size="icon-sm" aria-label="본문 검색" title="본문 검색 (⌘F)" aria-expanded={searchOpen} disabled={!pageCount} onClick={() => { changeAnchor(null, false); setOutlineOpen(false); setNotesOpen(false); setSearchOpen((value) => !value); setSearchLocation(null) }}><Search /></Button><Button ref={notesButton} variant="ghost" size="icon-sm" aria-label="저장된 설명" title={`저장된 설명 ${threads.length}개`} aria-expanded={notesOpen} disabled={!pageCount} onClick={() => { setOutlineOpen(false); setSearchOpen(false); setSearchLocation(null); setNotesOpen((value) => !value) }}><BookMarked /></Button></>}<Button variant="ghost" size="icon" aria-label="다른 PDF 열기" onClick={onOpen}><FilePlus2 /></Button></div></div>
    {paper && <div className="reader-toolbar" aria-label="PDF 도구">
      <div className="toolbar-group"><Button variant="ghost" size="icon-sm" aria-label="이전 읽기 위치" title="이전 읽기 위치 (⌘[)" disabled={!history.back.length} onClick={() => travel('back')}><ArrowLeft /></Button><Button variant="ghost" size="icon-sm" aria-label="다음 읽기 위치" title="다음 읽기 위치 (⌘])" disabled={!history.forward.length} onClick={() => travel('forward')}><ArrowRight /></Button><Separator orientation="vertical" className="h-4 mx-1" /><Button variant="ghost" size="icon-sm" aria-label="이전 페이지" disabled={!pageCount || page <= 1} onClick={() => navigate(page - 1)}><ChevronLeft /></Button><Input aria-label="페이지 번호" className="page-input" value={pageInput} disabled={!pageCount} onChange={(event) => setPageInput(event.target.value)} onBlur={() => navigate(Number(pageInput))} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }} /><span className="page-total">/ {pageCount || '—'}</span><Button variant="ghost" size="icon-sm" aria-label="다음 페이지" disabled={!pageCount || page >= pageCount} onClick={() => navigate(page + 1)}><ChevronRight /></Button></div>
      <div className="toolbar-group"><Button variant="ghost" size="icon-sm" aria-label="축소" title="축소 (⌘−)" disabled={!pageCount || zoom <= .5} onClick={() => changeZoom(-.15)}><Minus /></Button><span className="zoom-label">{Math.round(zoom * 100)}%</span><Button variant="ghost" size="icon-sm" aria-label="확대" title="확대 (⌘+)" disabled={!pageCount || zoom >= 2} onClick={() => changeZoom(.15)}><Plus /></Button><Separator orientation="vertical" className="h-4 mx-1" /><Button variant="ghost" size="icon-sm" aria-label="너비에 맞추기" title="너비에 맞추기 (⌘0)" disabled={!pageCount} onClick={() => setZoom(1)}><Scan /></Button></div>
    </div>}
    {outlineOpen && <aside className="document-outline" aria-label="문서 목차 목록" onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); setOutlineOpen(false) } }}><header><strong>문서 목차</strong><Button variant="ghost" size="icon-sm" aria-label="목차 닫기" onClick={() => setOutlineOpen(false)}><X /></Button></header>{outline.length ? <nav>{outline.map((entry, index) => <button key={index} style={{ paddingLeft: 16 + Math.min(entry.depth, 8) * 12 }} onClick={() => { navigate(entry.page); setOutlineOpen(false) }}><span>{entry.title}</span><small>p. {entry.page}</small></button>)}</nav> : <p>{outlineError || '이 PDF에는 문서 목차가 없어.'}</p>}</aside>}
    {searchOpen && session && <PdfSearch session={session} onLocate={locateSearch} onClose={closeSearch} />}
    {notesOpen && <SavedDiscussions threads={threads} onOpen={openSaved} onClose={() => { setNotesOpen(false); notesButton.current?.focus() }} />}
    <div className="reader-scroll" ref={scrollArea} onScroll={trackPage}>
      {!paper ? <div className="reading-welcome"><BookOpen size={36} strokeWidth={1} /><h2>논문을 열어 읽기</h2><p>PDF를 여기에 놓거나 파일을 열어줘.<br />Zotero에 모아둔 논문도 왼쪽에서 가져올 수 있어.</p><Button onClick={onOpen}>PDF 열기</Button><span className="shortcut-hint">⌘O</span></div> : error ? <div className="reader-message" role="alert"><AlertCircle /><h2>PDF를 열 수 없어</h2><p>{error}</p><Button variant="outline" disabled={relinking} onClick={async () => { setRelinking(true); try { await onRelink() } catch (cause) { setError(cause instanceof Error ? cause.message : '파일 위치를 변경하지 못했어.') } finally { setRelinking(false) } }}>{relinking ? '확인 중…' : '파일 위치 다시 지정'}</Button><Button variant="ghost" onClick={onOpen}>다른 PDF 새로 열기</Button></div> : file ? <Document file={file} suspense={false}
        onLoadSuccess={async (pdf) => { try { session?.attach(pdf, pdfjs.OPS, contentHash.current); const first = await pdf.getPage(1); if (activePaper.current !== paper.id) return; const viewport = first.getViewport({ scale: 1 }); setIdentity({ paperId: paper.id, fingerprint: contentHash.current }); setAspect(viewport.height / viewport.width); setPageCount(pdf.numPages); setPage((current) => Math.min(current, pdf.numPages)); void pdfOutline(pdf).then((entries) => { if (activePaper.current === paper.id) setOutline(entries) }).catch(() => { if (activePaper.current === paper.id) setOutlineError('목차를 읽지 못했어. 본문 검색을 이용해 줘.') }) } catch (cause) { if (activePaper.current === paper.id) setError(cause instanceof Error ? cause.message : 'PDF를 읽을 수 없어.') } }}
        onSourceError={(cause) => { session?.fail(cause); setError(cause.message) }} onLoadError={(cause) => { session?.fail(cause); setError(`PDF를 읽을 수 없어. 암호나 파일 손상 여부를 확인해 줘. (${cause.message})`) }}
        loading={<div className="pdf-loading"><Loader2 className="animate-spin" />PDF를 불러오는 중</div>}>
        {session && translationStore && <div className={`pages-stack ${translationOpen ? 'parallel-pages' : ''}`}>{Array.from({ length: pageCount }, (_, index) => <PdfPageSpread fast={fast} key={`${paper.id}:${index + 1}`} session={session} searchLocation={searchLocation?.page === index + 1 ? searchLocation : null} selection={selection?.page === index + 1 ? selection : null} selectionPinned={selectionPinned} onAnchor={changeAnchor} threads={threads.filter((thread) => thread.page === index + 1)} onSaveThread={onSaveThread} onRemoveThread={onRemoveThread} store={translationStore} paperId={paper.id} page={index + 1} width={pageWidth} spreadWidth={translationOpen ? spreadWidth : pageWidth} renderWidth={renderWidth.current} translation={translation} onTranslationWidth={(value) => setTranslationShare(value / spreadWidth)} onTranslationDragging={setTranslationDragging} onTranslationReset={() => setTranslationShare(1 / 3)} defaultAspect={aspect} parallel={translationOpen} root={scrollArea} provider={provider} model={model} onExpand={() => onTranslationChange(true)} onCollapse={() => { if (!translationStore.visible.size) onTranslationChange(false) }} />)}</div>}
      </Document> : <div className="pdf-loading"><Loader2 className="animate-spin" />PDF를 불러오는 중</div>}
    </div>
    <div className="reader-status"><span>{translationStore?.all.total ? `전체 번역 ${translationStore.all.completed} / ${translationStore.all.total}${translationStore.all.failed ? ` · 확인 필요 ${translationStore.all.failed}페이지` : ''}${translationStore.all.cancelled ? ' · 중지됨' : ''}` : translationStore?.running ? '페이지를 번역하는 중…' : paper ? '연속 스크롤' : 'PDF · Zotero'}</span>{translationStore?.running && <Button variant="ghost" size="icon-xs" aria-label="진행 중인 번역 중지" title="이 논문의 진행 중인 번역 중지" disabled={translationStore.stopping} onClick={() => void translationStore.stop()}><Square size={11} /></Button>}<span className="ml-auto">{pageCount ? `${page} / ${pageCount}` : 'PaperGlim'}</span></div>
  </section>
}
