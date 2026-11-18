import {useLayoutEffect} from 'react'
import {createPortal} from 'react-dom'
import {ArrowDownToLine,RotateCw,Loader2} from 'lucide-react'
import {Button} from '@/components/ui/button'
import {useAppUpdate} from '@/lib/use-app-update'
import {useUpdateBlockReason,updateBlockReason} from '@/lib/update-safety'

export default function UpdateNotice({onOpen}:{onOpen:()=>void}){
 const state=useAppUpdate(),blocked=useUpdateBlockReason()
 useLayoutEffect(()=>{window.paperglim.setUpdateBlocked(!!blocked)},[blocked])
 useLayoutEffect(()=>{
  if(!['preparing','installing'].includes(state.phase))return
  const elements=[...document.body.children].filter((el):el is HTMLElement=>el instanceof HTMLElement&&el.id!=='update-install-status')
  const previous=elements.map(el=>el.inert);elements.forEach(el=>{el.inert=true})
  if(state.phase==='preparing')window.paperglim.acknowledgeUpdateLock(state.revision,!!updateBlockReason())
  return()=>elements.forEach((el,i)=>{el.inert=previous[i]})
 },[state.phase,state.revision])
 const visible=['available','downloading','verifying','ready','preparing','installing'].includes(state.phase)||(state.phase==='error'&&!!state.version)
 if(!visible)return null
 const ready=state.phase==='ready',working=['downloading','verifying','preparing','installing'].includes(state.phase)
 const label=ready?'재시작 업데이트':working?'업데이트 중':'새 버전'
 return <><Button className="update-notice" variant="ghost" size="sm" aria-label={`${state.version??''} ${label} · 업데이트 설정 열기`} onClick={onOpen}>{working?<Loader2 className="animate-spin" />:ready?<RotateCw />:<ArrowDownToLine />}<span>{label}</span></Button>{['preparing','installing'].includes(state.phase)&&createPortal(<div id="update-install-status" className="update-install-status" role="status" aria-live="polite"><Loader2 className="animate-spin" /><strong>업데이트 설치 중</strong><p>잠시 뒤 앱이 다시 열려요.</p></div>,document.body)}</>
}
