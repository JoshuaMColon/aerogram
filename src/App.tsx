import { useEffect } from 'react'
import { ChatApp } from './pages/ChatApp'
import { Demo, Login } from './pages/Auth'
import { Landing } from './pages/Landing'
import { useLocation } from './router'

export function App() {
  const { path } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [path])
  if (path === '/login') return <Login />
  if (path === '/demo') return <Demo />
  if (path === '/app' || path.startsWith('/app/')) {
    const m = path.match(/^\/app\/r\/([^/]+)/)
    return <ChatApp roomId={m ? m[1] : null} />
  }
  return <Landing />
}
