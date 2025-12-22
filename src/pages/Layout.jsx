
import React from 'react';
import TopNav from '@/components/navigation/TopNav';
import ThemeProvider from '@/components/theme/ThemeProvider';

export default function Layout({ children, currentPageName }) {
  const isLandingPage = currentPageName === 'Landing';
  const isAuthPage = currentPageName === 'Auth';
  
  return (
    <ThemeProvider>
      <div className="min-h-screen bg-white dark:bg-[#0a0a0f] text-zinc-900 dark:text-zinc-100 transition-colors duration-300">
        <style>{`
          :root {
            --background: 0 0% 100%;
            --foreground: 240 10% 15%;
            --card: 0 0% 100%;
            --card-foreground: 240 10% 15%;
            --popover: 0 0% 100%;
            --popover-foreground: 240 10% 15%;
            --primary: 263 70% 50%;
            --primary-foreground: 0 0% 100%;
            --secondary: 174 72% 40%;
            --secondary-foreground: 0 0% 100%;
            --muted: 0 0% 96%;
            --muted-foreground: 240 5% 45%;
            --accent: 263 70% 50%;
            --accent-foreground: 0 0% 100%;
            --destructive: 0 84% 60%;
            --destructive-foreground: 0 0% 100%;
            --border: 0 0% 90%;
            --input: 0 0% 90%;
            --ring: 263 70% 50%;
            --radius: 0.75rem;
          }

          .dark {
            --background: 0 0% 4%;
            --foreground: 240 10% 90%;
            --card: 240 6% 8%;
            --card-foreground: 240 10% 90%;
            --popover: 240 6% 8%;
            --popover-foreground: 240 10% 90%;
            --primary: 263 70% 50%;
            --primary-foreground: 0 0% 100%;
            --secondary: 174 72% 40%;
            --secondary-foreground: 0 0% 100%;
            --muted: 240 6% 15%;
            --muted-foreground: 240 5% 55%;
            --accent: 263 70% 50%;
            --accent-foreground: 0 0% 100%;
            --destructive: 0 84% 60%;
            --destructive-foreground: 0 0% 100%;
            --border: 240 6% 15%;
            --input: 240 6% 15%;
            --ring: 263 70% 50%;
            --radius: 0.75rem;
          }
          
          body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            transition: background-color 0.3s ease, color 0.3s ease;
          }
          
          .dark body {
            background-color: #0a0a0f;
            color: #e4e4e7;
          }
          
          .light body {
            background-color: #fafafa;
            color: #18181b;
          }
          
          ::selection {
            background: rgba(139, 92, 246, 0.3);
          }
          
          ::-webkit-scrollbar {
            width: 6px;
          }
          
          ::-webkit-scrollbar-track {
            background: transparent;
          }
          
          .dark ::-webkit-scrollbar-thumb {
            background: rgba(255, 255, 255, 0.1);
            border-radius: 3px;
          }
          
          .light ::-webkit-scrollbar-thumb {
            background: rgba(0, 0, 0, 0.1);
            border-radius: 3px;
          }
          
          .dark ::-webkit-scrollbar-thumb:hover {
            background: rgba(255, 255, 255, 0.2);
          }
          
          .light ::-webkit-scrollbar-thumb:hover {
            background: rgba(0, 0, 0, 0.2);
          }
        `}</style>
      
      {isLandingPage || isAuthPage ? (
        <main className="min-h-screen">
          {children}
        </main>
      ) : (
        <>
          <TopNav currentPageName={currentPageName} />
          <main className="min-h-screen">
            {children}
          </main>
        </>
      )}
      </div>
    </ThemeProvider>
  );
}
