import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Award, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function BadgeNotification({ badge, isOpen, onClose }) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            onClick={onClose}
          />
          
          {/* Notification Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 50 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 50 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md"
          >
            <div className="bg-white dark:bg-[hsl(var(--card))] rounded-3xl border border-violet-400 dark:border-violet-500/30 shadow-xl dark:shadow-none p-8 relative overflow-hidden">
              {/* Animated glow */}
              <motion.div
                animate={{ 
                  scale: [1, 1.2, 1],
                  opacity: [0.3, 0.5, 0.3],
                }}
                transition={{ duration: 2, repeat: Infinity }}
                className="absolute inset-0 bg-gradient-to-br from-violet-500/20 to-teal-500/20 blur-2xl"
              />
              
              <button
                onClick={onClose}
                className="absolute top-4 right-4 text-zinc-500 dark:text-zinc-500 hover:text-zinc-900 dark:hover:text-white z-10"
              >
                <X className="w-5 h-5" />
              </button>
              
              <div className="relative text-center">
                {/* Badge Icon */}
                <motion.div
                  animate={{ 
                    rotate: [0, -10, 10, -10, 0],
                    scale: [1, 1.1, 1]
                  }}
                  transition={{ duration: 0.5, delay: 0.2 }}
                  className="w-24 h-24 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-violet-500/30 to-teal-500/30 flex items-center justify-center"
                >
                  <Award className="w-12 h-12 text-violet-600 dark:text-violet-400" />
                </motion.div>
                
                <motion.h2
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mb-2"
                >
                  Achievement Unlocked!
                </motion.h2>
                
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.4 }}
                  className="text-lg text-violet-700 dark:text-violet-400 font-semibold mb-2"
                >
                  {badge?.title}
                </motion.p>
                
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.5 }}
                  className="text-zinc-700 dark:text-zinc-400 mb-6"
                >
                  {badge?.description}
                </motion.p>
                
                <Button
                  onClick={onClose}
                  className="bg-gradient-to-r from-violet-600 to-violet-500 hover:from-violet-500 hover:to-violet-400"
                >
                  Awesome!
                </Button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}