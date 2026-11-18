import { useEffect, useState } from 'react'
import { Tabs } from 'radix-ui'
import { Check, Circle, Loader2, Minus, Plus, RefreshCw } from 'lucide-react'
import ModelPicker from './ModelPicker'
import UpdateControls from './UpdateControls'
import BackupControls from './BackupControls'
import ProviderLogo from './ProviderLogo'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import type { AppInfo, ProviderStatus } from '../../../shared/types'
import { appScales } from '../../../shared/appearance'

export default function ConnectionSettings({ theme, onTheme, palette, onPalette, initialSection = 'general', appScale, onAppScale, open, onOpenChange, provider, onProviderChange, onZotero, model, onModel }: {
  theme: 'light' | 'dark'
  onTheme: (theme: 'light' | 'dark') => void
  palette: 'neutral' | 'cream'
  onPalette: (palette: 'neutral' | 'cream') => void
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
  const [updateError, setUpdateError] = useState('')
  const scaleIndex = appScales.indexOf(appScale)

  async function refresh() {
    setLoading(true)
    setError('')
    try { setStatuses(await window.paperglim.getProviders()) }
    catch { setError('설치 상태를 확인하지 못했어요. 다시 시도해 주세요.') }
    finally { setLoading(false) }
  }

  useEffect(() => { if (open) { setSection(initialSection); void refresh(); void window.paperglim.getAppInfo().then(setInfo).catch(() => setUpdateError('앱 정보를 불러오지 못했어요.')) } }, [open, initialSection])

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="settings-dialog"><DialogHeader><DialogTitle>설정</DialogTitle><DialogDescription>화면, AI 연결, 논문과 앱 데이터 관리</DialogDescription></DialogHeader>
    <Tabs.Root value={section} onValueChange={setSection} className="settings-tabs-root">
      <Tabs.List aria-label="설정 분류" className="settings-tabs"><Tabs.Trigger value="general">화면·읽기</Tabs.Trigger><Tabs.Trigger value="ai">AI 연결</Tabs.Trigger><Tabs.Trigger value="zotero">Zotero</Tabs.Trigger><Tabs.Trigger value="about">데이터·앱 정보</Tabs.Trigger></Tabs.List>
      <Tabs.Content value="general" className="settings-tab-content">
    <fieldset className="appearance-choices"><legend>색상 테마</legend><div className="palette-options">
      {([{ id: 'neutral', name: '차콜·오프화이트' }, { id: 'cream', name: '크림·네이비' }] as const).map((option) => <label className="palette-option" key={option.id} data-selected={palette === option.id}><input type="radio" name="palette" value={option.id} checked={palette === option.id} onChange={() => onPalette(option.id)} /><span className={`palette-preview palette-${option.id}`} data-dark={theme === 'dark'} aria-hidden="true"><i /><span><b /><b /></span></span><span>{option.name}</span></label>)}
    </div></fieldset>
    <fieldset className="appearance-choices"><legend>밝기</legend><div className="brightness-options">{([{ id: 'light', name: '라이트' }, { id: 'dark', name: '다크' }] as const).map((option) => <label key={option.id}><input type="radio" name="brightness" checked={theme === option.id} onChange={() => onTheme(option.id)} />{option.name}</label>)}</div></fieldset>
    <p className="settings-note">테마는 바로 적용돼요. 화면 위쪽의 끈 모양 스위치로도 바꿀 수 있어요. PDF 색상은 그대로 표시돼요.</p>
    <Separator />
    <div className="settings-section-heading"><h3 id="app-scale-label">앱 화면 크기</h3><Button variant="ghost" size="sm" disabled={appScale === 1} onClick={() => onAppScale(1)}>기본값</Button></div>
    <div className="app-scale-control" role="group" aria-labelledby="app-scale-label" aria-describedby="app-scale-note">
      <Button variant="outline" size="icon-sm" aria-label="앱 화면 축소" disabled={scaleIndex === 0} onClick={() => onAppScale(appScales[scaleIndex - 1])}><Minus /></Button>
      <output aria-label="앱 화면 배율" aria-live="polite">{Math.round(appScale * 100)}%</output>
      <Button variant="outline" size="icon-sm" aria-label="앱 화면 확대" disabled={scaleIndex === appScales.length - 1} onClick={() => onAppScale(appScales[scaleIndex + 1])}><Plus /></Button>
    </div>
    <p id="app-scale-note" className="settings-note">글자, 아이콘, 패널의 크기를 함께 바꿔요. PDF 배율은 문서를 읽는 화면에서 따로 조절하세요.</p>
    <Separator />
    <h3 className="settings-subtitle">읽기 단축키</h3><dl className="shortcut-list"><div><dt>PDF 확대·축소</dt><dd>⌘+ / ⌘−</dd></div><div><dt>PDF에서 휠 확대·축소</dt><dd>⌘ + 마우스 휠</dd></div><div><dt>PDF 기본 배율</dt><dd>⌘0</dd></div><div><dt>본문 검색</dt><dd>⌘F</dd></div><div><dt>이전·다음 읽기 위치</dt><dd>⌘[ / ⌘]</dd></div><div><dt>설정 열기</dt><dd>⌘,</dd></div><div><dt>질문 보내기</dt><dd>⌘Enter</dd></div></dl>
      </Tabs.Content><Tabs.Content value="ai" className="settings-tab-content">
    <div className="settings-section-heading"><h3>내 AI</h3><Button variant="ghost" size="sm" disabled={loading} onClick={() => void refresh()}>{loading ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" />}다시 확인</Button></div>
    {(['codex', 'claude'] as const).map((id) => {
      const status = statuses.find((entry) => entry.id === id)
      return <button className={`provider-option ${provider === id ? 'selected' : ''}`} key={id} onClick={() => onProviderChange(id)}>
        <span className="provider-option-icon"><ProviderLogo provider={id} /></span><div><strong>{id === 'codex' ? 'Codex' : 'Claude Code'}</strong><span>{loading ? '설치 상태 확인 중…' : status?.installed ? status.version : 'CLI를 찾지 못했어요'}</span></div>{provider === id ? <Check size={17} /> : <Circle size={17} />}
      </button>
    })}
    {error && <p className="text-destructive" role="alert">{error}</p>}
    <div className="model-setting"><span>{provider === 'codex' ? 'Codex' : 'Claude'} 모델</span><ModelPicker label={provider === 'codex' ? 'Codex 모델' : 'Claude 모델'} provider={provider} model={model} providers={statuses} onModel={onModel} onProvider={onProviderChange} disabled={loading} placement="bottom" /></div>
    <p className="settings-note">먼저 터미널에서 Codex 또는 Claude Code에 로그인하세요.</p>
    <div className="provider-help-links"><a href="https://developers.openai.com/codex/cli/" target="_blank" rel="noreferrer">Codex 설치·로그인 안내</a><a href="https://code.claude.com/docs/en/setup" target="_blank" rel="noreferrer">Claude Code 설치·로그인 안내</a></div>
    <p className="settings-note">여기서 고른 모델은 Pagecove에서 사용해요. 채팅 입력창 아래에서도 바꿀 수 있어요.</p>
    {provider === 'codex' && <p className="settings-note">Codex가 마지막으로 확인한 모델 목록이에요. 계정에서 사용할 수 없는 모델이면 다른 모델을 골라 주세요.</p>}
      </Tabs.Content><Tabs.Content value="zotero" className="settings-tab-content">
    <div className="settings-section-heading"><h3>Zotero</h3><Button variant="outline" size="sm" onClick={onZotero}>라이브러리 연결</Button></div>
    <p className="settings-note">Zotero 개인 라이브러리의 PDF와 컬렉션을 가져와요. 연결 방법은 Zotero 창의 정보 아이콘에서 확인하세요.</p>
      </Tabs.Content><Tabs.Content value="about" className="settings-tab-content">
    <div className="app-version"><strong>Pagecove {info?.version ?? '…'}</strong><span>빌드 {info?.build ?? '…'}{info && !info.packaged ? ' · 개발 실행' : ''} · Apple Silicon</span></div>
    {updateError && <p className="text-destructive text-xs" role="alert">{updateError}</p>}
    <UpdateControls />
    <Separator />
    <BackupControls />
    <Separator />
    <div className="settings-section-heading"><h3>임시 질문</h3></div>
    <p className="settings-note">‘새 대화’를 누르면 질문을 처음부터 시작할 수 있어요. 오른쪽 패널의 대화와 초안은 임시로 표시돼요. 선택한 부분의 설명은 이 Mac에 저장돼요.</p>
    <Button variant="outline" size="sm" disabled={cleared} onClick={() => {
      Object.keys(localStorage).filter((key) => key.startsWith('paperglim:chat:') || key.startsWith('paperglim:draft:')).forEach((key) => localStorage.removeItem(key))
      setCleared(true)
    }}>{cleared ? '이전 앱 기록 삭제 완료' : '이전에 저장한 앱 대화·초안 삭제'}</Button>
    <Separator />
    <div className="settings-section-heading"><h3>내 파일</h3></div><p className="settings-note">최근 문서, 읽던 위치, 번역 결과는 이 Mac에 저장돼요. 번역은 각 페이지의 번역 칸에서 삭제할 수 있어요. 서재 목록에서 문서를 지워도 PDF 원본은 그대로 남아요.</p>
      </Tabs.Content>
    </Tabs.Root>
  </DialogContent></Dialog>
}
