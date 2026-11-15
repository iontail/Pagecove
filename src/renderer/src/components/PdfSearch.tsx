import { useEffect, useState } from 'react'
import { ArrowDown, ArrowUp, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { searchPages } from '../../../shared/pdf-search'
import type { SearchMatch } from '../../../shared/pdf-search'
import type { SourceLocation } from '../../../shared/reading'
import type { PaperSession } from '@/lib/paper-session'

export default function PdfSearch({ session, onLocate, onClose }: { session: PaperSession; onLocate: (location: Omit<SourceLocation, 'token'> | null) => void; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [matches, setMatches] = useState<SearchMatch[]>([])
  const [index, setIndex] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    let current = true
    setMatches([]); setIndex(0); setError(''); onLocate(null)
    if (!query.trim()) { setBusy(false); return }
    setBusy(true)
    const timer = setTimeout(() => {
      void session.prepare().then((paper) => {
        if (!current) return
        const result = searchPages(paper.pages, query)
        setMatches(result); onLocate(result[0]?.location ?? null)
      }).catch((error) => { if (current) setError(error instanceof Error ? error.message : '본문을 검색하지 못했어.') }).finally(() => { if (current) setBusy(false) })
    }, 180)
    return () => { current = false; clearTimeout(timer) }
  }, [session, query, onLocate])
  function move(step: number) {
    if (!matches.length) return
    const next = (index + step + matches.length) % matches.length
    setIndex(next); onLocate(matches[next].location)
  }
  return <form className="pdf-search" role="search" aria-label="PDF 본문 검색" onSubmit={(event) => { event.preventDefault(); move(1) }} onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose() } }}>
    <div className="pdf-search-controls"><Input autoFocus aria-label="본문 검색어" placeholder="논문 본문에서 찾기" maxLength={300} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); move(event.shiftKey ? -1 : 1) } }} /><span className="pdf-search-count" role="status">{busy ? '찾는 중…' : query.trim() ? `${matches.length ? index + 1 : 0} / ${matches.length}` : ''}</span><Button variant="ghost" size="icon-sm" disabled={!matches.length} aria-label="이전 검색 결과" title="이전 결과 (Shift+Enter)" type="button" onClick={() => move(-1)}><ArrowUp /></Button><Button variant="ghost" size="icon-sm" disabled={!matches.length} aria-label="다음 검색 결과" title="다음 결과 (Enter)" type="button" onClick={() => move(1)}><ArrowDown /></Button><Button variant="ghost" size="icon-sm" aria-label="본문 검색 닫기" type="button" onClick={onClose}><X /></Button></div>
    {error ? <p role="alert">{error}</p> : matches[index] ? <p className="pdf-search-preview">p. {matches[index].page} · {matches[index].snippet}</p> : !busy && query.trim() ? <p role="status">일치하는 본문이 없어.</p> : null}
  </form>
}
