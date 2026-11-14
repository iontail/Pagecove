import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { RefObject } from 'react'
import { Page } from 'react-pdf'
import { Loader2 } from 'lucide-react'
import TranslationPanel from './TranslationPanel'
import PanelResizer from './PanelResizer'
import { sourceMarkup } from '../../../shared/reading'
import type { PageContext, SourceLocation } from '../../../shared/reading'
import InlineDiscussion from './InlineDiscussion'
import { selectedAnchor } from '@/lib/selection'
import type { PaperSession } from '@/lib/paper-session'
import type { TranslationSession } from '@/lib/translation-session'
import type { SelectionAnchor, SelectionThread } from '../../../shared/paper-harness'
import type { Passage } from './PdfReader'

const renderSource = ({ str, itemIndex }: { str: string; itemIndex: number }) => sourceMarkup(str, itemIndex)

export default function PdfPageSpread({ fast, session, selection, selectionPinned, onAnchor, threads, onSaveThread, onRemoveThread, store, spreadWidth, paperId, page, width, renderWidth, translation, onTranslationWidth, onTranslationDragging, onTranslationReset, defaultAspect, parallel, root, provider, model, onReady, onSelect, onExpand, onCollapse }: {
  fast: boolean; session: PaperSession; store: TranslationSession; spreadWidth: number; selection: SelectionAnchor | null; selectionPinned: boolean
  onAnchor: (anchor: SelectionAnchor | null, pinned: boolean, expectedId?: string) => void; threads: SelectionThread[]; onSaveThread: (thread: SelectionThread) => Promise<void>; onRemoveThread: (id: string) => Promise<void>
  paperId: string; page: number; width: number; renderWidth: number; defaultAspect: number; parallel: boolean
  translation: { translation: number; min: number; max: number }
  onTranslationWidth: (width: number) => void; onTranslationDragging: (active: boolean) => void; onTranslationReset: () => void
  root: RefObject<HTMLDivElement | null>; provider: string; model: string
  onReady: (context: PageContext) => void; onSelect: (passage: Passage) => void
  onExpand: () => void; onCollapse: () => void
}) {
  const [near, setNear] = useState(false)
  const [aspect, setAspect] = useState<number | null>(null)
  const [context, setContext] = useState<PageContext | null>(null)
  const [location, setLocation] = useState<SourceLocation | null>(null)
  const [error, setError] = useState('')
  const row = useRef<HTMLElement>(null)
  const source = useRef<HTMLDivElement>(null)
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useSyncExternalStore(store.subscribe, store.snapshot)
  const opened = parallel && store.visible.has(page)
  useEffect(() => { let current = true; if (near || opened) void session.page(page).then((next) => { if (current) { setContext(next); onReady(next) } }).catch((cause) => { if (current) setError(cause.message) }); return () => { current = false } }, [session, page, near, opened, onReady])
  useEffect(() => () => { if (hoverTimer.current) clearTimeout(hoverTimer.current) }, [])
  const height = Math.floor(width * (aspect ?? defaultAspect))

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setNear(entry.isIntersecting), { root: root.current, rootMargin: '700px 0px' })
    if (row.current) observer.observe(row.current)
    return () => observer.disconnect()
  }, [root])

  const highlight = useCallback(() => {
    source.current?.querySelectorAll('[data-text-index]').forEach((element) => {
      const text = element.textContent ?? ''
      element.replaceChildren(document.createTextNode(text))
      element.classList.remove('source-highlight')
      const index = Number(element.getAttribute('data-text-index'))
      if (!location?.itemIndexes.includes(index)) return
      const ranges = location.ranges?.filter((range) => range.itemIndex === index)
      if (!ranges?.length) { element.classList.add('source-highlight'); return }
      const fragment = document.createDocumentFragment()
      let cursor = 0
      for (const range of ranges.toSorted((a, b) => a.start - b.start)) {
        const start = Math.max(cursor, Math.min(text.length, range.start))
        const end = Math.max(start, Math.min(text.length, range.end))
        fragment.append(document.createTextNode(text.slice(cursor, start)))
        const mark = document.createElement('mark')
        mark.className = 'source-highlight'
        mark.textContent = text.slice(start, end)
        fragment.append(mark)
        cursor = end
      }
      fragment.append(document.createTextNode(text.slice(cursor)))
      element.replaceChildren(fragment)
    })
  }, [location])

  useEffect(highlight, [highlight])

  function hold() { if (hoverTimer.current) clearTimeout(hoverTimer.current) }
  function leave() { if (selection && !selectionPinned) { hold(); hoverTimer.current = setTimeout(() => onAnchor(null, false, selection.id), 250) } }
  function closeSelection() { hold(); onAnchor(null, false); window.getSelection()?.removeAllRanges() }
  function select() {
    if (!source.current) return
    const anchor = selectedAnchor(source.current, page)
    if (anchor) { hold(); onAnchor(anchor, true); onSelect({ text: anchor.text, page }) }
    else if (selection) closeSelection()
  }
  function hover(event: React.MouseEvent<HTMLDivElement>) {
    if (selectionPinned || event.buttons || !source.current) return
    const box = source.current.getBoundingClientRect(), x = (event.clientX - box.left) / box.width, y = (event.clientY - box.top) / box.height
    const thread = threads.find((thread) => thread.rects.some((rect) => x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height))
    if (thread) { hold(); if (thread.id !== selection?.id) onAnchor(thread, false) }
    else if (selection) leave()
  }
  function translatePage() { onExpand(); store.open(page); if (context) void store.translate(context) }

  return <article ref={row} className="reading-spread" style={{ width: spreadWidth }} data-reading-page={page} aria-label={`${page}페이지 읽기`}>
    <span className="page-edge-label">{page}</span>
    <div className="page-translation-actions" style={{ width }}>
      {!opened && <button className="translation-launch" disabled={!context} onClick={translatePage}>한글번역</button>}
      {page === 1 && <button className="translation-launch translate-all" disabled={!context || store.all.running} onClick={() => { onExpand(); void store.translateAll() }}>모두 번역</button>}
      {page === 1 && store.all.running && <button className="translation-stop" disabled={store.stopping} onClick={() => store.stop()}>{store.stopping ? '중지 중…' : '중지'}</button>}
    </div>
    <div className="pdf-page-wrap" ref={source} style={{ width, height }} onMouseUp={select} onMouseMove={hover} onMouseLeave={leave}>
      {error ? <div className="page-placeholder" role="alert">{error}</div> : near ? <div className="pdf-render" style={{ width: renderWidth, transform: width === renderWidth ? undefined : `scale(${width / renderWidth})` }}><Page pageNumber={page} suspense={false} width={renderWidth} renderAnnotationLayer={false}
        onLoadSuccess={(pdfPage) => {
          const viewport = pdfPage.getViewport({ scale: 1 }); setAspect(viewport.height / viewport.width)

        }}
        customTextRenderer={renderSource}
        onRenderTextLayerSuccess={highlight}
        loading={<div className="page-placeholder"><Loader2 className="animate-spin" /></div>}
        onLoadError={(cause) => setError(cause.message)} onRenderError={(cause) => setError(cause.message)} /></div> : <div className="page-placeholder" />}
      <div className="annotation-layer" aria-hidden="true">{threads.map((thread) => thread.rects.map((rect, index) => <span key={`${thread.id}:${index}`} className="annotation-mark" data-annotation-id={thread.id} style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.width * 100}%`, height: `${rect.height * 100}%` }} />))}</div>
    </div>
    {opened && <aside id={`translation-${page}`} className="translation-page-wrap" style={{ width: translation.translation, height }} aria-label={`${page}페이지 번역 영역`}>
      <PanelResizer side="translation" controls={`translation-${page}`} width={translation.translation} min={translation.min} max={translation.max} onChange={onTranslationWidth} onDragging={onTranslationDragging} onReset={onTranslationReset} />
      <TranslationPanel context={context} page={page} store={store} open={opened} onLocate={setLocation} onClose={() => { store.close(page); onCollapse() }} />
    </aside>}
    {selection && <InlineDiscussion fast={fast} key={selection.id} anchor={selection} thread={threads.find((thread) => thread.id === selection.id)} source={source} session={session} provider={provider} model={model} onSave={onSaveThread} onRemove={onRemoveThread} onClose={closeSelection} onPin={() => onAnchor(selection, true)} onHold={hold} onLeave={leave} />}
  </article>
}
