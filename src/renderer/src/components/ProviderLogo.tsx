import type { CSSProperties } from 'react'
import codexMark from '@/assets/providers/codex.svg'
import claudeMark from '@/assets/providers/claude.svg'

export default function ProviderLogo({ provider }: { provider: string }) {
  return <span className={`provider-logo provider-logo-${provider === 'claude' ? 'claude' : 'codex'}`} data-provider-logo={provider} aria-hidden="true" style={{ '--provider-mark': `url("${provider === 'claude' ? claudeMark : codexMark}")` } as CSSProperties} />
}
