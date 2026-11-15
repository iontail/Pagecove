import { useEffect, useState } from 'react'
import { Check, Circle, Loader2, RefreshCw } from 'lucide-react'
import ModelPicker from './ModelPicker'
import ProviderLogo from './ProviderLogo'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import type { ProviderStatus } from '../../../shared/types'

export default function ConnectionSettings({ open, onOpenChange, provider, onProviderChange, onZotero, model, onModel }: {
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

  async function refresh() {
    setLoading(true)
    setError('')
    try { setStatuses(await window.paperglim.getProviders()) }
    catch { setError('설치 상태를 확인할 수 없어. 다시 시도해 줘.') }
    finally { setLoading(false) }
  }

  useEffect(() => { if (open) void refresh() }, [open])

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="settings-dialog"><DialogHeader><DialogTitle>연결 설정</DialogTitle><DialogDescription>이 Mac에서 사용하는 AI와 논문 라이브러리</DialogDescription></DialogHeader>
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
    <p className="settings-note">모델 선택은 이 앱의 요청에만 적용돼. 오른쪽 채팅 입력창에서도 바꿀 수 있어.</p>
    {provider === 'codex' && <p className="settings-note">목록은 Codex가 마지막으로 조회한 정보야. 계정에서 거부되면 다른 모델을 선택해 줘.</p>}
    <Separator />
    <div className="settings-section-heading"><h3>임시 질문</h3></div>
    <p className="settings-note">같은 대화 안에서는 후속 질문을 이어가고, 새 대화를 누르면 분리해. 오른쪽 대화·초안은 임시로 유지하고 선택 영역 설명은 이 Mac에 저장해.</p>
    <Button variant="outline" size="sm" disabled={cleared} onClick={() => {
      Object.keys(localStorage).filter((key) => key.startsWith('paperglim:chat:') || key.startsWith('paperglim:draft:')).forEach((key) => localStorage.removeItem(key))
      setCleared(true)
    }}>{cleared ? '이전 앱 기록을 삭제했어' : '이전에 저장한 앱 대화·초안 삭제'}</Button>
    <Separator />
    <div className="settings-section-heading"><h3>Zotero</h3><Button variant="outline" size="sm" onClick={onZotero}>라이브러리 연결</Button></div>
    <p className="settings-note">로컬 개인 라이브러리의 PDF를 가져와. 연결 창의 안내 아이콘에서 설정 방법을 확인할 수 있어.</p>
    <Separator />
    <div className="settings-section-heading"><h3>내 파일</h3></div><p className="settings-note">PDF 원본을 복사하거나 수정하지 않아. 최근 문서와 읽던 위치, 번역 결과는 이 Mac에 저장해. 저장된 번역은 페이지 번역 칸의 삭제 버튼으로 지울 수 있어. 목록에서 지워도 원본 파일은 남아 있어.</p>
  </DialogContent></Dialog>
}
