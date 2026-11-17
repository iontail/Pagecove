import { useEffect, useState } from 'react'
import { Tabs } from 'radix-ui'
import { Check, Circle, Loader2, Minus, Plus, RefreshCw } from 'lucide-react'
import ModelPicker from './ModelPicker'
import BackupControls from './BackupControls'
import ProviderLogo from './ProviderLogo'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import type { AppInfo, AppUpdate, ProviderStatus } from '../../../shared/types'
import { appScales } from '../../../shared/appearance'

export default function ConnectionSettings({ initialSection = 'general', appScale, onAppScale, open, onOpenChange, provider, onProviderChange, onZotero, model, onModel }: {
  initialSection?: string
  appScale: number
  onAppScale: (scale: number) => void
  open: boolean
  onOpenChange: (open: boolean) => void
  provider: string
  onProviderChange: (provider: string) => void
  onZotero: () => void
  model: string
  onModel: (model: string) => void
}) {
  const [statuses, setStatuses] = useState<ProviderStatus[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [cleared, setCleared] = useState(false)
  const [section, setSection] = useState(initialSection)
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [update, setUpdate] = useState<AppUpdate | null>(null)
  const [checking, setChecking] = useState(false)
  const [updateError, setUpdateError] = useState('')
  const scaleIndex = appScales.indexOf(appScale)

  async function refresh() {
    setLoading(true)
    setError('')
    try { setStatuses(await window.paperglim.getProviders()) }
    catch { setError('설치 상태를 확인할 수 없어. 다시 시도해 줘.') }
    finally { setLoading(false) }
  }

  useEffect(() => { if (open) { setSection(initialSection); void refresh(); void window.paperglim.getAppInfo().then(setInfo).catch(() => setUpdateError('앱 정보를 읽지 못했어.')) } }, [open, initialSection])
  async function checkUpdate() {
    setChecking(true); setUpdateError('')
    try { setUpdate(await window.paperglim.checkUpdate()) }
    catch { setUpdateError('업데이트 확인에 실패했어. 인터넷 연결을 확인하고 다시 시도해 줘.') }
    finally { setChecking(false) }
  }

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="settings-dialog"><DialogHeader><DialogTitle>설정</DialogTitle><DialogDescription>화면 크기와 이 Mac의 AI·논문 라이브러리</DialogDescription></DialogHeader>
    <Tabs.Root value={section} onValueChange={setSection} className="settings-tabs-root">
      <Tabs.List aria-label="설정 분류" className="settings-tabs"><Tabs.Trigger value="general">화면·읽기</Tabs.Trigger><Tabs.Trigger value="ai">AI 연결</Tabs.Trigger><Tabs.Trigger value="zotero">Zotero</Tabs.Trigger><Tabs.Trigger value="about">데이터·앱 정보</Tabs.Trigger></Tabs.List>
      <Tabs.Content value="general" className="settings-tab-content">
    <div className="settings-section-heading"><h3 id="app-scale-label">앱 화면 크기</h3><Button variant="ghost" size="sm" disabled={appScale === 1} onClick={() => onAppScale(1)}>기본값</Button></div>
    <div className="app-scale-control" role="group" aria-labelledby="app-scale-label" aria-describedby="app-scale-note">
      <Button variant="outline" size="icon-sm" aria-label="앱 화면 축소" disabled={scaleIndex === 0} onClick={() => onAppScale(appScales[scaleIndex - 1])}><Minus /></Button>
      <output aria-label="앱 화면 배율" aria-live="polite">{Math.round(appScale * 100)}%</output>
      <Button variant="outline" size="icon-sm" aria-label="앱 화면 확대" disabled={scaleIndex === appScales.length - 1} onClick={() => onAppScale(appScales[scaleIndex + 1])}><Plus /></Button>
    </div>
    <p id="app-scale-note" className="settings-note">글자, 아이콘과 패널을 함께 확대해. PDF 배율은 따로 조절할 수 있어. 선택한 크기는 다음 실행에도 유지돼.</p>
    <Separator />
    <h3 className="settings-subtitle">읽기 단축키</h3><dl className="shortcut-list"><div><dt>PDF 확대·축소</dt><dd>⌘+ / ⌘−</dd></div><div><dt>PDF에서 휠 확대·축소</dt><dd>⌘ + 마우스 휠</dd></div><div><dt>PDF 기본 배율</dt><dd>⌘0</dd></div><div><dt>본문 검색</dt><dd>⌘F</dd></div><div><dt>이전·다음 읽기 위치</dt><dd>⌘[ / ⌘]</dd></div><div><dt>설정 열기</dt><dd>⌘,</dd></div><div><dt>질문 보내기</dt><dd>⌘Enter</dd></div></dl>
      </Tabs.Content><Tabs.Content value="ai" className="settings-tab-content">
    <div className="settings-section-heading"><h3>내 AI</h3><Button variant="ghost" size="sm" disabled={loading} onClick={() => void refresh()}>{loading ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" />}다시 확인</Button></div>
    {(['codex', 'claude'] as const).map((id) => {
      const status = statuses.find((entry) => entry.id === id)
      return <button className={`provider-option ${provider === id ? 'selected' : ''}`} key={id} onClick={() => onProviderChange(id)}>
        <span className="provider-option-icon"><ProviderLogo provider={id} /></span><div><strong>{id === 'codex' ? 'Codex' : 'Claude Code'}</strong><span>{loading ? '설치 상태 확인 중…' : status?.installed ? status.version : 'CLI를 찾지 못했어'}</span></div>{provider === id ? <Check size={17} /> : <Circle size={17} />}
      </button>
    })}
    {error && <p className="text-destructive" role="alert">{error}</p>}
    <div className="model-setting"><span>{provider === 'codex' ? 'Codex' : 'Claude'} 모델</span><ModelPicker label={provider === 'codex' ? 'Codex 모델' : 'Claude 모델'} provider={provider} model={model} providers={statuses} onModel={onModel} onProvider={onProviderChange} disabled={loading} placement="bottom" /></div>
    <p className="settings-note">설치된 CLI로 요청해. 사용 전 해당 프로그램에서 로그인해 줘.</p>
    <div className="provider-help-links"><a href="https://developers.openai.com/codex/cli/" target="_blank" rel="noreferrer">Codex 설치·로그인 안내</a><a href="https://code.claude.com/docs/en/setup" target="_blank" rel="noreferrer">Claude Code 설치·로그인 안내</a></div>
    <p className="settings-note">모델 선택은 이 앱의 요청에만 적용돼. 오른쪽 채팅 입력창에서도 바꿀 수 있어.</p>
    {provider === 'codex' && <p className="settings-note">목록은 Codex가 마지막으로 조회한 정보야. 계정에서 거부되면 다른 모델을 선택해 줘.</p>}
      </Tabs.Content><Tabs.Content value="zotero" className="settings-tab-content">
    <div className="settings-section-heading"><h3>Zotero</h3><Button variant="outline" size="sm" onClick={onZotero}>라이브러리 연결</Button></div>
    <p className="settings-note">로컬 개인 라이브러리의 PDF와 컬렉션을 가져와. Zotero를 실행한 뒤 라이브러리 연결 창의 안내 아이콘에서 설정 방법을 확인할 수 있어.</p>
      </Tabs.Content><Tabs.Content value="about" className="settings-tab-content">
    <div className="app-version"><strong>PaperGlim {info?.version ?? '…'}</strong><span>빌드 {info?.build ?? '…'}{info && !info.packaged ? ' · 개발 실행' : ''} · Apple Silicon</span></div>
    <div className="flex gap-2"><Button variant="outline" size="sm" disabled={checking} onClick={() => void checkUpdate()}>{checking ? '확인 중…' : '업데이트 확인'}</Button><Button variant="ghost" size="sm" onClick={() => void window.paperglim.openReleases().catch(() => setUpdateError('브라우저에서 릴리스를 열지 못했어.'))}>릴리스·다운로드</Button></div>
    {update && <div className="update-result" role="status"><p>{update.available ? `${update.version} 버전을 내려받을 수 있어.` : update.ahead ? `공개 배포는 ${update.version}이야. 현재 앱이 더 새로운 로컬 빌드야.` : '현재 공개된 최신 버전이야.'}</p>{update.notes && <details><summary>공개 버전 변경 내용</summary><pre>{update.notes}</pre></details>}</div>}
    {updateError && <p className="text-destructive text-xs" role="alert">{updateError}</p>}
    <p className="settings-note">업데이트 확인은 GitHub의 공개 릴리스만 조회해. 논문이나 대화는 보내지 않고 자동 설치하지 않아.</p>
    <Separator />
    <BackupControls />
    <Separator />
    <div className="settings-section-heading"><h3>임시 질문</h3></div>
    <p className="settings-note">같은 대화 안에서는 후속 질문을 이어가고, 새 대화를 누르면 분리해. 오른쪽 대화·초안은 임시로 유지하고 선택 영역 설명은 이 Mac에 저장해.</p>
    <Button variant="outline" size="sm" disabled={cleared} onClick={() => {
      Object.keys(localStorage).filter((key) => key.startsWith('paperglim:chat:') || key.startsWith('paperglim:draft:')).forEach((key) => localStorage.removeItem(key))
      setCleared(true)
    }}>{cleared ? '이전 앱 기록을 삭제했어' : '이전에 저장한 앱 대화·초안 삭제'}</Button>
    <Separator />
    <div className="settings-section-heading"><h3>내 파일</h3></div><p className="settings-note">PDF 원본을 복사하거나 수정하지 않아. 최근 문서와 읽던 위치, 번역 결과는 이 Mac에 저장해. 저장된 번역은 페이지 번역 칸의 삭제 버튼으로 지울 수 있어. 목록에서 지워도 원본 파일은 남아 있어.</p>
      </Tabs.Content>
    </Tabs.Root>
  </DialogContent></Dialog>
}
