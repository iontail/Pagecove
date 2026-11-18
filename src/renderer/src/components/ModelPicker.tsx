import { useState } from 'react'
import { DropdownMenu } from 'radix-ui'
import { Check, ChevronDown, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import ProviderLogo from './ProviderLogo'
import type { ProviderStatus } from '../../../shared/types'

export default function ModelPicker({ provider, model, providers, onModel, onProvider, disabled = false, label = 'AI 모델', placement = 'top' }: {
  provider: string; model: string; providers: ProviderStatus[]; onModel: (model: string) => void
  onProvider: (provider: string) => void; disabled?: boolean; label?: string; placement?: 'top' | 'bottom'
}) {
  const [open, setOpen] = useState(false)
  const status = providers.find((entry) => entry.id === provider)
  const models = status?.models ?? []
  const selected = models.find((entry) => entry.id === model)
  const name = provider === 'claude' ? 'Claude' : 'Codex'
  const selectedName = model ? selected?.name ?? model : '자동 선택'
  const choices = model && !selected ? [...models, { id: model, name: model }] : models
  const automaticName = provider === 'codex' && models[0] ? models[0].name : 'CLI 기본 모델'
  return <DropdownMenu.Root open={open} onOpenChange={setOpen} modal={false}>
    <DropdownMenu.Trigger asChild><Button variant="ghost" size="sm" className="model-picker-trigger" aria-label={label} aria-description={`${name} · ${selectedName}`} data-model={model} data-provider={provider} disabled={disabled} title={`${name} · ${selectedName}`}><ProviderLogo provider={provider} /><span className="model-trigger-copy"><small>{name}</small><span>{selectedName}</span></span><ChevronDown data-icon="inline-end" /></Button></DropdownMenu.Trigger>
    <DropdownMenu.Portal><DropdownMenu.Content className="model-menu z-50" aria-labelledby={undefined} aria-label="AI 모델 선택" side={placement} align="start" sideOffset={8} collisionPadding={12} loop>
      <DropdownMenu.Label className="model-menu-heading">모델 선택<span>{status ? status.installed ? 'CLI 설치됨' : '설치 필요' : '확인 중…'}</span></DropdownMenu.Label>
      <DropdownMenu.Group aria-label="AI 제공자" className="model-provider-group"><DropdownMenu.Label className="sr-only">AI 제공자</DropdownMenu.Label><DropdownMenu.RadioGroup value={provider} onValueChange={(value) => { if (value !== provider) onProvider(value) }} className="model-provider-choices">
        {(['codex', 'claude'] as const).map((id) => <DropdownMenu.RadioItem key={id} value={id} className="model-provider-choice" onSelect={(event) => event.preventDefault()}><ProviderLogo provider={id} /><span>{id === 'codex' ? 'Codex' : 'Claude'}</span><DropdownMenu.ItemIndicator className="model-provider-check"><Check size={12} /></DropdownMenu.ItemIndicator></DropdownMenu.RadioItem>)}
      </DropdownMenu.RadioGroup></DropdownMenu.Group>
      <DropdownMenu.Separator className="model-menu-divider" />
      <DropdownMenu.Group className="model-menu-list" aria-label={`${name} 모델`}><DropdownMenu.Label className="sr-only">{name} 모델</DropdownMenu.Label><DropdownMenu.RadioGroup value={model} onValueChange={(value) => { if (value !== model) onModel(value) }}>
        <DropdownMenu.RadioItem value="" className="model-option model-option-auto" disabled={!status?.installed} aria-label="자동 선택"><ProviderLogo provider={provider} /><span className="model-option-copy"><strong>자동 선택</strong><small>{automaticName}</small></span><DropdownMenu.ItemIndicator className="model-option-check"><Check size={15} /></DropdownMenu.ItemIndicator></DropdownMenu.RadioItem>
        {choices.map((entry) => <DropdownMenu.RadioItem key={entry.id} value={entry.id} className="model-option" disabled={!status?.installed} aria-label={entry.name}><ProviderLogo provider={provider} /><span className="model-option-name">{entry.name}</span>{entry.supportsFast && <Zap className="model-option-fast" size={12} aria-hidden="true" />}<DropdownMenu.ItemIndicator className="model-option-check"><Check size={15} /></DropdownMenu.ItemIndicator></DropdownMenu.RadioItem>)}
      </DropdownMenu.RadioGroup></DropdownMenu.Group>
      {!status?.installed && <DropdownMenu.Label className="model-menu-note">{status ? `${name} CLI를 설치한 뒤 ‘AI 연결’ 설정을 확인하세요.` : 'AI 모델 확인 중…'}</DropdownMenu.Label>}
    </DropdownMenu.Content></DropdownMenu.Portal>
  </DropdownMenu.Root>
}
