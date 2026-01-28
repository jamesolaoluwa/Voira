/**
 * Admin Layout Component
 * 
 * Provides sidebar navigation and consistent layout for all admin pages.
 * Only renders for authenticated admin users.
 */

import React from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  Shield, 
  Users, 
  FileText, 
  BarChart3, 
  ScrollText,
  Mic,
  ChevronLeft,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  {
    to: '/admin',
    label: 'Dashboard',
    icon: BarChart3,
    end: true, // Exact match for dashboard
  },
  {
    to: '/admin/users',
    label: 'Users',
    icon: Users,
  },
  {
    to: '/admin/sessions',
    label: 'Sessions',
    icon: Mic,
  },
  {
    to: '/admin/drafts',
    label: 'Drafts',
    icon: FileText,
  },
  {
    to: '/admin/audit',
    label: 'Audit Log',
    icon: ScrollText,
  },
];

function NavItem({ to, label, icon: Icon, end = false }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors',
          isActive
            ? 'bg-violet-500/20 text-violet-600 dark:text-violet-400 border border-violet-500/30'
            : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/5 hover:text-zinc-900 dark:hover:text-zinc-200'
        )
      }
    >
      <Icon className="w-5 h-5" />
      <span>{label}</span>
    </NavLink>
  );
}

export default function AdminLayout() {
  const location = useLocation();
  
  // Get current page title from path
  const getPageTitle = () => {
    const path = location.pathname;
    if (path === '/admin') return 'Dashboard';
    if (path.startsWith('/admin/users')) return 'Users';
    if (path.startsWith('/admin/sessions')) return 'Sessions';
    if (path.startsWith('/admin/drafts')) return 'Drafts';
    if (path.startsWith('/admin/audit')) return 'Audit Log';
    return 'Admin';
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-[#0a0a0f]">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/80 dark:bg-[#0a0a0f]/80 backdrop-blur-lg border-b border-zinc-200 dark:border-white/5">
        <div className="flex items-center justify-between px-6 h-16">
          <div className="flex items-center gap-3">
            <Shield className="w-6 h-6 text-violet-600 dark:text-violet-400" />
            <span className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              Admin Panel
            </span>
            <span className="text-zinc-400 dark:text-zinc-600">/</span>
            <span className="text-zinc-600 dark:text-zinc-400">
              {getPageTitle()}
            </span>
          </div>
          
          <NavLink to="/home">
            <Button variant="ghost" size="sm" className="gap-2">
              <ChevronLeft className="w-4 h-4" />
              Back to App
            </Button>
          </NavLink>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <aside className="w-64 min-h-[calc(100vh-4rem)] border-r border-zinc-200 dark:border-white/5 bg-white/50 dark:bg-[#13131a]/50">
          <nav className="p-4 space-y-2">
            {NAV_ITEMS.map((item) => (
              <NavItem key={item.to} {...item} />
            ))}
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-6 lg:p-8">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            <Outlet />
          </motion.div>
        </main>
      </div>
    </div>
  );
}
