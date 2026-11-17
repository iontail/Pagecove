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
    catch { setError('예제 PDF를 열지 못했어. 가이드를 닫고 PDF를 직접 열어도 돼.') }
    finally { setBusy(false) }
  }
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="guide-dialog" onCloseAutoFocus={(event) => { event.preventDefault(); if (!document.querySelector('[role="dialog"][data-state="open"]')) document.querySelector<HTMLButtonElement>('[aria-label="사용 가이드 열기"]')?.focus() }}><DialogHeader><DialogTitle>PaperGlim 사용 가이드</DialogTitle><DialogDescription>논문을 열고, 이해하고, 다시 볼 부분을 남기는 방법</DialogDescription></DialogHeader>
    <Tabs.Root value={tab} onValueChange={setTab} className="guide-tabs-root">
      <Tabs.List className="settings-tabs" aria-label="사용 가이드 주제"><Tabs.Trigger value="start">시작하기</Tabs.Trigger><Tabs.Trigger value="reading">읽기·번역</Tabs.Trigger><Tabs.Trigger value="study">AI 학습</Tabs.Trigger><Tabs.Trigger value="manage">연결·관리</Tabs.Trigger></Tabs.List>
      <Tabs.Content value="start" className="guide-body">
        <h2>논문 한 편으로 시작해 봐</h2>
        <ol className="guide-start-steps">
          <li><strong>PDF 열기</strong><p>파일을 창에 드래그하거나 <kbd>⌘O</kbd>로 열어. 아래 예제는 별도 다운로드 없이 바로 열 수 있어.</p></li>
          <li><strong>번역·질문에 사용할 AI 연결</strong><p>설정의 ‘AI 연결’에서 설치된 Codex 또는 Claude Code CLI를 확인해. 해당 CLI에 먼저 로그인해야 해. PDF 읽기는 AI 연결 없이도 가능해.</p></li>
          <li><strong>막히는 부분에서 도움받기</strong><p>문장을 선택해 설명·수식 풀이를 요청하거나, 오른쪽 AI 패널에서 논문 전체에 질문해.</p></li>
        </ol>
        <div className="guide-actions"><Button disabled={busy} onClick={() => void example()}>{busy ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <BookOpen data-icon="inline-start" />}ResNet 예제로 시작</Button><Button variant="outline" disabled={busy} onClick={() => onSettings('ai')}><Settings2 data-icon="inline-start" />AI 연결 설정</Button></div>
        {error && <p className="guide-note" role="alert">{error}</p>}
      </Tabs.Content>
      <Tabs.Content value="reading" className="guide-body">
        <Topic icon={Languages} title="원문 바로 옆에서 번역 읽기"><p>페이지 우측 상단의 ‘한글번역’을 누르면 그 페이지 옆에 번역이 열려. 1페이지의 ‘모두 번역’은 논문 전체를 순서대로 번역해.</p><p>번역 문장에 마우스를 올리면 번역과 대응하는 원문을 함께 표시해. 두 칸 사이 경계를 드래그하면 번역 폭을 바꿀 수 있어.</p></Topic>
        <Topic icon={BookOpen} title="스크롤하고, 필요한 만큼 확대하기"><p>휠로 계속 내려서 다음 페이지를 읽어. <kbd>⌘+</kbd>·<kbd>⌘−</kbd> 또는 <kbd>⌘</kbd>+휠로 PDF를 확대·축소하고 <kbd>⌘0</kbd>으로 기본 배율로 돌아가.</p><p>앱의 글자와 아이콘 자체가 작다면 설정의 ‘화면·읽기’에서 앱 화면 크기를 바꿔.</p></Topic>
        <Topic icon={Search} title="찾은 뒤 읽던 자리로 돌아오기"><p><kbd>⌘F</kbd>로 본문을 검색하거나 상단 목차 아이콘으로 이동해. 목차는 PDF에 포함된 경우에만 표시돼. 이동 후 <kbd>⌘[</kbd>로 이전 읽기 위치에 돌아올 수 있어.</p></Topic>
      </Tabs.Content>
      <Tabs.Content value="study" className="guide-body">
        <Topic icon={MessageSquare} title="전체 논문에 질문하거나 요약하기"><p>문서 우측 상단의 패널 열기 아이콘으로 AI 패널을 열어. 질문을 보내거나 ‘논문 요약’을 누르면 돼. 첫 요청에는 논문 전체의 맥락을 준비해. 답변 아래 ‘근거 보기’의 페이지를 누르면 원문으로 이동해.</p></Topic>
        <Topic icon={Sigma} title="문장·수식을 선택해 풀어보기"><p>텍스트를 드래그하면 선택 영역 위에 도구가 떠. ‘설명’은 뜻과 맥락을, ‘수식·개념 풀이’는 기호·풀이 과정·예시·조건을 정리해 줘. 같은 창에서 후속 질문도 할 수 있어.</p></Topic>
        <Topic icon={ScanLine} title="그림·표를 영역으로 선택하기"><p>페이지 왼쪽 위의 영역 선택 아이콘을 눌러. 축·범례·캡션을 포함해 드래그한 뒤 ‘그림·표 해설’을 요청해. 방향키로 이동, Shift+방향키로 크기 조절, Enter로 선택할 수도 있어.</p></Topic>
        <Topic icon={Bookmark} title="다시 볼 부분만 남기기"><p>선택 영역에서 ‘다시 보기’를 누르면 AI 요청 없이 표시만 저장해. 문서 상단의 저장된 설명 아이콘을 열어 ‘다시 보기’로 필터링해. 저장된 설명은 원문 표시에 마우스를 올려 다시 열 수도 있어.</p></Topic>
        <p className="guide-note">오른쪽 대화는 임시야. 선택 영역의 설명과 다시 보기 표시는 앱을 껐다 켜도 남아. AI 답변은 원문 근거와 함께 확인해.</p>
      </Tabs.Content>
      <Tabs.Content value="manage" className="guide-body">
        <Topic icon={FolderOpen} title="Zotero의 논문과 컬렉션 가져오기"><p>Zotero를 실행하고 고급 설정에서 앱 통신 허용을 켠 뒤, PaperGlim의 Zotero 창에서 동기화해. 이 Mac에 내려받은 PDF를 연결하고 컬렉션 분류도 유지해. 연결 과정은 Zotero 창의 정보 아이콘에서 볼 수 있어.</p><Button variant="outline" size="sm" onClick={onZotero}>Zotero 연결 창 열기</Button></Topic>
        <Topic icon={Settings2} title="모델과 연결 상태 확인하기"><p>채팅 입력창 아래에서 제공자·모델을 골라. 지원되는 Codex 모델에서는 Fast도 선택할 수 있어. 설치·로그인이나 모델 오류가 나면 안내의 연결 설정에서 확인해.</p><p>그림·표 해설에는 이미지 입력을 지원하는 CLI와 모델이 필요해. 스캔 논문의 OCR은 아직 지원하지 않아.</p></Topic>
        <Topic icon={Bookmark} title="저장한 자료 백업하기"><p>설정의 ‘데이터·앱 정보’에서 백업·복원할 수 있어. 논문 목록·읽던 위치·선택 영역 설명·다시 보기 표시를 저장하고, 번역 캐시는 선택해서 포함해.</p><p>원본 PDF 파일과 임시 채팅은 백업에 포함되지 않아. PDF는 별도로 보관해.</p><Button variant="outline" size="sm" onClick={() => onSettings('about')}>백업·복원 설정 열기</Button></Topic>
      </Tabs.Content>
    </Tabs.Root>
    <footer className="guide-footer"><span>상단 도움말 아이콘이나 ‘도움말’ 메뉴에서 다시 열 수 있어.</span><Button variant="outline" onClick={() => onOpenChange(false)}>가이드 닫기</Button></footer>
  </DialogContent></Dialog>
}
