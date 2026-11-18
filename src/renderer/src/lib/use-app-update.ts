import {useEffect,useState} from 'react'
import type {AppUpdateState} from '../../../shared/types'
export function useAppUpdate(){
 const [state,setState]=useState<AppUpdateState>({phase:'idle',supported:false,revision:-1})
 useEffect(()=>{
  const receive=(next:AppUpdateState)=>setState(current=>next.revision>=current.revision?next:current)
  const remove=window.paperglim.onAppUpdate(receive)
  void window.paperglim.getUpdateState().then(receive).catch(()=>{})
  return remove
 },[])
 return state
}
