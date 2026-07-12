import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { ServerStatusGate } from '@/components/ServerStatusGate'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ServerStatusGate>
      <App />
    </ServerStatusGate>
  </StrictMode>,
)
