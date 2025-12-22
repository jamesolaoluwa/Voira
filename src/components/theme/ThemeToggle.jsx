import React from 'react';
import { motion } from 'framer-motion';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from './ThemeProvider';

export default function ThemeToggle({ showLabel = false }) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      onClick={toggleTheme}
      className="relative flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-200 dark:bg-zinc-800/50 hover:bg-zinc-300 dark:hover:bg-zinc-700/50 transition-colors"
      aria-label="Toggle theme"
    >
      <motion.div
        className="relative w-10 h-6 rounded-full"
        animate={{ backgroundColor: isDark ? '#3f3f46' : '#d4d4d8' }}
        transition={{ duration: 0.3 }}
      >
        <motion.div
          className="absolute top-1 left-1 w-4 h-4 rounded-full flex items-center justify-center"
          animate={{
            x: isDark ? 0 : 16,
            backgroundColor: isDark ? '#8B5CF6' : '#f59e0b'
          }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        >
          {isDark ? (
            <Moon className="w-3 h-3 text-white" />
          ) : (
            <Sun className="w-3 h-3 text-white" />
          )}
        </motion.div>
      </motion.div>
      
      {showLabel && (
        <span className="text-sm text-zinc-600 dark:text-zinc-400">
          {isDark ? 'Dark' : 'Light'}
        </span>
      )}
    </button>
  );
}