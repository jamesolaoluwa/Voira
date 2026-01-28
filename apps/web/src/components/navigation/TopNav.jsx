import React, { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { auth } from '@/components/services/api';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { User, Settings, Shield, LogOut, Menu, X } from 'lucide-react';
import ThemeToggle from '@/components/theme/ThemeToggle';

const navLinks = [
  { label: 'Home', page: 'Home' },
  { label: 'Speak', page: 'Speak' },
  { label: 'Practice', page: 'Practice' },
  { label: 'Voice Profile', page: 'VoiceProfile' },
  { label: 'Growth', page: 'Growth' },
  { label: 'Library', page: 'Library' },
];

export default function TopNav({ currentPageName, isAuthenticated = true, isAdmin = false }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navigate = useNavigate();

  return (
    <>
      <nav className="sticky top-0 z-50 bg-white/80 dark:bg-[#0D0D12]/80 backdrop-blur-xl border-b border-zinc-200 dark:border-white/5 transition-colors">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex items-center justify-between h-16">
            {/* Left: Logo */}
            <Link to={isAuthenticated ? createPageUrl('Home') : createPageUrl('Landing')} className="flex items-center gap-3 shrink-0 group">
              <img 
                src="/assets/VoiraLogoReduced.jpg"
                alt="Voira"
                className="w-8 h-8 object-contain group-hover:scale-105 transition-transform"
              />
              <span className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight group-hover:text-zinc-700 dark:group-hover:text-white transition-colors">Voira</span>
            </Link>

            {/* Center: Navigation Links (Desktop) */}
            <div className="hidden lg:flex items-center gap-1">
              {navLinks.map((link) => (
                <NavLink
                  key={link.page}
                  to={createPageUrl(link.page)}
                  className={({ isActive }) => `relative px-4 py-2 rounded-lg transition-colors ${isActive ? 'text-zinc-900 dark:text-white' : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'}`}
                >
                  {({ isActive }) => (
                    <motion.div whileHover={{ y: -1 }} whileTap={{ scale: 0.98 }}>
                      {link.label}
                      {isActive && (
                        <motion.div
                          layoutId="activeNav"
                          className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-violet-500 to-teal-500"
                          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                        />
                      )}
                    </motion.div>
                  )}
                </NavLink>
              ))}
            </div>

            {/* Right: Auth / User */}
            <div className="flex items-center gap-3">
              <ThemeToggle />
              {isAuthenticated ? (
                /* User Avatar Dropdown */
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-500/30 to-teal-500/30 flex items-center justify-center hover:from-violet-500/40 hover:to-teal-500/40 transition-all">
                      <User className="w-4 h-4 text-zinc-700 dark:text-zinc-300" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48 bg-white dark:bg-[#1a1a24] border-zinc-200 dark:border-white/10">
                    <Link to={createPageUrl('Profile')}>
                      <DropdownMenuItem className="cursor-pointer text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white focus:text-zinc-900 dark:focus:text-white focus:bg-zinc-100 dark:focus:bg-white/5">
                        <User className="w-4 h-4 mr-2" />
                        Profile
                      </DropdownMenuItem>
                    </Link>
                    <Link to={createPageUrl('Settings')}>
                      <DropdownMenuItem className="cursor-pointer text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white focus:text-zinc-900 dark:focus:text-white focus:bg-zinc-100 dark:focus:bg-white/5">
                        <Settings className="w-4 h-4 mr-2" />
                        Settings
                      </DropdownMenuItem>
                    </Link>
                    {isAdmin && (
                      <Link to={createPageUrl('Admin')}>
                        <DropdownMenuItem className="cursor-pointer text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300 focus:text-violet-700 dark:focus:text-violet-300 focus:bg-violet-50 dark:focus:bg-violet-500/10">
                          <Shield className="w-4 h-4 mr-2" />
                          Admin Dashboard
                        </DropdownMenuItem>
                      </Link>
                    )}
                    <DropdownMenuSeparator className="bg-zinc-200 dark:bg-white/5" />
                    <DropdownMenuItem
                      onClick={async () => {
                        try {
                          await auth.signOut();
                        } catch (e) {
                          console.warn('Sign out failed', e);
                        }
                        navigate(createPageUrl('Landing'));
                      }}
                      className="cursor-pointer text-rose-500 dark:text-rose-400 hover:text-rose-600 dark:hover:text-rose-300 focus:text-rose-600 dark:focus:text-rose-300 focus:bg-rose-50 dark:focus:bg-rose-500/10"
                    >
                      <LogOut className="w-4 h-4 mr-2" />
                      Sign Out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                /* Logged Out State */
                <div className="hidden lg:flex items-center gap-3">
                  <Link to={createPageUrl('Auth')}>
                    <Button variant="ghost" className="text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/5">
                      Sign In
                    </Button>
                  </Link>
                  <Link to={createPageUrl('Auth')}>
                    <Button className="bg-gradient-to-r from-violet-600 to-violet-500 hover:from-violet-500 hover:to-violet-400 text-white">
                      Get Started
                    </Button>
                  </Link>
                </div>
              )}

              {/* Mobile Menu Toggle */}
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="lg:hidden p-2 text-zinc-700 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
                aria-label="Toggle menu"
              >
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Mobile Menu */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="lg:hidden bg-[#0D0D12] border-b border-white/5 overflow-hidden"
          >
            <div className="px-6 py-4 space-y-2">
              {navLinks.map((link) => {
                const isActive = currentPageName === link.page;
                return (
                  <Link
                    key={link.page}
                    to={createPageUrl(link.page)}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <div
                      className={`px-4 py-3 rounded-lg transition-colors ${
                        isActive
                          ? 'bg-violet-500/20 text-violet-600 dark:text-violet-300'
                          : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/5 hover:text-zinc-900 dark:hover:text-zinc-200'
                      }`}
                    >
                      {link.label}
                    </div>
                  </Link>
                );
              })}
              {!isAuthenticated && (
                <div className="pt-4 space-y-2">
                  <Link to={createPageUrl('Auth')} onClick={() => setMobileMenuOpen(false)}>
                    <Button variant="outline" className="w-full border-zinc-300 dark:border-white/10">
                      Sign In
                    </Button>
                  </Link>
                  <Link to={createPageUrl('Auth')} onClick={() => setMobileMenuOpen(false)}>
                    <Button className="w-full bg-gradient-to-r from-violet-600 to-violet-500 text-white">
                      Get Started
                    </Button>
                  </Link>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}