import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { ServerStatusGate } from '@/components/ServerStatusGate'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ServerStatusGate>
      <App />
    </ServerStatusGate>
  </StrictMode>,
)
