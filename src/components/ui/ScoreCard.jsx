import React from 'react';
import { motion } from 'framer-motion';

export default function ScoreCard({ label, value, maxValue = 100, color = 'violet', delay = 0 }) {
  const percentage = (value / maxValue) * 100;
  
  const colorClasses = {
    violet: 'from-violet-500 to-violet-600',
    teal: 'from-teal-500 to-teal-600',
    amber: 'from-amber-500 to-amber-600',
    rose: 'from-rose-500 to-rose-600',
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, delay }}
      className="bg-white dark:bg-[#1a1a24] rounded-xl p-4 border border-zinc-200 dark:border-white/5 shadow-sm dark:shadow-none"
    >
      <p className="text-zinc-600 dark:text-zinc-500 text-sm mb-2">{label}</p>
      <div className="flex items-end gap-2 mb-3">
        <span className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{value}</span>
        <span className="text-zinc-500 dark:text-zinc-600 text-sm mb-1">/ {maxValue}</span>
      </div>
      <div className="h-2 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
        <motion.div
          className={`h-full rounded-full bg-gradient-to-r ${colorClasses[color]}`}
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.8, delay: delay + 0.2, ease: 'easeOut' }}
        />
      </div>
    </motion.div>
  );
}