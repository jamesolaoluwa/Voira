import React from 'react';
import { motion } from 'framer-motion';
import { Zap } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

export default function CreditsDisplay({ 
  credits = 45, 
  total = 60, 
  compact = false,
  showWarning = true 
}) {
  const { isAdmin } = useAuth();

  // Admin users see unlimited credits
  if (isAdmin) {
    if (compact) {
      return (
        <div className="inline-flex w-max items-center gap-2 px-3 py-1.5 bg-white dark:bg-[hsl(var(--card))] rounded-full border border-zinc-200 dark:border-white/5 shadow-sm dark:shadow-none">
          <Zap className={`w-3 h-3 text-violet-600 dark:text-violet-400`} />
          <span className="text-xs text-zinc-600 dark:text-zinc-400">Unlimited</span>
        </div>
      );
    }

    return (
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Zap className={`w-4 h-4 text-violet-400`} />
            <span className="text-sm text-zinc-400">Credits</span>
          </div>
          <span className="text-sm font-medium px-3 py-0.5 rounded-full bg-zinc-50 dark:bg-transparent text-zinc-700 dark:text-zinc-300">Unlimited</span>
        </div>
      </div>
    );
  }

  const percentage = (credits / total) * 100;
  const isLow = credits < 20;

  if (compact) {
    return (
      <div className="inline-flex w-max items-center gap-2 px-3 py-1.5 bg-white dark:bg-[hsl(var(--card))] rounded-full border border-zinc-200 dark:border-white/5 shadow-sm dark:shadow-none">
        <Zap className={`w-3 h-3 ${isLow ? 'text-amber-400' : 'text-violet-600 dark:text-violet-400'}`} />
        <span className="text-xs text-zinc-600 dark:text-zinc-400">
          {credits} / {total}
        </span>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Zap className={`w-4 h-4 ${isLow ? 'text-amber-400' : 'text-violet-400'}`} />
          <span className="text-sm text-zinc-400">Credits</span>
        </div>
        <span className="text-sm font-medium text-zinc-300">
          {credits} / {total}
        </span>
      </div>
      <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className={`h-full ${
            isLow 
              ? 'bg-gradient-to-r from-amber-500 to-amber-400' 
              : 'bg-gradient-to-r from-violet-500 to-purple-500'
          }`}
        />
      </div>
      {showWarning && isLow && (
        <p className="text-xs text-amber-400 mt-2">
          Running low? Premium gives you more room to practice.
        </p>
      )}
    </div>
  );
}