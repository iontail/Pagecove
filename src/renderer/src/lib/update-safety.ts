import {useId,useLayoutEffect,useSyncExternalStore} from 'react'
const reasons=new Map<string,string>(),listeners=new Set<()=>void>()
const notify=()=>listeners.forEach(listener=>listener())
const snapshot=()=>reasons.values().next().value??''
const subscribe=(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener)}}
export function useUpdateBlocker(blocked: boolean, reason: string) {
  const id=useId()
  useLayoutEffect(()=>{
    if(blocked)reasons.set(id,reason);else reasons.delete(id)
    notify()
    return()=>{reasons.delete(id);notify()}
  },[id,blocked,reason])
}
export const useUpdateBlockReason=()=>useSyncExternalStore(subscribe,snapshot,snapshot)

export const updateBlockReason = snapshot
