import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDownWideNarrow, ArrowRight, Check, ChevronDown, ChevronRight, FileText, Folder, FolderOpen, LayoutGrid, Library, List, Loader2, Plus, Upload, Search, X } from 'lucide-react'
import { DropdownMenu, ToggleGroup } from 'radix-ui'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { paperPreview } from '@/lib/paper-preview'
import { collectionRows, inCollection } from '../../../shared/collections'
import type { Paper, ZoteroCollection } from '../../../shared/types'

function PaperCover({ paper }: { paper: Paper }) {
  const element = useRef<HTMLDivElement>(null)
  const [image, setImage] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    let active = true
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return
      observer.disconnect()
      void paperPreview(paper.id, () => active).then((result) => {
        if (active) { setImage(result); setLoaded(true) }
      })
    }, { rootMargin: '100px' })
    if (element.current) observer.observe(element.current)
    return () => { active = false; observer.disconnect() }
  }, [paper.id])
  return <div ref={element} className="shelf-cover" data-loaded={loaded}>
    {image ? <img src={image} alt="" draggable={false} /> : <div className="cover-fallback"><FileText size={28} strokeWidth={1.1} /><span>{loaded ? 'PDF 미리보기 없음' : 'PDF'}</span></div>}
  </div>
}

const sorts = { recent: '최근 읽은 순', added: '추가한 순', title: '제목순' } as const
type Sort = keyof typeof sorts

