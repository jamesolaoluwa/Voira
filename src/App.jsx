import './App.css'
import Pages from "@/pages/index.jsx"
import { Toaster } from "@/components/ui/toaster"
import { AuthProvider } from '@/contexts/AuthContext'
import { useLocation } from 'react-router-dom'

function App() {
  const location = typeof window !== 'undefined' ? window.location.pathname : '/';
  // If we're on the reset-password route, render Pages outside the AuthProvider
  // to avoid initializing a normal session that would contaminate recovery.
  if (location === '/reset-password') {
    return (
      <>
        <Pages />
        <Toaster />
      </>
    );
  }

  return (
    <AuthProvider>
      <Pages />
      <Toaster />
    </AuthProvider>
  )
}

export default App 