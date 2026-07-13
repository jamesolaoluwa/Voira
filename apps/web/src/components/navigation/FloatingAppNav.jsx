import React, { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { auth } from '@/components/services/api';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
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
  { label: 'Application', href: 'Speak?type=application' },
  { label: 'Practice', page: 'Practice' },
  { label: 'Voice Profile', page: 'VoiceProfile' },
  { label: 'Growth', page: 'Growth' },
  { label: 'Library', page: 'Library' },
];

function navLinkTo(link) {
  if (link.href?.includes('?')) {
    const [page, query] = link.href.split('?');
    return `${createPageUrl(page)}?${query}`;
  }
  return createPageUrl(link.page);
}

function isLinkActive(link, currentPageName) {
  if (link.href?.startsWith('Speak')) return currentPageName === 'Speak';
  return currentPageName === link.page;
}

/**
 * Floating app shell nav — authenticated product UI only (not landing).
 * Compact pill: logo, primary routes, theme toggle, account menu.
 */
export default function FloatingAppNav({
  currentPageName,
  isAuthenticated = true,
  isAdmin = false,
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();

  const handleSignOut = async () => {
    try {
      await auth.signOut();
    } catch (e) {
      console.warn('Sign out failed', e);
    }
    navigate(createPageUrl('Landing'));
  };

  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center px-3 pt-4 sm:px-5 sm:pt-5">
        <motion.nav
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          aria-label="Main"
          className={cn(
            'pointer-events-auto flex w-full max-w-5xl items-center gap-2 rounded-full border border-zinc-200/80 bg-white/85 py-2.5 pl-3 pr-2.5 shadow-[0_8px_30px_rgba(0,0,0,0.08)] backdrop-blur-xl',
            'dark:border-white/10 dark:bg-zinc-950/85 dark:shadow-[0_8px_30px_rgba(0,0,0,0.45)]',
            'sm:gap-3 sm:pl-4 sm:pr-3'
          )}
        >
          {/* Brand */}
          <Link
            to={createPageUrl('Home')}
            className="group flex shrink-0 items-center gap-2.5 rounded-full py-1 pl-1 pr-2.5 no-underline"
            onClick={() => setMobileOpen(false)}
          >
            <img
              src="/assets/VoiraLogoMain.png"
              alt=""
              className="h-10 w-10 object-contain transition-transform duration-200 group-hover:scale-105"
            />
            <span className="hidden text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-100 sm:inline">
              Voira
            </span>
          </Link>

          {/* Desktop links */}
          <div className="hidden min-w-0 flex-1 items-center justify-center gap-1 md:flex">
            {navLinks.map((link) => (
              <NavLink
                key={link.label}
                to={navLinkTo(link)}
                className={({ isActive }) => {
                  const active = isActive || isLinkActive(link, currentPageName);
                  return cn(
                    'relative rounded-full px-3.5 py-2 text-sm font-medium no-underline transition-colors lg:px-4 lg:text-[0.9375rem]',
                    active
                      ? 'text-zinc-900 dark:text-white'
                      : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200'
                  );
                }}
              >
                {({ isActive }) => {
                  const active = isActive || isLinkActive(link, currentPageName);
                  return (
                    <>
                      {link.label}
                      {active && (
                        <motion.span
                          layoutId="floatingActiveNav"
                          className="absolute inset-x-3 -bottom-0.5 h-0.5 rounded-full bg-zinc-900 dark:bg-white"
                          transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                        />
                      )}
                    </>
                  );
                }}
              </NavLink>
            ))}
          </div>

          {/* Utilities */}
          <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
            <ThemeToggle showLabel={false} />

            {isAuthenticated && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label="Account menu"
                    className="flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200 bg-zinc-100 transition-colors hover:bg-zinc-200 dark:border-white/10 dark:bg-white/10 dark:hover:bg-white/15"
                  >
                    <User className="h-5 w-5 text-zinc-700 dark:text-zinc-300" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="w-48 border-zinc-200 bg-white dark:border-white/10 dark:bg-[#1a1a24]"
                >
                  <Link to={createPageUrl('Profile')}>
                    <DropdownMenuItem className="cursor-pointer text-zinc-700 focus:bg-zinc-100 dark:text-zinc-300 dark:focus:bg-white/5">
                      <User className="mr-2 h-4 w-4" />
                      Profile
                    </DropdownMenuItem>
                  </Link>
                  <Link to={createPageUrl('Settings')}>
                    <DropdownMenuItem className="cursor-pointer text-zinc-700 focus:bg-zinc-100 dark:text-zinc-300 dark:focus:bg-white/5">
                      <Settings className="mr-2 h-4 w-4" />
                      Settings
                    </DropdownMenuItem>
                  </Link>
                  {isAdmin && (
                    <Link to={createPageUrl('Admin')}>
                      <DropdownMenuItem className="cursor-pointer text-zinc-700 focus:bg-zinc-100 dark:text-zinc-300 dark:focus:bg-white/5">
                        <Shield className="mr-2 h-4 w-4" />
                        Admin
                      </DropdownMenuItem>
                    </Link>
                  )}
                  <DropdownMenuSeparator className="bg-zinc-200 dark:bg-white/5" />
                  <DropdownMenuItem
                    onClick={handleSignOut}
                    className="cursor-pointer text-rose-600 focus:bg-rose-50 dark:text-rose-400 dark:focus:bg-rose-500/10"
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    Sign Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            <button
              type="button"
              className="flex h-10 w-10 items-center justify-center rounded-full text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/10 md:hidden"
              aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={mobileOpen}
              onClick={() => setMobileOpen((o) => !o)}
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </motion.nav>
      </div>

      {/* Mobile menu panel */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-x-3 top-[5.25rem] z-50 overflow-hidden rounded-2xl border border-zinc-200 bg-white/95 shadow-xl backdrop-blur-xl dark:border-white/10 dark:bg-zinc-950/95 md:hidden"
          >
            <nav className="flex flex-col gap-0.5 p-2" aria-label="Mobile">
              {navLinks.map((link) => {
                const active = isLinkActive(link, currentPageName);
                return (
                  <Link
                    key={link.label}
                    to={navLinkTo(link)}
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      'rounded-xl px-4 py-3.5 text-base font-medium no-underline transition-colors',
                      active
                        ? 'bg-zinc-100 text-zinc-900 dark:bg-white/10 dark:text-white'
                        : 'text-zinc-600 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:bg-white/5'
                    )}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </nav>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Spacer so page content clears the floating pill */}
      <div className="h-[4.75rem] sm:h-[5.25rem]" aria-hidden />
    </>
  );
}
