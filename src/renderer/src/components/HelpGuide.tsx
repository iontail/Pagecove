import { useState } from 'react'
import type { ReactNode } from 'react'
import { Bookmark, BookOpen, FolderOpen, Languages, Loader2, MessageSquare, ScanLine, Search, Settings2, Sigma } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Tabs } from 'radix-ui'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

function Topic({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: ReactNode }) {
  return <section className="guide-topic"><Icon aria-hidden="true" /><div><h3>{title}</h3>{children}</div></section>
}

export default function HelpGuide({ open, onOpenChange, onExample, onSettings, onZotero }: {
  open: boolean; onOpenChange: (open: boolean) => void; onExample: () => Promise<void>; onSettings: (section: string) => void; onZotero: () => void
}) {
  const [tab, setTab] = useState('start')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function example() {
    setBusy(true); setError('')
    try { await onExample(); onOpenChange(false) }
    catch { setError('예제 PDF를 열지 못했어요. 가이드를 닫고 다른 PDF를 열어 보세요.') }
    finally { setBusy(false) }
  }
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="guide-dialog" onCloseAutoFocus={(event) => { event.preventDefault(); if (!document.querySelector('[role="dialog"][data-state="open"]')) document.querySelector<HTMLButtonElement>('[aria-label="사용 가이드 열기"]')?.focus() }}><DialogHeader><DialogTitle>Pagecove 사용 가이드</DialogTitle><DialogDescription>PDF 열기부터 번역, 질문, 저장까지</DialogDescription></DialogHeader>
    <Tabs.Root value={tab} onValueChange={setTab} className="guide-tabs-root">
      <Tabs.List className="settings-tabs" aria-label="사용 가이드 주제"><Tabs.Trigger value="start">시작하기</Tabs.Trigger><Tabs.Trigger value="reading">읽기·번역</Tabs.Trigger><Tabs.Trigger value="study">AI 학습</Tabs.Trigger><Tabs.Trigger value="manage">연결·관리</Tabs.Trigger></Tabs.List>
      <Tabs.Content value="start" className="guide-body">
        <h2>처음 시작하기</h2>
        <ol className="guide-start-steps">
          <li><strong>PDF 열기</strong><p>파일을 창에 끌어다 놓거나 <kbd>⌘O</kbd>로 여세요. 아래 버튼으로 ResNet 예제를 열 수도 있어요.</p></li>
          <li><strong>번역·질문에 사용할 AI 연결</strong><p>터미널에서 Codex 또는 Claude Code에 로그인한 뒤, 설정의 ‘AI 연결’에서 설치 상태를 확인하세요. PDF는 AI 연결 없이도 읽을 수 있어요.</p></li>
          <li><strong>논문에 질문하기</strong><p>문장을 선택해 설명이나 수식 풀이를 요청하세요. 논문 전체에 대해 궁금한 점은 오른쪽 AI 패널에 입력하세요.</p></li>
        </ol>
        <div className="guide-actions"><Button disabled={busy} onClick={() => void example()}>{busy ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <BookOpen data-icon="inline-start" />}ResNet 예제로 시작</Button><Button variant="outline" disabled={busy} onClick={() => onSettings('ai')}><Settings2 data-icon="inline-start" />AI 연결 설정</Button></div>
        {error && <p className="guide-note" role="alert">{error}</p>}
      </Tabs.Content>
      <Tabs.Content value="reading" className="guide-body">
        <Topic icon={Languages} title="원문 바로 옆에서 번역 읽기"><p>페이지 오른쪽 위의 ‘한글번역’을 누르면 원문 옆에 번역이 열려요. 첫 페이지에서 ‘모두 번역’을 누르면 논문 전체를 순서대로 번역해요.</p><p>번역 문장에 마우스를 올리면 해당 원문이 함께 강조돼요. 두 칸 사이를 드래그해 번역 칸의 너비를 조절하세요.</p></Topic>
        <Topic icon={BookOpen} title="스크롤과 확대·축소"><p>스크롤하면 다음 페이지가 이어져요. <kbd>⌘+</kbd>·<kbd>⌘−</kbd> 또는 <kbd>⌘</kbd>+휠로 PDF를 확대·축소하세요. <kbd>⌘0</kbd>은 기본 배율로 돌아가는 단축키예요.</p><p>앱의 글자와 아이콘 크기는 설정의 ‘화면·읽기’에서 조절하세요.</p></Topic>
        <Topic icon={Search} title="본문 검색과 목차"><p><kbd>⌘F</kbd>로 본문을 검색하세요. PDF에 목차가 있다면 상단 목차 아이콘에서 원하는 절로 이동할 수 있어요. <kbd>⌘[</kbd>로 읽던 위치로 돌아가세요.</p></Topic>
      </Tabs.Content>
      <Tabs.Content value="study" className="guide-body">
        <Topic icon={MessageSquare} title="논문 전체 질문과 요약"><p>논문을 열면 오른쪽 AI 패널에 질문을 입력할 수 있어요. ‘논문 요약’에서는 주요 비교 대상과 기반 연구도 함께 정리해요. 답변 아래 ‘근거 보기’에서 페이지를 누르면 원문으로 이동해요.</p></Topic>
        <Topic icon={Sigma} title="문장·수식을 선택해 풀어보기"><p>텍스트를 드래그하면 선택 도구가 열려요. ‘설명’으로 문장의 뜻을 확인하거나, ‘수식·개념 풀이’로 기호와 풀이 과정을 살펴보세요. 같은 창에서 이어서 질문할 수 있어요.</p></Topic>
        <Topic icon={ScanLine} title="그림·표를 영역으로 선택하기"><p>페이지 왼쪽 위의 영역 선택 아이콘을 누르세요. 축, 범례, 그림 설명까지 포함해 드래그한 뒤 ‘그림·표 해설’을 누르세요. 키보드로는 방향키로 이동하고, Shift+방향키로 크기를 조절한 뒤 Enter로 선택해요.</p></Topic>
        <Topic icon={Bookmark} title="다시 볼 부분만 남기기"><p>선택 영역에서 ‘다시 보기’를 누르면 표시가 저장돼요. 문서 상단의 ‘저장된 설명’에서 다시 볼 부분만 모아 보세요. 원문의 표시 위에 마우스를 올려 저장한 설명을 다시 열 수도 있어요.</p></Topic>
        <p className="guide-note">오른쪽 패널의 대화는 임시예요. 선택한 부분의 설명과 다시 보기 표시는 앱을 다시 열어도 남아요. AI 답변은 원문과 함께 확인해 주세요.</p>
      </Tabs.Content>
      <Tabs.Content value="manage" className="guide-body">
        <Topic icon={FolderOpen} title="Zotero의 논문과 컬렉션 가져오기"><p>Zotero를 실행하고 고급 설정에서 다른 앱과의 통신을 허용하세요. 왼쪽 사이드바의 Zotero 옆 ‘동기화’를 누르면 이 Mac에 내려받은 새 PDF가 컬렉션별로 들어와요. 자세한 연결 방법은 Zotero 창의 정보 아이콘에서 확인하세요.</p><Button variant="outline" size="sm" onClick={onZotero}>Zotero 연결 창 열기</Button></Topic>
        <Topic icon={Settings2} title="모델과 연결 상태 확인하기"><p>채팅 입력창 아래에서 Codex나 Claude Code를 고른 뒤 모델을 선택하세요. 지원되는 Codex 모델은 Fast를 켤 수 있어요. 설치, 로그인, 모델에 문제가 생기면 ‘AI 연결’ 설정을 확인하세요.</p><p>그림·표 해설에는 이미지 입력을 지원하는 CLI와 모델이 필요해요. 스캔 PDF의 문자 인식(OCR)은 아직 지원하지 않아요.</p></Topic>
        <Topic icon={Bookmark} title="저장한 자료 백업하기"><p>설정의 ‘데이터·앱 정보’에서 논문 목록, 읽던 위치, 설명과 다시 보기 표시를 백업하거나 복원하세요. 저장한 번역도 백업에 포함할 수 있어요.</p><p>백업에는 원본 PDF와 임시 대화가 들어가지 않아요. PDF는 따로 보관해 주세요.</p><Button variant="outline" size="sm" onClick={() => onSettings('about')}>백업·복원 설정 열기</Button></Topic>
      </Tabs.Content>
    </Tabs.Root>
    <footer className="guide-footer"><span>상단 도움말 아이콘이나 ‘도움말’ 메뉴에서 다시 열 수 있어요.</span><Button variant="outline" onClick={() => onOpenChange(false)}>가이드 닫기</Button></footer>
  </DialogContent></Dialog>
}
