import './App.css'
import Pages from "@/pages/index.jsx"
import { Toaster } from "@/components/ui/toaster"
import { AuthProvider } from '@/contexts/AuthContext'
import { useLocation } from 'react-router-dom'
import ThemeProvider from '@/components/theme/ThemeProvider'

function App() {
  const location = typeof window !== 'undefined' ? window.location.pathname : '/';
  // If we're on the reset-password route, render Pages outside the AuthProvider
  // to avoid initializing a normal session that would contaminate recovery.
  if (location === '/reset-password') {
    return (
      <ThemeProvider>
        <Pages />
        <Toaster />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <AuthProvider>
        <Pages />
        <Toaster />
      </AuthProvider>
    </ThemeProvider>
  )
}

export default App 