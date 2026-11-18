import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { Tooltip } from 'radix-ui'
import './styles.css'
import './themes.css'

async function start() {
  const restored = await window.paperglim.restoredPreferences().catch(() => null)
  if (restored && localStorage.getItem('paperglim:restored-revision') !== restored.revision) {
    for (const [key, value] of Object.entries(restored.preferences)) localStorage.setItem(key, value)
    localStorage.setItem('paperglim:restored-revision', restored.revision)
    sessionStorage.setItem('paperglim:restore-complete', 'true')
  }
  document.documentElement.dataset.theme = localStorage.getItem('paperglim:theme') === 'dark' ? 'dark' : 'light'
  document.documentElement.dataset.palette = localStorage.getItem('paperglim:palette') === 'cream' ? 'cream' : 'neutral'
  ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><Tooltip.Provider delayDuration={350} skipDelayDuration={150}><App /></Tooltip.Provider></React.StrictMode>)
}
void start()
