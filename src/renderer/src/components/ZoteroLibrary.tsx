import { useEffect, useState } from 'react'
import RecoveryNotice from './RecoveryNotice'
import { Info, Loader2, RefreshCw, FileText, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { Paper, ZoteroCatalog } from '../../../shared/types'
import { collectionRows, inCollection } from '../../../shared/collections'

export default function ZoteroLibrary({ open, onOpenChange, onImport, initialCollection, catalog, loading, summary, onSync }: { open: boolean; onOpenChange: (open: boolean) => void; onImport: (papers: Paper[]) => Promise<void>; initialCollection: string; catalog: ZoteroCatalog | null; loading: boolean; summary: string; onSync: () => Promise<void> }) {
  const [importing, setImporting] = useState('')
  const [error, setError] = useState('')
  const [help, setHelp] = useState(false)
  const [query, setQuery] = useState('')
  const [collection, setCollection] = useState('')
  async function refresh() {
    setError('')
    try { await onSync() }
    catch (cause) { setError(cleanError(cause)); setHelp(true) }
  }
  useEffect(() => { if (open) { setCollection(initialCollection); void refresh() } }, [open])

  async function importPaper(key: string) {
    setImporting(key); setError('')
    try { await onImport(await window.paperglim.importZotero(key)); onOpenChange(false) }
    catch (cause) { setError(cleanError(cause)) }
    finally { setImporting('') }
  }

  const papers = (catalog?.papers ?? []).filter((paper) => inCollection(paper.collections, collection, catalog?.collections ?? []) && `${paper.title} ${paper.authors} ${paper.year} ${paper.filename}`.toLowerCase().includes(query.toLowerCase()))
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="zotero-dialog"><DialogHeader><DialogTitle>Zotero 라이브러리</DialogTitle><DialogDescription>Zotero 개인 라이브러리에서 PDF를 가져오세요.</DialogDescription></DialogHeader>
    <div className="flex items-center gap-2"><span className="text-xs text-muted-foreground">{loading ? '로컬 PDF 동기화 중…' : summary || 'Zotero 연결'}</span><Button className="ml-auto" variant="ghost" size="icon-sm" aria-label="Zotero 연결 방법" onClick={() => setHelp((value) => !value)}><Info /></Button><Button variant="outline" size="sm" disabled={loading || !!importing} onClick={() => void refresh()}>{loading ? <Loader2 className="animate-spin" /> : <RefreshCw />}동기화</Button></div>
    {!!summary && <p className="settings-note">이 Mac에 있는 PDF를 컬렉션별로 가져왔어요. 목록에 없는 파일은 Zotero에서 내려받은 뒤 다시 동기화해 주세요.</p>}
    {help && <div className="zotero-guide"><strong>처음 연결할 때</strong><ol><li>Zotero 데스크톱 앱을 실행하세요.</li><li>Zotero 설정 → 고급에서 <b>“다른 애플리케이션과 통신 허용”</b>을 켜 주세요. 영어 메뉴에서는 “Allow other applications on this computer to communicate with Zotero”로 표시돼요.</li><li>Zotero에서 읽을 PDF를 열어 Mac에 내려받으세요.</li><li>이 창에서 ‘동기화’를 누르세요.</li></ol><p>API 키나 플러그인 없이 연결할 수 있어요. 새 항목을 가져오는 동안 Zotero를 열어 두세요.</p><Button variant="ghost" size="sm" onClick={() => void window.paperglim.openZoteroHelp()}><ExternalLink />공식 연결 안내</Button></div>}
    <RecoveryNotice error={error} scope="zotero" disabled={loading || !!importing} onHelp={() => setHelp(true)} onRetry={() => void refresh()} />
    <div className="flex gap-2"><Input aria-label="Zotero 논문 검색" placeholder="제목, 저자, 연도 검색" value={query} onChange={(event) => setQuery(event.target.value)} /><select className="zotero-collection" aria-label="Zotero 컬렉션" value={collection} onChange={(event) => setCollection(event.target.value)}><option value="">모든 컬렉션</option>{collectionRows(catalog?.collections ?? []).map((entry) => <option key={entry.key} value={entry.key}>{entry.path}</option>)}</select></div>
    {collection && <p className="text-xs text-muted-foreground">하위 컬렉션의 논문도 함께 표시돼요.</p>}
    <div className="zotero-results">{loading ? <div className="pdf-loading"><Loader2 className="animate-spin" />라이브러리 불러오는 중</div> : papers.map((paper) => <button key={paper.key} className="zotero-paper" disabled={!!importing} onClick={() => void importPaper(paper.key)}>{importing === paper.key ? <Loader2 className="animate-spin" /> : <FileText />}<span><strong>{paper.title}</strong><small>{[paper.authors, paper.year, paper.filename].filter(Boolean).join(' · ')}</small></span><span className="text-xs">열기</span></button>)}{!loading && catalog && !papers.length && <p className="text-muted-foreground text-sm p-4">{catalog.papers.length ? '검색 조건에 맞는 PDF가 없어요.' : '첨부된 PDF가 없어요. Zotero에서 논문에 PDF를 추가해 주세요.'}</p>}</div>
  </DialogContent></Dialog>
}

function cleanError(cause: unknown) { return (cause instanceof Error ? cause.message : String(cause)).replace(/^Error invoking remote method '[^']+': Error: /, '') }
