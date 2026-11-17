import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'

async function start() {
  const restored = await window.paperglim.restoredPreferences().catch(() => null)
  if (restored && localStorage.getItem('paperglim:restored-revision') !== restored.revision) {
    for (const [key, value] of Object.entries(restored.preferences)) localStorage.setItem(key, value)
    localStorage.setItem('paperglim:restored-revision', restored.revision)
    sessionStorage.setItem('paperglim:restore-complete', 'true')
  }
  ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>)
}
void start()
