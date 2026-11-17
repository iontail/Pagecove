import { useEffect, useRef, useState } from 'react'
import RecoveryNotice from './RecoveryNotice'
import { Info, Loader2, RefreshCw, FileText, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { Paper, ZoteroCatalog } from '../../../shared/types'
import { collectionRows, inCollection } from '../../../shared/collections'

export default function ZoteroLibrary({ open, onOpenChange, onImport, initialCollection, onCatalog }: { open: boolean; onOpenChange: (open: boolean) => void; onImport: (papers: Paper[]) => Promise<void>; initialCollection: string; onCatalog: (catalog: ZoteroCatalog) => Promise<void> }) {
  const [catalog, setCatalog] = useState<ZoteroCatalog | null>(null)
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState('')
  const [error, setError] = useState('')
  const [help, setHelp] = useState(false)
  const [query, setQuery] = useState('')
  const [collection, setCollection] = useState('')
  const [summary, setSummary] = useState('')
  const syncing = useRef(false)

  async function refresh() {
    if (syncing.current) return
    syncing.current = true
    setLoading(true); setError('')
    try { const next = await window.paperglim.syncZotero(); setCatalog(next.catalog); setSummary(`${next.available}개 PDF 사용 가능${next.unavailable ? ` · ${next.unavailable}개 로컬 파일 확인 필요` : ''}`); await onCatalog(next.catalog) }
    catch (cause) { setError(cleanError(cause)); setHelp(true) }
    finally { syncing.current = false; setLoading(false) }
  }
  useEffect(() => { if (open) { setCollection(initialCollection); void refresh() } }, [open])

  async function importPaper(key: string) {
    setImporting(key); setError('')
    try { await onImport(await window.paperglim.importZotero(key)); onOpenChange(false) }
    catch (cause) { setError(cleanError(cause)) }
    finally { setImporting('') }
  }

  const papers = (catalog?.papers ?? []).filter((paper) => inCollection(paper.collections, collection, catalog?.collections ?? []) && `${paper.title} ${paper.authors} ${paper.year} ${paper.filename}`.toLowerCase().includes(query.toLowerCase()))
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="zotero-dialog"><DialogHeader><DialogTitle>Zotero 라이브러리</DialogTitle><DialogDescription>이 Mac의 개인 라이브러리에서 논문 PDF를 열어.</DialogDescription></DialogHeader>
    <div className="flex items-center gap-2"><span className="text-xs text-muted-foreground">{loading ? '로컬 PDF 동기화 중…' : summary || 'Zotero 연결'}</span><Button className="ml-auto" variant="ghost" size="icon-sm" aria-label="Zotero 연결 방법" onClick={() => setHelp((value) => !value)}><Info /></Button><Button variant="outline" size="sm" disabled={loading || !!importing} onClick={() => void refresh()}>{loading ? <Loader2 className="animate-spin" /> : <RefreshCw />}동기화</Button></div>
    {!!summary && <p className="settings-note">로컬 PDF는 컬렉션별로 앱에 등록됐어. 목록에서 바로 열 수 있어. 아직 없는 파일은 Zotero에서 다운로드한 뒤 다시 동기화해 줘.</p>}
    {help && <div className="zotero-guide"><strong>처음 연결할 때</strong><ol><li>Zotero 데스크톱 앱을 실행해.</li><li>Zotero 설정 → 고급에서 <b>“다른 애플리케이션과 통신 허용”</b>을 켜 줘. 영어로는 “Allow other applications on this computer to communicate with Zotero”야.</li><li>Zotero에서 읽을 PDF를 한 번 열어 로컬에 다운로드해.</li><li>이 창의 동기화를 눌러.</li></ol><p>API 키·추가 플러그인은 필요 없어. 이 연결은 목록과 PDF를 읽기만 하고 Zotero 항목을 수정하지 않아. 앱이 실행 중이어야 새 항목을 가져올 수 있어.</p><Button variant="ghost" size="sm" onClick={() => void window.paperglim.openZoteroHelp()}><ExternalLink />공식 연결 안내</Button></div>}
    <RecoveryNotice error={error} scope="zotero" disabled={loading || !!importing} onHelp={() => setHelp(true)} onRetry={() => void refresh()} />
    <div className="flex gap-2"><Input aria-label="Zotero 논문 검색" placeholder="제목, 저자, 연도 검색" value={query} onChange={(event) => setQuery(event.target.value)} /><select className="zotero-collection" aria-label="Zotero 컬렉션" value={collection} onChange={(event) => setCollection(event.target.value)}><option value="">모든 컬렉션</option>{collectionRows(catalog?.collections ?? []).map((entry) => <option key={entry.key} value={entry.key}>{entry.path}</option>)}</select></div>
    {collection && <p className="text-xs text-muted-foreground">하위 컬렉션의 논문도 함께 표시해.</p>}
    <div className="zotero-results">{loading ? <div className="pdf-loading"><Loader2 className="animate-spin" />라이브러리 불러오는 중</div> : papers.map((paper) => <button key={paper.key} className="zotero-paper" disabled={!!importing} onClick={() => void importPaper(paper.key)}>{importing === paper.key ? <Loader2 className="animate-spin" /> : <FileText />}<span><strong>{paper.title}</strong><small>{[paper.authors, paper.year, paper.filename].filter(Boolean).join(' · ')}</small></span><span className="text-xs">열기</span></button>)}{!loading && catalog && !papers.length && <p className="text-muted-foreground text-sm p-4">{catalog.papers.length ? '검색 조건에 맞는 PDF가 없어.' : 'PDF 첨부가 없어. Zotero에 논문 PDF를 추가해 줘.'}</p>}</div>
  </DialogContent></Dialog>
}

function cleanError(cause: unknown) { return (cause instanceof Error ? cause.message : String(cause)).replace(/^Error invoking remote method '[^']+': Error: /, '') }
