import './App.css'
import Pages from "@/pages/index.jsx"
import { Toaster } from "@/components/ui/toaster"
import { AuthProvider } from '@/contexts/AuthContext'
import { useLocation } from 'react-router-dom'
import ThemeProvider from '@/components/theme/ThemeProvider'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// Global QueryClient for the app
const queryClient = new QueryClient();

function App() {
  const location = typeof window !== 'undefined' ? window.location.pathname : '/';
  // If we're on the reset-password route, render Pages outside the AuthProvider
  // to avoid initializing a normal session that would contaminate recovery.
  if (location === '/reset-password') {
    return (
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <Pages />
          <Toaster />
        </ThemeProvider>
      </QueryClientProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <Pages />
          <Toaster />
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}

export default App 