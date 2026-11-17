import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ChevronRight, CircleHelp, FileText, Folder, FolderOpen, Home, Library, Loader2, PanelRightOpen, Plus, Search, Settings2, X } from 'lucide-react'
import appMark from './assets/paperglim.svg'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { PaperSession } from '@/lib/paper-session'
import type { SelectionThread } from '../../shared/paper-harness'
import PanelResizer from '@/components/PanelResizer'
import { defaultPanels, panelLayout } from '../../shared/panels'
import AssistantPanel from '@/components/AssistantPanel'
import ConnectionSettings from '@/components/ConnectionSettings'
import HelpGuide from '@/components/HelpGuide'
import ZoteroLibrary from '@/components/ZoteroLibrary'
import type { Paper, ZoteroCatalog, ZoteroCollection } from '../../shared/types'
import { collectionRows, inCollection } from '../../shared/collections'
import { ReadingActions } from '@/lib/reading-actions'
import { appScales } from '../../shared/appearance'

const PdfReader = lazy(() => import('@/components/PdfReader'))

export default function App() {
  const [papers, setPapers] = useState<Paper[]>([])
  const [activeId, setActiveId] = useState<string | null>(() => localStorage.getItem('paperglim:active'))
  const [query, setQuery] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsSection, setSettingsSection] = useState('general')
  const [removedPaper, setRemovedPaper] = useState<{ name: string; active: boolean } | null>(null)
  const [documentRevision, setDocumentRevision] = useState(0)
  const [sourceNavigation, setSourceNavigation] = useState<{ paperId: string; page: number; token: number } | null>(null)
  const [appScale, setAppScale] = useState(() => {
    const saved = Number(localStorage.getItem('paperglim:app-scale'))
    return appScales.includes(saved) ? saved : 1
  })
  useLayoutEffect(() => {
    window.paperglim.setAppScale(appScale)
    localStorage.setItem('paperglim:app-scale', String(appScale))
  }, [appScale])
  const [zoteroOpen, setZoteroOpen] = useState(false)
  const [guideOpen, setGuideOpen] = useState(false)
  const [guideSeen, setGuideSeen] = useState(() => localStorage.getItem('paperglim:guide-seen:v1') === 'true')
  const openGuide = useCallback(() => {
    setSettingsOpen(false); setZoteroOpen(false); setGuideOpen(true); setGuideSeen(true)
    localStorage.setItem('paperglim:guide-seen:v1', 'true')
  }, [])
  const [assistantOpen, setAssistantOpen] = useState(false)
  useEffect(() => {
    const unsubscribe = window.paperglim.onCommand((command) => {
      if (command === 'settings') { setGuideOpen(false); setSettingsSection('general'); setSettingsOpen(true) }
      if (command === 'toggleAssistant') setAssistantOpen((value) => !value)
      if (command === 'guide') openGuide()
    })
    const settingsShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.isComposing && event.key === ',') {
        event.preventDefault(); setGuideOpen(false); setSettingsSection('general'); setSettingsOpen(true)
      }
    }
    window.addEventListener('keydown', settingsShortcut)
    return () => { unsubscribe(); window.removeEventListener('keydown', settingsShortcut) }
  }, [openGuide])
  const [error, setError] = useState('')
  const [restoreNotice, setRestoreNotice] = useState(sessionStorage.getItem('paperglim:restore-complete') === 'true')
  useEffect(() => { sessionStorage.removeItem('paperglim:restore-complete') }, [])
  const [opening, setOpening] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [provider, setProvider] = useState(localStorage.getItem('paperglim:provider') ?? 'codex')
  const [models, setModels] = useState(() => ({ codex: localStorage.getItem('paperglim:codex-model') ?? '', claude: localStorage.getItem('paperglim:claude-model') ?? '' }))
  const model = models[provider === 'claude' ? 'claude' : 'codex']
  const [fast, setFast] = useState(localStorage.getItem('paperglim:fast') === 'true')
  function chooseFast(value: boolean) { setFast(value); localStorage.setItem('paperglim:fast', String(value)) }
  function chooseModel(value: string) {
    setModels((current) => ({ ...current, [provider]: value }))
    localStorage.setItem(`paperglim:${provider}-model`, value)
    chooseFast(false)
  }
  function chooseProvider(value: string) { setProvider(value); localStorage.setItem('paperglim:provider', value); chooseFast(false) }
  const [collections, setCollections] = useState<ZoteroCollection[]>([])
  const [collection, setCollection] = useState(() => localStorage.getItem('paperglim:collection') ?? '')
  const sessions = useRef(new Map<string, PaperSession>())
  const session = useMemo(() => {
    if (!activeId) return null
    if (!sessions.current.has(activeId)) sessions.current.set(activeId, new PaperSession(activeId))
    return sessions.current.get(activeId)!
  }, [activeId, documentRevision])
  const navigation = useMemo(() => ({
    pageCount: session?.pageCount ?? 0,
    goToPage: (page: number) => { if (activeId && Number.isInteger(page) && page > 0 && page <= (session?.pageCount ?? 0)) setSourceNavigation({ paperId: activeId, page, token: Date.now() }) },
    openAISettings: () => { setSettingsSection('ai'); setSettingsOpen(true) }
  }), [activeId, session, session?.pageCount])
  const [notes, setNotes] = useState<{ paperId: string | null; threads: SelectionThread[] }>({ paperId: null, threads: [] })
  useEffect(() => {
    let current = true
    setNotes({ paperId: activeId, threads: [] })
    if (activeId) void window.paperglim.getAnnotations(activeId).then((threads) => { if (current) setNotes((value) => ({ paperId: activeId, threads: [...threads.filter((thread) => !value.threads.some((entry) => entry.id === thread.id)), ...value.threads] })) }).catch(() => { if (current) setError('저장된 선택 영역 설명을 불러오지 못했어.') })
    return () => { current = false }
  }, [activeId])
  const saveThread = useCallback(async (thread: SelectionThread) => {
    if (!activeId) return
    await window.paperglim.saveAnnotation(activeId, thread)
    setNotes((value) => value.paperId === activeId ? { ...value, threads: [...value.threads.filter((entry) => entry.id !== thread.id), thread] } : value)
  }, [activeId])
  const removeThread = useCallback(async (id: string) => {
    if (!activeId) return
    await window.paperglim.removeAnnotation(activeId, id)
    setNotes((value) => value.paperId === activeId ? { ...value, threads: value.threads.filter((entry) => entry.id !== id) } : value)
  }, [activeId])
  const [translationOpen, setTranslationOpen] = useState(false)
  const changeTranslation = useCallback((open: boolean) => { setTranslationOpen(open); if (open) setAssistantOpen(false) }, [])
  const [resizing, setResizing] = useState(false)
  const [viewport, setViewport] = useState(window.innerWidth)
  const [preferredPanels, setPreferredPanels] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('paperglim:panels') ?? 'null')
      return saved && Number.isFinite(saved.library) && Number.isFinite(saved.assistant) ? saved as typeof defaultPanels : defaultPanels
    } catch { return defaultPanels }
  })
  const panels = panelLayout(preferredPanels, viewport, assistantOpen)
  useEffect(() => {
    const resize = () => setViewport(window.innerWidth)
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])
  useEffect(() => { if (!resizing) localStorage.setItem('paperglim:panels', JSON.stringify(preferredPanels)) }, [preferredPanels, resizing])

  function selectPaper(id: string | null) {
    localStorage.setItem('paperglim:view', id ? 'reading' : 'home')
    setActiveId(id)
    if (!id) setAssistantOpen(false)
  }

  useEffect(() => {
    let current = true
    Promise.all([window.paperglim.listPapers(), window.paperglim.getZoteroCollections()]).then(([items, folders]) => {
      if (!current) return
      setPapers(items)
      setCollections(folders)
      if (!folders.some((folder) => folder.key === collection)) setCollection('')
      const saved = localStorage.getItem('paperglim:active')
      setActiveId(localStorage.getItem('paperglim:view') === 'home' ? null : items.find((paper) => paper.id === saved)?.id ?? items[0]?.id ?? null)
    }).catch(() => { if (current) setError('최근 문서를 불러올 수 없어.') })
    return () => { current = false }
  }, [])

  const acceptPapers = useCallback(async (items: Paper[]) => {
    if (!items.length) return
    setPapers(await window.paperglim.listPapers())
    localStorage.setItem('paperglim:view', 'reading')
    setActiveId(items[0].id)
  }, [])

  const acceptCatalog = useCallback(async (catalog: ZoteroCatalog) => {
    setCollections(catalog.collections)
    const items = await window.paperglim.listPapers()
    setPapers(items)
    setCollection((current) => catalog.collections.some((entry) => entry.key === current) ? current : '')
  }, [])

  function chooseCollection(key: string) { setCollection(key); localStorage.setItem('paperglim:collection', key) }

  useEffect(() => window.paperglim.onOpenPaper((items) => { void acceptPapers(items).catch(() => setError('문서를 불러올 수 없어.')) }), [acceptPapers])
  useEffect(() => {
    setTranslationOpen(false); setSourceNavigation(null)
    if (activeId) localStorage.setItem('paperglim:active', activeId)
    else localStorage.removeItem('paperglim:active')
  }, [activeId])

  const openPdfs = useCallback(async () => {
    setOpening(true)
    setError('')
    try { await acceptPapers(await window.paperglim.choosePdfs()) }
    catch (cause) { setError(cause instanceof Error ? cause.message.replace(/^Error invoking remote method '[^']+': Error: /, '') : 'PDF를 열 수 없어.') }
    finally { setOpening(false) }
  }, [acceptPapers])

  const updatePage = useCallback((id: string, page: number) => {
    setPapers((current) => current.map((paper) => paper.id === id ? { ...paper, page } : paper))
    void window.paperglim.updatePage(id, page).catch(() => setError('읽던 위치를 저장할 수 없어.'))
  }, [])

  async function removePaper(id: string) {
    try {
      const removed = papers.find((paper) => paper.id === id)
      await window.paperglim.removePaper(id)
      const items = await window.paperglim.listPapers()
      setPapers(items)
      if (activeId === id) setActiveId(items[0]?.id ?? null)
      if (removed) setRemovedPaper({ name: removed.name, active: activeId === id })
    } catch { setError('목록에서 문서를 지울 수 없어.') }
  }

  async function undoRemove() {
    try {
      const restored = await window.paperglim.undoRemovePaper()
      setPapers(await window.paperglim.listPapers())
      if (removedPaper?.active) setActiveId(restored.id)
      setRemovedPaper(null)
    } catch { setError('목록 제거를 되돌리지 못했어. 같은 파일을 이미 다시 등록했는지 확인해 줘.') }
  }
  async function relinkPaper() {
    if (!activeId) return
    const linked = await window.paperglim.relinkPaper(activeId)
    if (linked) { sessions.current.delete(activeId); setDocumentRevision((value) => value + 1); setPapers(await window.paperglim.listPapers()) }
  }

  const activePaper = papers.find((paper) => paper.id === activeId) ?? null
  const filtered = papers.filter((paper) => inCollection(paper.collectionKeys ?? [], collection, collections) && paper.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
  const selectedCollection = collections.find((entry) => entry.key === collection)

  return (
    <ReadingActions.Provider value={navigation}><div className={`app-shell ${assistantOpen ? '' : 'assistant-hidden'} ${resizing ? 'resizing-panels' : ''}`} style={{ gridTemplateColumns: `${panels.library ? `${panels.library}px 6px ` : ''}minmax(0, 1fr)${assistantOpen ? ` 6px ${panels.assistant}px` : ''}` }}
      onDragOver={(event) => { event.preventDefault(); if (event.dataTransfer.types.includes('Files')) setDragging(true) }}
      onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false) }}
      onDrop={(event) => { event.preventDefault(); setDragging(false); const files = Array.from(event.dataTransfer.files); if (files.length) void window.paperglim.dropPdfs(files).then(acceptPapers).catch((cause: Error) => setError(cause.message)) }}>
      {dragging && <div className="drop-overlay">PDF를 여기에 놓아줘</div>}
      <header className="titlebar"><div className="window-controls-space" /><span className="titlebar-project">내 읽기 공간</span><span className="titlebar-center">PaperGlim</span><div className="titlebar-actions"><span className="local-label"><span />이 Mac</span><Button variant="ghost" size={guideSeen ? 'icon-sm' : 'sm'} aria-label="사용 가이드 열기" onClick={openGuide}><CircleHelp />{!guideSeen && <span>사용 가이드</span>}</Button><Button variant="ghost" size="icon-sm" aria-label="연결 설정 열기" title="설정 (⌘,)" onClick={() => { setSettingsSection('general'); setSettingsOpen(true) }}><Settings2 /></Button></div></header>
      <aside id="library-pane" className="library-pane" aria-label="논문 라이브러리" hidden={!panels.library}>
        <div className="brand"><img src={appMark} width={25} height={27} alt="" /><div><strong>PaperGlim</strong><span>내 논문 라이브러리</span></div></div>
        <div className="library-search"><Search size={14} /><Input aria-label="논문 검색" placeholder="논문 검색" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
        <div className="library-navigation"><button className={`nav-row ${!activePaper ? 'home-selected' : ''}`} onClick={() => selectPaper(null)}><Home size={16} /><span>시작 화면</span></button><button className={`nav-row ${!collection && activePaper ? 'selected' : ''}`} onClick={() => chooseCollection('')}><Library size={16} /><span>모든 논문</span><span className="nav-count">{papers.length}</span></button><button className="nav-row" onClick={() => setZoteroOpen(true)}><span className="zotero-mark">Z</span><span>Zotero</span><span className="nav-trailing">동기화<ChevronRight size={12} /></span></button><button className="nav-row" onClick={() => { chooseCollection(''); void window.paperglim.openExample().then(acceptPapers).catch(() => setError('예제 PDF를 열 수 없어.')) }}><FileText size={16} /><span>ResNet 예제 열기</span></button></div>
        {!!collections.length && <nav className="collection-tree" aria-label="Zotero 컬렉션"><span className="collection-heading">Zotero 컬렉션</span>{collectionRows(collections).map((entry) => <button key={entry.key} title={entry.path} className={`collection-row ${entry.key === collection ? 'selected' : ''}`} style={{ paddingLeft: 8 + entry.depth * 14 }} aria-current={entry.key === collection ? 'true' : undefined} onClick={() => chooseCollection(entry.key)}><Folder size={14} /><span>{entry.name}</span><small>{papers.filter((paper) => inCollection(paper.collectionKeys ?? [], entry.key, collections)).length}</small></button>)}</nav>}
        <Separator />
        <div className="list-heading"><span title={selectedCollection?.name}>{query ? '검색 결과' : selectedCollection?.name ?? '논문'}</span><Button variant="ghost" size="icon-xs" aria-label="논문 추가" disabled={opening} onClick={() => void openPdfs()}><Plus /></Button></div>
        {collection && <button className="collection-import" onClick={() => setZoteroOpen(true)}>이 컬렉션에서 PDF 가져오기<ChevronRight size={12} /></button>}
        <div className="paper-list">
          {filtered.map((paper) => <div key={paper.id} className={`paper-row ${paper.id === activeId ? 'active' : ''}`}><button className="paper-select" onClick={() => selectPaper(paper.id)}><FileText size={17} /><span><strong title={paper.name}>{paper.name}</strong><small>PDF<span />{paper.lastOpenedAt ? `${paper.page}페이지에서 이어 읽기` : '읽기 전'}</small></span></button><button className="paper-remove" aria-label={`${paper.name} 목록에서 지우기`} title="목록에서 지우기 (원본 유지)" onClick={() => void removePaper(paper.id)}><X size={12} /></button></div>)}
          {!filtered.length && <div className="library-empty"><FileText size={22} strokeWidth={1.3} /><p>{query ? '일치하는 논문이 없어' : '아직 펼친 논문이 없어'}</p><span>{query ? '다른 제목으로 검색해 봐.' : 'PDF를 열면 여기에 모아둘게.'}</span></div>}
        </div>
        <div className="library-bottom"><Button variant="outline" className="w-full" disabled={opening} onClick={() => void openPdfs()}>{opening ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <FolderOpen data-icon="inline-start" />}PDF 열기<span className="ml-auto text-muted-foreground text-xs">⌘O</span></Button><p>원본은 그대로, 읽던 곳은 기억해.</p></div>
      </aside>
      {!!panels.library && <PanelResizer side="library" width={panels.library} min={208} max={panels.libraryMax} onChange={(library) => setPreferredPanels((current) => ({ ...current, library }))} onDragging={setResizing} onReset={() => setPreferredPanels((current) => ({ ...current, library: defaultPanels.library }))} />}
      <main className="reading-main"><Suspense fallback={<div className="pdf-loading"><Loader2 className="animate-spin" />읽기 공간 준비 중</div>}><PdfReader sourceNavigation={sourceNavigation} key={documentRevision} onRelink={relinkPaper} fast={fast} session={session} threads={notes.paperId === activeId ? notes.threads : []} onSaveThread={saveThread} onRemoveThread={removeThread} resizing={resizing} onHome={() => selectPaper(null)} paper={activePaper} onOpen={() => void openPdfs()} onPage={updatePage} provider={provider} model={model} translationOpen={translationOpen} onTranslationChange={changeTranslation} /></Suspense>{!assistantOpen && <Button className="reopen-assistant" variant="outline" size="icon" aria-label="AI 패널 열기" onClick={() => setAssistantOpen(true)}><PanelRightOpen /></Button>}</main>
      {assistantOpen && <PanelResizer side="assistant" width={panels.assistant} min={260} max={panels.assistantMax} onChange={(assistant) => setPreferredPanels((current) => ({ ...current, assistant }))} onDragging={setResizing} onReset={() => setPreferredPanels((current) => ({ ...current, assistant: defaultPanels.assistant }))} />}
      <AssistantPanel onProvider={chooseProvider} fast={fast} onFast={chooseFast} onModel={chooseModel} session={session} open={assistantOpen} paperId={activeId} provider={provider} model={model} onSettings={() => { setSettingsSection('ai'); setSettingsOpen(true) }} onClose={() => setAssistantOpen(false)} />
      {error && <div className="error-banner" role="alert"><span>{error}</span><Button variant="ghost" size="icon-sm" aria-label="오류 안내 닫기" onClick={() => setError('')}><X /></Button></div>}
      {restoreNotice && <div className="restore-complete" role="status"><span>백업 자료를 병합 복원했어. 기존 자료는 유지했어.</span><Button variant="ghost" size="icon-xs" aria-label="복원 안내 닫기" onClick={() => setRestoreNotice(false)}><X /></Button></div>}
      {removedPaper && <div className="library-undo" role="status"><span>{removedPaper.name}을 목록에서 제거했어.</span><Button variant="ghost" size="sm" onClick={() => void undoRemove()}>실행 취소</Button><Button variant="ghost" size="icon-xs" aria-label="제거 안내 닫기" onClick={() => setRemovedPaper(null)}><X /></Button></div>}
      <ZoteroLibrary open={zoteroOpen} onOpenChange={setZoteroOpen} onImport={acceptPapers} initialCollection={collection} onCatalog={acceptCatalog} />
      <HelpGuide open={guideOpen} onOpenChange={setGuideOpen} onExample={async () => acceptPapers(await window.paperglim.openExample())} onSettings={(section) => { setGuideOpen(false); setSettingsSection(section); setSettingsOpen(true) }} onZotero={() => { setGuideOpen(false); setZoteroOpen(true) }} />
      <ConnectionSettings initialSection={settingsSection} appScale={appScale} onAppScale={setAppScale} model={model} onModel={chooseModel} onZotero={() => { setSettingsOpen(false); setZoteroOpen(true) }} open={settingsOpen} onOpenChange={(open) => { setSettingsOpen(open); if (!open) window.dispatchEvent(new Event('paperglim:refresh-providers')) }} provider={provider} onProviderChange={chooseProvider} />
    </div></ReadingActions.Provider>
  )
}
