import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { motion } from 'framer-motion';
import { GraduationCap, Briefcase, MessageSquare, RefreshCw, Mic, Loader2 } from 'lucide-react';
import { auth } from '@/components/services/api';
import { useAuth } from '@/contexts/AuthContext';
import useSessionStore from '@/stores/useSessionStore';
import CreditsDisplay from '@/components/ui/CreditsDisplay';

const features = [
  {
    icon: GraduationCap,
    title: 'Application Essay',
    description: 'Craft compelling essays for college and scholarship applications',
    href: 'Speak?type=application',
  },
  {
    icon: Briefcase,
    title: 'Interview Response',
    description: 'Prepare polished answers for job and program interviews',
    href: 'Speak?type=interview',
  },
  {
    icon: MessageSquare,
    title: 'Free Speak',
    description: 'Express yourself freely and let Voira refine your thoughts',
    href: 'Speak?type=free',
  },
  {
    icon: RefreshCw,
    title: 'Refine Existing Draft',
    description: 'Improve and polish your existing written content',
    href: 'RefineDraft',
  },
  {
    icon: Mic,
    title: 'Practice Mode',
    description: 'Rehearse interviews with real-time feedback and coaching',
    href: 'Practice',
  },
];

export default function Home() {
  const navigate = useNavigate();
  const { user: authUser, session, isLoading: authLoading } = useAuth();
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const sessions = useSessionStore(state => state.sessions || []);
  const stats = React.useMemo(() => {
    const total = sessions.length;
    if (total === 0) return { totalSessions: 0, avgConfidence: 0, avgFillers: 0, avgWPM: 0 };
    const avgConfidence = Math.round(sessions.reduce((s, x) => s + (x.confidenceScore || 0), 0) / total);
    const avgFillers = Math.round(sessions.reduce((s, x) => s + (x.fillerCount || 0), 0) / total);
    const avgWPM = Math.round(sessions.reduce((s, x) => s + (x.wordsPerMinute || 0), 0) / total);
    return { totalSessions: total, avgConfidence, avgFillers, avgWPM };
  }, [sessions]);
  // Only run auth check when auth loading state changes or when authUser becomes available.
  // Avoid depending on `session` here to prevent repeated effects caused by session updates elsewhere.
  useEffect(() => {
    let mounted = true;

    const checkAuth = async () => {
      try {
        if (authLoading) return;

        // If there's no session and no user, the user is unauthenticated
        if (!session && !authUser) {
          if (mounted) navigate(createPageUrl('Auth'));
          return;
        }

        // Only update local user state when it actually changed to avoid infinite re-renders
        if (authUser && (!user || authUser.id !== user.id)) {
          if (mounted) setUser(authUser);
        }
      } catch (error) {
        if (mounted) navigate(createPageUrl('Auth'));
      } finally {
        if (mounted && isLoading) setIsLoading(false);
      }
    };

    checkAuth();

    return () => { mounted = false; };
  }, [authLoading, authUser]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6 lg:p-10">
      {/* Header with Personal Greeting */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="mb-12 max-w-5xl mx-auto"
      >
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="text-zinc-600 dark:text-zinc-400 text-lg mb-3"
        >
          {(() => {
            const nameSource = user?.full_name || user?.email || '';
            const firstName = nameSource.split(' ')[0].split('@')[0];
            return `Welcome back, ${firstName || 'there'}. Ready to speak your truth?`;
          })()}
        </motion.p>
        <h1 className="text-3xl lg:text-4xl font-bold text-zinc-900 dark:text-zinc-100 mb-3">
          What do you want to do today?
        </h1>
        <p className="text-zinc-600 dark:text-zinc-500 text-lg">
          Choose a mode to start expressing yourself naturally
        </p>
      </motion.div>
      
      {/* Feature Cards Grid */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
        {features.map((feature, index) => {
          const Icon = feature.icon;
          // build link explicitly so query params aren't transformed unexpectedly
          const to = feature.href && feature.href.includes('?')
            ? `${createPageUrl(feature.href.split('?')[0])}?${feature.href.split('?')[1]}`
            : createPageUrl(feature.href);

          return (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
            >
              <Link to={to}>
                <motion.div
                  className="group relative p-6 rounded-2xl bg-white border border-zinc-200 shadow-md dark:bg-[hsl(var(--card))] dark:border-white/5 dark:shadow-none cursor-pointer overflow-hidden"
                  whileHover={{ scale: 1.02, y: -4 }}
                  whileTap={{ scale: 0.98 }}
                  transition={{ duration: 0.2 }}
                >
                  {/* Hover glow effect */}
                  <div className="absolute inset-0 bg-gradient-to-br from-violet-500/5 to-teal-500/5 dark:from-violet-500/10 dark:to-teal-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                  
                  {/* Icon container */}
                  <motion.div 
                    className="relative mb-4 w-12 h-12 rounded-xl bg-gradient-to-br from-violet-100 to-teal-100 dark:from-violet-500/20 dark:to-teal-500/20 flex items-center justify-center"
                    whileHover={{ scale: 1.1, rotate: 5 }}
                    transition={{ type: 'spring', stiffness: 300 }}
                  >
                    <Icon className="w-6 h-6 text-violet-600 dark:text-violet-400 group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors duration-300" />
                  </motion.div>
                  
                  {/* Content */}
                  <h3 className="relative text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-2 transition-colors">
                    {feature.title}
                  </h3>
                  <p className="relative text-sm text-zinc-600 dark:text-zinc-400 transition-colors">
                    {feature.description}
                  </p>
                  
                  {/* Bottom accent line */}
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-violet-500 to-teal-500 transform scale-x-0 group-hover:scale-x-100 transition-transform duration-500 origin-left" />
                </motion.div>
              </Link>
            </motion.div>
          );
        })}
      </div>
      
      {/* Quick Stats */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.6 }}
        className="mt-16 p-6 rounded-2xl bg-white border border-zinc-200 shadow-sm dark:bg-[hsl(var(--card))] dark:border-white/5 dark:shadow-none max-w-5xl mx-auto"
      >
        <h2 className="text-lg font-semibold text-zinc-800 dark:text-zinc-300 mb-6">Your Progress</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          <div>
            <p className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">{stats.totalSessions}</p>
            <p className="text-sm text-zinc-600 dark:text-zinc-500 mt-1">Recordings</p>
          </div>
          <div>
            <p className="text-3xl font-bold text-violet-600 dark:text-violet-400"><CreditsDisplay credits={user?.credits_remaining || 0} total={user?.credits_total ?? 60} compact={true} /></p>
            <p className="text-sm text-zinc-600 dark:text-zinc-500 mt-1">Credits Left</p>
          </div>
          <div>
            <p className="text-3xl font-bold text-teal-600 dark:text-teal-400">{stats.avgFillers}</p>
            <p className="text-sm text-zinc-600 dark:text-zinc-500 mt-1">Filler Words / Session</p>
          </div>
          <div>
            <p className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">{stats.avgWPM} WPM</p>
            <p className="text-sm text-zinc-600 dark:text-zinc-500 mt-1">Speaking Pace</p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}