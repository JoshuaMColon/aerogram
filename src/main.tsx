import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './App'
import { AuthProvider } from './state/auth'
import { ToastProvider } from './components/ui'
import { SkinProvider } from './state/skin'
import { SkinPanel } from './components/SkinPanel'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <SkinProvider>
        <ToastProvider>
          <App />
          <SkinPanel />
        </ToastProvider>
      </SkinProvider>
    </AuthProvider>
  </StrictMode>,
)
