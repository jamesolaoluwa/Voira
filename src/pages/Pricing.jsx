import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { 
  Check, 
  Crown, 
  Sparkles, 
  Zap,
  Calendar,
  TrendingUp
} from 'lucide-react';

export default function Pricing() {
  const [billingCycle, setBillingCycle] = useState('monthly');
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [isUpgraded, setIsUpgraded] = useState(false);

  const currentPlan = 'free'; // Would come from user context

  const plans = {
    free: {
      name: 'Free',
      subtitle: 'For getting comfortable expressing yourself',
      price: { monthly: 0, yearly: 0 },
      credits: 60,
      features: [
        '60 credits per month',
        'Core voice cleanup (fillers, clarity)',
        'Practice Mode (limited sessions)',
        'Library access',
        'Voice Profile basics',
      ],
      footnote: 'You can upgrade anytime.',
    },
    premium: {
      name: 'Premium',
      subtitle: 'For clarity, confidence, and real growth',
      price: { monthly: 9.99, yearly: 79 },
      credits: 'Unlimited',
      features: [
        'Higher or unlimited credits',
        'Advanced confidence & emotional analysis',
        'Full Practice Mode with coaching feedback',
        'Voice Profile that learns over time',
        'Priority processing',
        'Session insights & progress tracking',
      ],
      footnote: 'Built for students, professionals, and storytellers.',
    },
  };

  const usage = {
    creditsRemaining: 45,
    totalCredits: 200,
    sessionsUsed: 12,
    resetDate: 'Jan 1, 2025',
  };

  const handleUpgrade = () => {
    setShowUpgradeModal(true);
  };

  const confirmUpgrade = () => {
    setIsUpgraded(true);
    setTimeout(() => {
      setShowUpgradeModal(false);
      setIsUpgraded(false);
    }, 2000);
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-[#0a0a0f] p-6 lg:p-10">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12"
        >
          <h1 className="text-3xl lg:text-4xl font-bold text-zinc-900 dark:text-zinc-100 mb-3">
            Choose the plan that fits your voice
          </h1>
          <p className="text-zinc-600 dark:text-zinc-500 text-lg">
            Start free. Upgrade when you want deeper refinement.
          </p>
        </motion.div>

        {/* Billing Toggle */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="flex items-center justify-center gap-3 mb-12"
        >
          <button
            onClick={() => setBillingCycle('monthly')}
            className={`px-6 py-2 rounded-full text-sm font-medium transition-all ${
              billingCycle === 'monthly'
                ? 'bg-violet-500/20 text-violet-700 dark:text-violet-300 border border-violet-500/30'
                : 'text-zinc-600 dark:text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300'
            }`}
          >
            Monthly
          </button>
          <button
            onClick={() => setBillingCycle('yearly')}
            className={`px-6 py-2 rounded-full text-sm font-medium transition-all ${
              billingCycle === 'yearly'
                ? 'bg-violet-500/20 text-violet-700 dark:text-violet-300 border border-violet-500/30'
                : 'text-zinc-600 dark:text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300'
            }`}
          >
            Yearly
            <span className="ml-2 text-xs text-teal-400">Save 17%</span>
          </button>
        </motion.div>

        {/* Plan Cards */}
        <div className="grid md:grid-cols-2 gap-6 mb-12">
          {/* Free Plan */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white dark:bg-gradient-to-br dark:from-[#1a1a24] dark:to-[#13131a] rounded-2xl border border-zinc-200 dark:border-white/5 shadow-md dark:shadow-none p-8"
          >
            <div className="mb-6">
              <h3 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mb-1">Free</h3>
              <p className="text-sm text-zinc-600 dark:text-zinc-500 mb-4">{plans.free.subtitle}</p>
              <div className="flex items-baseline gap-2 mb-4">
                <span className="text-4xl font-bold text-zinc-900 dark:text-zinc-100">$0</span>
                <span className="text-zinc-600 dark:text-zinc-500">/ month</span>
              </div>
              {currentPlan === 'free' && (
                <Badge className="bg-teal-500/20 text-teal-400 border-teal-500/30">
                  Current Plan
                </Badge>
              )}
            </div>

            <ul className="space-y-3 mb-8">
              {plans.free.features.map((feature, index) => (
                <li key={index} className="flex items-start gap-3 text-zinc-700 dark:text-zinc-400 text-sm">
                  <Check className="w-5 h-5 text-zinc-500 dark:text-zinc-600 shrink-0 mt-0.5" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>

            <Button
              disabled
              className="w-full h-12 bg-zinc-300 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-600 cursor-not-allowed mb-3"
            >
              Current Plan
            </Button>
            <p className="text-xs text-center text-zinc-500 dark:text-zinc-600">{plans.free.footnote}</p>
          </motion.div>

          {/* Premium Plan */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="relative bg-gradient-to-br from-violet-500/10 to-purple-500/10 rounded-2xl border border-violet-500/30 p-8 shadow-xl shadow-violet-500/10"
          >
            <Badge className="absolute top-4 right-4 bg-gradient-to-r from-violet-500 to-purple-500 text-white">
              <Sparkles className="w-3 h-3 mr-1" />
              Recommended
            </Badge>

            <div className="mb-6">
              <h3 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mb-1 flex items-center gap-2">
                <Crown className="w-6 h-6 text-violet-600 dark:text-violet-400" />
                Premium
              </h3>
              <p className="text-sm text-zinc-700 dark:text-zinc-500 mb-4">{plans.premium.subtitle}</p>
              <div className="flex items-baseline gap-2 mb-4">
                <span className="text-4xl font-bold text-zinc-900 dark:text-zinc-100">
                  ${billingCycle === 'monthly' ? plans.premium.price.monthly : plans.premium.price.yearly}
                </span>
                <span className="text-zinc-700 dark:text-zinc-500">
                  / {billingCycle === 'monthly' ? 'month' : 'year'}
                </span>
              </div>
            </div>

            <ul className="space-y-3 mb-8">
              {plans.premium.features.map((feature, index) => (
                <li key={index} className="flex items-start gap-3 text-zinc-800 dark:text-zinc-300 text-sm">
                  <Check className="w-5 h-5 text-violet-600 dark:text-violet-400 shrink-0 mt-0.5" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>

            <Button
              onClick={handleUpgrade}
              className="w-full h-12 bg-gradient-to-r from-violet-600 to-violet-500 hover:from-violet-500 hover:to-violet-400 text-white mb-3"
            >
              <Crown className="w-4 h-4 mr-2" />
              Upgrade to Premium
            </Button>
            <p className="text-xs text-center text-zinc-600 dark:text-zinc-600">{plans.premium.footnote}</p>
          </motion.div>
        </div>

        {/* Current Usage Panel */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-white dark:bg-[#1a1a24] rounded-2xl border border-zinc-200 dark:border-white/5 shadow-sm dark:shadow-none p-6"
        >
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-6">Your Usage</h3>
          <div className="grid sm:grid-cols-3 gap-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Zap className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                <span className="text-sm text-zinc-600 dark:text-zinc-500">Credits Remaining</span>
              </div>
              <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                {usage.creditsRemaining}
                <span className="text-sm font-normal text-zinc-600 dark:text-zinc-500"> / {usage.totalCredits}</span>
              </p>
              <div className="mt-2 h-2 bg-zinc-800 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${(usage.creditsRemaining / usage.totalCredits) * 100}%` }}
                  transition={{ duration: 0.8, ease: 'easeOut' }}
                  className="h-full bg-gradient-to-r from-violet-500 to-purple-500"
                />
              </div>
              {usage.creditsRemaining < 20 && (
                <p className="text-xs text-amber-400 mt-2">
                  Running low? Premium gives you more room to practice.
                </p>
              )}
            </div>

            <div>
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                <span className="text-sm text-zinc-600 dark:text-zinc-500">Sessions Used</span>
              </div>
              <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{usage.sessionsUsed}</p>
              <p className="text-xs text-zinc-500 dark:text-zinc-600 mt-2">This month</p>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-2">
                <Calendar className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                <span className="text-sm text-zinc-600 dark:text-zinc-500">Reset Date</span>
              </div>
              <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">{usage.resetDate}</p>
              <p className="text-xs text-zinc-500 dark:text-zinc-600 mt-2">Credits renew</p>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Upgrade Modal */}
      <Dialog open={showUpgradeModal} onOpenChange={setShowUpgradeModal}>
        <DialogContent className="bg-[#1a1a24] border-white/10 max-w-md">
          <AnimatePresence mode="wait">
            {isUpgraded ? (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="text-center py-8"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                  className="w-20 h-20 rounded-full bg-gradient-to-br from-violet-500 to-purple-500 flex items-center justify-center mx-auto mb-6"
                >
                  <Crown className="w-10 h-10 text-white" />
                </motion.div>
                <h3 className="text-2xl font-bold text-zinc-100 mb-2">Welcome to Premium!</h3>
                <p className="text-zinc-400">Your account has been upgraded</p>
              </motion.div>
            ) : (
              <motion.div
                key="confirm"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <DialogHeader>
                  <DialogTitle className="text-zinc-100 flex items-center gap-2">
                    <Crown className="w-5 h-5 text-violet-400" />
                    Confirm Upgrade
                  </DialogTitle>
                </DialogHeader>

                <div className="mt-6 space-y-4">
                  <div className="bg-[#13131a] rounded-xl p-4 border border-violet-500/20">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-zinc-400">Plan</span>
                      <span className="font-semibold text-zinc-100">Premium</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-400">Price</span>
                      <span className="font-semibold text-zinc-100">
                        ${billingCycle === 'monthly' ? plans.premium.price.monthly : plans.premium.price.yearly}
                        /{billingCycle === 'monthly' ? 'mo' : 'yr'}
                      </span>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <Button
                      variant="outline"
                      onClick={() => setShowUpgradeModal(false)}
                      className="flex-1 border-white/10 text-zinc-400 hover:bg-white/5"
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={confirmUpgrade}
                      className="flex-1 bg-gradient-to-r from-violet-600 to-violet-500 hover:from-violet-500 hover:to-violet-400"
                    >
                      Confirm Upgrade
                    </Button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </DialogContent>
      </Dialog>
    </div>
  );
}