export default function LibraryShelf({ dragging, papers, library, collections, collection, onCollection, title, query, onQuery, onSelect, onOpen, opening, onClearCollection }: {
  dragging: boolean; papers: Paper[]; library: Paper[]; collections: ZoteroCollection[]; collection: string; onCollection: (key: string) => void
  title: string; query: string; onQuery: (query: string) => void
  onSelect: (id: string) => void; onOpen: () => void; opening: boolean; onClearCollection?: () => void
}) {
  const [view, setView] = useState(() => localStorage.getItem('paperglim:shelf-view') === 'list' ? 'list' : 'grid')
  const [sort, setSort] = useState<Sort>(() => {
    const saved = localStorage.getItem('paperglim:shelf-sort')
    return saved && Object.hasOwn(sorts, saved) ? saved as Sort : 'recent'
  })
  const ordered = useMemo(() => papers.toSorted((a, b) => sort === 'title' ? a.name.localeCompare(b.name, 'ko') : sort === 'added' ? b.addedAt.localeCompare(a.addedAt) : b.lastOpenedAt.localeCompare(a.lastOpenedAt) || b.addedAt.localeCompare(a.addedAt)), [papers, sort])
  const recent = !query && sort === 'recent' ? ordered.filter((paper) => paper.lastOpenedAt).slice(0, 3) : []
  const folders = useMemo(() => collections.filter((folder) => folder.parentKey === (collection || null)).map((folder) => ({ ...folder, papers: library.filter((paper) => inCollection(paper.collectionKeys ?? [], folder.key, collections)) })), [collections, collection, library])
  return <section className="library-shelf" aria-label="논문 서재">
    <header className="shelf-header"><div className="shelf-breadcrumb">{collections.length ? <DropdownMenu.Root><DropdownMenu.Trigger asChild><Button variant="ghost" size="sm" aria-label="서재 컬렉션 선택"><Library size={16} /><span>라이브러리</span><ChevronDown size={12} /></Button></DropdownMenu.Trigger><DropdownMenu.Portal><DropdownMenu.Content className="shelf-sort-menu shelf-folder-menu" align="start" sideOffset={8}><DropdownMenu.Item onSelect={() => onCollection('')}><Library size={14} /><span>내 서재</span><small>{library.length}</small></DropdownMenu.Item>{collectionRows(collections).map((folder) => <DropdownMenu.Item key={folder.key} aria-label={folder.path} style={{ paddingLeft: 9 + folder.depth * 12 }} onSelect={() => onCollection(folder.key)}><Folder size={14} /><span>{folder.name}</span><small>{library.filter((paper) => inCollection(paper.collectionKeys ?? [], folder.key, collections)).length}</small></DropdownMenu.Item>)}</DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root> : <><Library size={16} /><span>라이브러리</span></>}{collection && <><ChevronRight size={13} /><span title={title}>{title}</span></>}</div><Button variant="outline" size="sm" disabled={opening} onClick={onOpen}><Plus size={15} />PDF 추가</Button></header>
    <div className="shelf-content">
      <div className="shelf-heading"><div><h1>{title}</h1><p>{query ? `${papers.length}편의 검색 결과` : `${papers.length}편의 논문`}</p></div><div className="shelf-view-tools">
        <DropdownMenu.Root><DropdownMenu.Trigger asChild><Button variant="ghost" size="sm" className="shelf-sort" aria-label="논문 정렬"><ArrowDownWideNarrow size={14} /><span>{sorts[sort]}</span><ChevronDown size={12} /></Button></DropdownMenu.Trigger><DropdownMenu.Portal><DropdownMenu.Content className="shelf-sort-menu" align="end" sideOffset={6}><DropdownMenu.RadioGroup value={sort} onValueChange={(value) => { setSort(value as Sort); localStorage.setItem('paperglim:shelf-sort', value) }}>{Object.entries(sorts).map(([value, label]) => <DropdownMenu.RadioItem key={value} value={value}><span>{label}</span><DropdownMenu.ItemIndicator><Check size={14} /></DropdownMenu.ItemIndicator></DropdownMenu.RadioItem>)}</DropdownMenu.RadioGroup></DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root>
        <ToggleGroup.Root className="shelf-view-toggle" data-view={view} type="single" value={view} onValueChange={(value) => { if (value) { setView(value); localStorage.setItem('paperglim:shelf-view', value) } }} aria-label="서재 보기 방식"><ToggleGroup.Item value="grid" aria-label="표지로 보기" title="표지로 보기"><LayoutGrid size={15} /></ToggleGroup.Item><ToggleGroup.Item value="list" aria-label="목록으로 보기" title="목록으로 보기"><List size={16} /></ToggleGroup.Item></ToggleGroup.Root>
      </div></div>
      <section className="shelf-upload" aria-label="PDF 추가 영역" data-dragging={dragging} aria-busy={opening}>
        <span className="upload-document" aria-hidden="true"><FileText size={28} strokeWidth={1.2} /><Upload size={14} /></span>
        <div><h2>{dragging ? '여기에 PDF를 놓으세요' : '서재에 PDF 추가'}</h2><p>PDF를 이곳에 끌어다 놓거나 파일을 선택하세요.</p></div>
        <Button className="shelf-upload-button" variant="default" size="sm" disabled={opening} onClick={onOpen}>{opening ? <Loader2 className="animate-spin" /> : <Plus />}<span>{opening ? '추가 중…' : 'PDF 선택'}</span></Button>
      </section>
      <div className="shelf-toolbar"><div className="shelf-search"><Search size={15} /><Input aria-label="서재에서 검색" placeholder="논문 제목 검색" value={query} onChange={(event) => onQuery(event.target.value)} />{query && <Button variant="ghost" size="icon-xs" aria-label="서재 검색 지우기" onClick={() => onQuery('')}><X /></Button>}</div>{onClearCollection && <button className="shelf-clear-collection" onClick={onClearCollection}>모든 논문 보기<ArrowRight size={13} /></button>}</div>
      {!!folders.length && !query && <section className="shelf-collections" aria-label="서재 컬렉션"><div className="shelf-section-heading"><h2>컬렉션</h2>{folders.length > 4 && <DropdownMenu.Root><DropdownMenu.Trigger asChild><Button variant="ghost" size="xs">컬렉션 전체 보기<ChevronDown size={12} /></Button></DropdownMenu.Trigger><DropdownMenu.Portal><DropdownMenu.Content className="shelf-sort-menu shelf-folder-menu" align="end" sideOffset={6}>{folders.map((folder) => <DropdownMenu.Item key={folder.key} onSelect={() => onCollection(folder.key)}><Folder size={14} /><span>{folder.name}</span><small>{folder.papers.length}</small></DropdownMenu.Item>)}</DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root>}</div><div className="shelf-folders">{folders.slice(0, 4).map((folder) => <button key={folder.key} className="shelf-folder" onClick={() => onCollection(folder.key)} title={folder.name}><div className="collection-fan" aria-hidden="true">{folder.papers.length ? folder.papers.slice(0, 3).map((paper) => <PaperCover key={paper.id} paper={paper} />) : <Folder size={27} strokeWidth={1.2} />}</div><span><strong>{folder.name}</strong><small>{folder.papers.length}편</small></span><ChevronRight size={13} /></button>)}</div></section>}
      {!!recent.length && <section className="shelf-recent" aria-label="이어서 읽기"><div className="shelf-section-heading"><h2>이어서 읽기</h2></div><div className="recent-documents">{recent.map((paper) => <button key={paper.id} className="recent-document" onClick={() => onSelect(paper.id)} title={paper.name}><PaperCover paper={paper} /><span><strong>{paper.name}</strong><small>{paper.page}쪽에서 이어 읽기<ArrowRight size={12} /></small></span></button>)}</div></section>}
      {!!ordered.length && <div className="shelf-section-heading shelf-documents-heading"><h2>{query ? '검색한 논문' : collection ? '컬렉션의 논문' : '모든 논문'}</h2><span>{ordered.length}</span></div>}
      {ordered.length ? <div className={`shelf-papers shelf-${view}`}>{ordered.map((paper) => {
        const folder = collections.find((entry) => paper.collectionKeys?.includes(entry.key))
        return <button key={paper.id} className="shelf-paper" onClick={() => onSelect(paper.id)} aria-label={`${paper.name} 읽기`} title={paper.name}><PaperCover paper={paper} /><div className="shelf-paper-info"><div className="paper-source"><FileText size={11} /><span>{paper.source === 'zotero' ? 'Zotero PDF' : '로컬 PDF'}</span></div><h2>{paper.name}</h2><p><span title={folder?.name}>{folder ? <><Folder size={11} />{folder.name}</> : '내 파일'}</span><span>{paper.lastOpenedAt ? `${paper.page}쪽` : '읽기 전'}</span></p></div><ArrowRight className="shelf-row-arrow" size={17} /></button>
      })}</div> : <div className="shelf-empty"><FolderOpen size={40} strokeWidth={1.1} /><h2>{query ? '검색 결과 없음' : collection ? '이 컬렉션에 논문이 없어요' : '서재가 비어 있어요'}</h2><p>{query ? '다른 검색어를 입력해 보세요.' : collection ? '왼쪽의 Zotero에서 이 컬렉션의 PDF를 가져오세요.' : 'PDF를 추가하거나 Zotero에서 논문을 가져오세요.'}</p>{query && <Button variant="outline" onClick={() => onQuery('')}>검색 지우기</Button>}<span className="shortcut-hint">단축키 ⌘O</span></div>}
      <footer className="shelf-footer"><span>PDF는 서재에 등록돼요.</span><span>원본 파일은 제자리에 남아요.</span></footer>
    </div>
  </section>
}
