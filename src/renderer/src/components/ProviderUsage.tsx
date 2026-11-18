import { useEffect, useRef, useState } from 'react'
import { Tooltip } from 'radix-ui'
import { Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import ProviderLogo from './ProviderLogo'
import type { ProviderUsage as Usage } from '../../../shared/types'
import { usageLabel } from '../../../shared/provider-usage'

const time = (value: number) => new Date(value).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })

export default function ProviderUsage({ visible }: { visible: boolean }) {
  const [values, setValues] = useState<Usage[]>([])
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const pending = useRef(false)
  async function refresh(force = false) {
    if (pending.current || !visible || document.visibilityState !== 'visible') return
    pending.current = true; setLoading(true)
    try { setValues(await window.paperglim.getProviderUsage(force)); setFailed(false) }
    catch { setValues([]); setFailed(true) }
    finally { pending.current = false; setLoading(false) }
  }
  useEffect(() => {
    if (!visible) return
    const update = () => { void refresh() }
    update()
    const timer = window.setInterval(update, 300000)
    window.addEventListener('focus', update)
    document.addEventListener('visibilitychange', update)
    const unsubscribe = window.paperglim.onUsageChanged(update)
    return () => { clearInterval(timer); unsubscribe(); window.removeEventListener('focus', update); document.removeEventListener('visibilitychange', update) }
  }, [visible])
  return <section className="provider-usage" aria-label="AI 남은 사용량" aria-busy={loading}>
    {(['codex', 'claude'] as const).map((provider) => {
      const value = values.find((entry) => entry.provider === provider)
      const name = provider === 'codex' ? 'Codex' : 'Claude Code'
      const windows = value?.windows ?? []
      const lowest = windows.toSorted((a, b) => a.remainingPercent - b.remainingPercent)[0]
      const label = lowest ? `${usageLabel(lowest, windows.indexOf(lowest))} · ${lowest.remainingPercent}%` : loading && !value ? '확인 중' : value?.status === 'not-installed' ? '설치 필요' : '확인 불가'
      const compactLabel = lowest ? `${usageLabel(lowest, windows.indexOf(lowest))} ${lowest.remainingPercent}%` : loading && !value ? '…' : '—'
      const details = lowest ? windows.map((window, index) => `${usageLabel(window, index)} 한도: ${window.remainingPercent}% 남음${window.resetsAt ? ` · 초기화 ${time(window.resetsAt)}` : ''}`).join('\n') + `\n${value?.source === 'live' ? 'CLI에서 조회' : 'CLI 로컬 기록'} · ${time(value!.checkedAt!)}` : failed ? '사용량을 불러오지 못했어요. 새로고침해 주세요.' : value?.message || '사용량 확인 중…'
      return <Tooltip.Root key={provider}><Tooltip.Trigger asChild><div className="usage-row" tabIndex={0} role="group" aria-label={`${name} 남은 사용량: ${label}`}><ProviderLogo provider={provider} /><strong>{compactLabel}</strong></div></Tooltip.Trigger><Tooltip.Portal><Tooltip.Content className="app-tooltip usage-tooltip" side="right" sideOffset={10} collisionPadding={12}><strong>{name}</strong><span>{details}</span><Tooltip.Arrow /></Tooltip.Content></Tooltip.Portal></Tooltip.Root>
    })}
    <Button className="usage-refresh" variant="ghost" size="icon-xs" aria-label="AI 사용량 새로고침" disabled={loading} onClick={() => void refresh(true)}>{loading ? <Loader2 className="animate-spin" /> : <RefreshCw />}</Button>
  </section>
}
