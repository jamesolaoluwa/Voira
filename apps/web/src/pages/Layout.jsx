
import React from 'react';
import { Outlet } from 'react-router-dom';
import TopNav from '@/components/navigation/TopNav';
import { useAuth } from '@/contexts/AuthContext';

export default function Layout({ children, currentPageName }) {
  const isLandingPage = currentPageName === 'Landing';
  const isAuthPage = currentPageName === 'Auth';
  const auth = useAuth();
  const user = auth?.user;
  const isLoading = auth?.isLoading ?? true;
  const isAdmin = auth?.isAdmin ?? false;
  const isAuthenticated = !!user && !isLoading;
  
  return (
    <div className="min-h-screen bg-background text-foreground transition-colors duration-normal ease-smooth">
        <style>{`
          :root {
            --background: 0 0% 100%;
            --foreground: 0 0% 9%;
            --card: 0 0% 100%;
            --card-foreground: 0 0% 9%;
            --popover: 0 0% 100%;
            --popover-foreground: 0 0% 9%;
            --primary: 239 84% 67%;
            --primary-foreground: 0 0% 100%;
            --secondary: 0 0% 96%;
            --secondary-foreground: 0 0% 9%;
            --muted: 0 0% 96%;
            --muted-foreground: 0 0% 45%;
            --accent: 239 84% 67%;
            --accent-foreground: 0 0% 100%;
            --surface: 0 0% 98%;
            --destructive: 0 84% 60%;
            --destructive-foreground: 0 0% 100%;
            --border: 0 0% 90%;
            --input: 0 0% 90%;
            --ring: 239 84% 67%;
            --radius: 0.5rem;
          }

          .dark {
            --background: 0 0% 0%;
            --foreground: 240 6% 96%;
            --card: 0 0% 100% / 0.03;
            --card-foreground: 240 6% 96%;
            --popover: 0 0% 6%;
            --popover-foreground: 240 6% 96%;
            --primary: 239 84% 67%;
            --primary-foreground: 0 0% 100%;
            --secondary: 0 0% 12%;
            --secondary-foreground: 240 6% 96%;
            --muted: 0 0% 12%;
            --muted-foreground: 0 0% 60%;
            --accent: 239 84% 67%;
            --accent-foreground: 0 0% 100%;
            --surface: 0 0% 100% / 0.03;
            --destructive: 0 63% 31%;
            --destructive-foreground: 0 0% 98%;
            --border: 0 0% 100% / 0.08;
            --input: 0 0% 100% / 0.08;
            --ring: 239 84% 67%;
            --radius: 0.5rem;
          }
          
          body {
            font-family: var(--font-body);
            transition: background-color 0.3s cubic-bezier(0.22, 1, 0.36, 1), color 0.3s cubic-bezier(0.22, 1, 0.36, 1);
          }
          
          .dark body {
            background-color: #000000;
            color: #F5F5F7;
          }
          
          .light body {
            background-color: #ffffff;
            color: #171717;
          }
          
          ::selection {
            background: rgba(91, 92, 246, 0.25);
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
          {children || <Outlet />}
          {/* {!import.meta.env.PROD && <AuthDebug />} */}
        </main>
      ) : (
        <>
          <TopNav currentPageName={currentPageName} isAuthenticated={isAuthenticated} isAdmin={isAdmin} />
          <main className="min-h-screen">
            {children || <Outlet />}
            {/* {!import.meta.env.PROD && <AuthDebug />} */}
          </main>
        </>
      )}
  </div>
  );
}
