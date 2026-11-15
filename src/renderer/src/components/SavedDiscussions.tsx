import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { SelectionThread } from '../../../shared/paper-harness'

export default function SavedDiscussions({ threads, onOpen, onClose }: { threads: SelectionThread[]; onOpen: (thread: SelectionThread) => void; onClose: () => void }) {
  return <aside className="saved-discussions" aria-label="저장된 설명 목록" onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); onClose() } }}>
    <header><strong>저장된 설명 <span>{threads.length}</span></strong><Button variant="ghost" size="icon-sm" aria-label="저장된 설명 목록 닫기" onClick={onClose}><X /></Button></header>
    {threads.length ? <div className="saved-discussions-list">{[...threads].sort((a, b) => a.page - b.page || b.updatedAt.localeCompare(a.updatedAt)).map((thread) => <button key={thread.id} className="saved-discussion-row" onClick={() => onOpen(thread)}><span className="saved-discussion-page">p. {thread.page}</span><span className="saved-discussion-text">{thread.text}</span><small>질문 {thread.messages.filter((message) => message.role === 'user').length}개</small></button>)}</div> : <p>저장된 설명이 없어. PDF 문장을 선택해 설명을 요청하면 여기에 모여.</p>}
  </aside>
}
