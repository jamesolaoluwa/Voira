import React from 'react';
import { motion } from 'framer-motion';
import { 
  Award, 
  Zap, 
  Target, 
  TrendingUp, 
  Flame,
  Star,
  Mic,
  Sparkles 
} from 'lucide-react';

const badgeIcons = {
  first_session: Award,
  '5_sessions': Target,
  '10_sessions': Star,
  confidence_70: TrendingUp,
  confidence_85: Sparkles,
  week_streak: Flame,
  month_streak: Flame,
  clarity_master: Zap,
  practice_pro: Mic,
  voice_refined: Sparkles,
  filler_free: Target,
  early_adopter: Award,
};

const colorStyles = {
  violet: 'bg-white border border-zinc-200 shadow-sm text-violet-600 dark:bg-gradient-to-br dark:from-violet-500/20 dark:to-violet-600/10 dark:border-violet-500/30 dark:text-violet-400 dark:shadow-none',
  teal: 'bg-white border border-zinc-200 shadow-sm text-teal-600 dark:bg-gradient-to-br dark:from-teal-500/20 dark:to-teal-600/10 dark:border-teal-500/30 dark:text-teal-400 dark:shadow-none',
  amber: 'bg-white border border-zinc-200 shadow-sm text-amber-600 dark:bg-gradient-to-br dark:from-amber-500/20 dark:to-amber-600/10 dark:border-amber-500/30 dark:text-amber-400 dark:shadow-none',
  rose: 'bg-white border border-zinc-200 shadow-sm text-rose-600 dark:bg-gradient-to-br dark:from-rose-500/20 dark:to-rose-600/10 dark:border-rose-500/30 dark:text-rose-400 dark:shadow-none',
  emerald: 'bg-white border border-zinc-200 shadow-sm text-emerald-600 dark:bg-gradient-to-br dark:from-emerald-500/20 dark:to-emerald-600/10 dark:border-emerald-500/30 dark:text-emerald-400 dark:shadow-none',
};

export default function BadgeCard({ badge, size = 'default', showDate = true }) {
  const Icon = badgeIcons[badge.badge_type] || Award;
  const colorClass = colorStyles[badge.icon_color] || colorStyles.violet;
  
  if (size === 'compact') {
    return (
      <motion.div
        whileHover={{ scale: 1.05, y: -2 }}
        className={`group relative bg-gradient-to-br ${colorClass} rounded-xl border p-3 cursor-pointer`}
      >
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4" />
          <span className="text-xs font-medium text-zinc-800 dark:text-zinc-200">{badge.title}</span>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ scale: 1.05, y: -4 }}
      className={`group relative ${colorClass} rounded-2xl p-6 cursor-pointer overflow-hidden`}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent dark:from-white/5 dark:to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      
      <div className="relative">
        <div className="w-14 h-14 rounded-xl bg-white/50 dark:bg-white/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
          <Icon className="w-7 h-7" />
        </div>
        
        <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-1">{badge.title}</h3>
        <p className="text-sm text-zinc-700 dark:text-zinc-400 mb-3">{badge.description}</p>
        
        {showDate && badge.earned_date && (
          <p className="text-xs text-zinc-600 dark:text-zinc-500">
            Earned {new Date(badge.earned_date).toLocaleDateString()}
          </p>
        )}
      </div>
    </motion.div>
  );
}