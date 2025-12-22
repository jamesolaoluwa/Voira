import React from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Button } from '@/components/ui/button';
import { Crown, Lock, Sparkles } from 'lucide-react';

export default function PremiumGate({ 
  feature = 'feature',
  description = 'This feature is available for Premium users',
  children,
  isPremium = false,
  compact = false 
}) {
  if (isPremium) {
    return <>{children}</>;
  }

  if (compact) {
    return (
      <div className="relative">
        <div className="pointer-events-none blur-sm opacity-50">
          {children}
        </div>
        <div className="absolute inset-0 flex items-center justify-center">
          <Link to={createPageUrl('Pricing')}>
            <Button
              size="sm"
              className="bg-gradient-to-r from-violet-600 to-violet-500 hover:from-violet-500 hover:to-violet-400 shadow-lg"
            >
              <Crown className="w-4 h-4 mr-2" />
              Upgrade for {feature}
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-gradient-to-br from-violet-100 to-teal-100 dark:from-violet-500/10 dark:to-teal-500/10 rounded-2xl border border-violet-300 dark:border-violet-500/20 p-8 text-center"
    >
      <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-violet-500/20 to-teal-500/20 flex items-center justify-center">
        <Lock className="w-8 h-8 text-violet-600 dark:text-violet-400" />
      </div>
      
      <h3 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 mb-2 flex items-center justify-center gap-2">
        <Crown className="w-5 h-5 text-violet-600 dark:text-violet-400" />
        Premium Feature
      </h3>
      
      <p className="text-zinc-700 dark:text-zinc-400 mb-6 max-w-md mx-auto">
        {description}
      </p>
      
      <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
        <Link to={createPageUrl('Pricing')}>
          <Button className="bg-gradient-to-r from-violet-600 to-violet-500 hover:from-violet-500 hover:to-violet-400">
            <Sparkles className="w-4 h-4 mr-2" />
            Upgrade to Premium
          </Button>
        </Link>
        <p className="text-xs text-zinc-600 dark:text-zinc-500">
          From $9.99/month
        </p>
      </div>
    </motion.div>
  );
}