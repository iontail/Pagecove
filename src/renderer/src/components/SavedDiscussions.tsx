import { useState } from 'react'
import { Bookmark, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { SelectionThread } from '../../../shared/paper-harness'

export default function SavedDiscussions({ threads, onOpen, onClose }: { threads: SelectionThread[]; onOpen: (thread: SelectionThread) => void; onClose: () => void }) {
  const [reviewOnly, setReviewOnly] = useState(false)
  const visible = threads.filter((thread) => !reviewOnly || thread.review)
  return <aside className="saved-discussions" aria-label="저장된 설명 목록" onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); onClose() } }}>
    <header><strong>저장된 설명·다시 보기 <span>{threads.length}</span></strong><div><Button variant="ghost" size="xs" aria-pressed={!reviewOnly} onClick={() => setReviewOnly(false)}>전체</Button><Button variant="ghost" size="xs" aria-pressed={reviewOnly} onClick={() => setReviewOnly(true)}><Bookmark data-icon="inline-start" />다시 보기 {threads.filter((thread) => thread.review).length}</Button><Button variant="ghost" size="icon-sm" aria-label="저장된 설명 목록 닫기" onClick={onClose}><X /></Button></div></header>
    {visible.length ? <div className="saved-discussions-list">{[...visible].sort((a, b) => a.page - b.page || b.updatedAt.localeCompare(a.updatedAt)).map((thread) => <button key={thread.id} className="saved-discussion-row" onClick={() => onOpen(thread)}><span className="saved-discussion-page">p. {thread.page}</span><span className="saved-discussion-text">{thread.review && <Bookmark size={12} aria-label="다시 보기" />}{thread.text}</span><small>{thread.messages.length ? `질문 ${thread.messages.filter((message) => message.role === 'user').length}개` : '표시만'}</small></button>)}</div> : <p>{reviewOnly ? '다시 볼 부분이 없어. 선택 영역에서 ‘다시 보기’를 누르면 여기에 모여.' : '저장된 설명이 없어. 문장이나 그림·표를 선택해 설명을 요청하거나 다시 볼 부분을 표시해.'}</p>}
  </aside>
}
