import React, { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { 
  Check, 
  Crown, 
  Sparkles, 
  Calendar,
  TrendingUp,
  Loader2,
  ExternalLink,
  AlertCircle,
  CheckCircle
} from 'lucide-react';
import CreditsDisplay from '@/components/ui/CreditsDisplay';
import { useAuth } from '@/contexts/AuthContext';
import { billing } from '@/components/services/api';
import { STRIPE_PRICES, isStripeConfigured, DEFAULT_USER_CREDITS, PRO_USER_CREDITS } from '@/config/constants';
import { useToast } from '@/components/ui/use-toast';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';

const billingToggleActiveClass =
  'bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border border-zinc-300 dark:border-white/10';

const primaryCtaClass =
  'bg-primary text-primary-foreground hover:bg-primary/90';

export default function Pricing() {
  const [billingCycle, setBillingCycle] = useState('monthly');
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [subscriptionStatus, setSubscriptionStatus] = useState(null);
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const { user: authUser, refreshUser, session, isLoading: authLoading } = useAuth();

  // Load subscription status from backend
  const loadSubscriptionStatus = useCallback(async () => {
    try {
      const status = await billing.getSubscriptionStatus();
      setSubscriptionStatus(status);
    } catch (error) {
      console.error('Failed to load subscription status:', error);
    }
  }, []);

  // Check for success/canceled params from Stripe redirect
  useEffect(() => {
    if (searchParams.get('success') === 'true') {
      toast({
        title: 'Payment successful!',
        description: 'Welcome to Pro! Your subscription is now active.',
        duration: 5000,
      });
      // Reload subscription status and refresh user profile to get updated credits
      loadSubscriptionStatus();
      refreshUser?.();
    } else if (searchParams.get('canceled') === 'true') {
      toast({
        title: 'Checkout canceled',
        description: 'No worries! You can upgrade anytime.',
        variant: 'default',
        duration: 3000,
      });
    }
  }, [searchParams, toast, loadSubscriptionStatus, refreshUser]);

  const plans = {
    free: {
      name: 'Free',
      subtitle: 'For getting comfortable expressing yourself',
      price: { monthly: 0, yearly: 0 },
      credits: DEFAULT_USER_CREDITS,
      features: [
        `${DEFAULT_USER_CREDITS} credits per month`,
        'Core voice cleanup (fillers, clarity)',
        'Practice Mode (limited sessions)',
        'Library access',
        'Voice Profile basics',
      ],
      footnote: 'You can upgrade anytime.',
    },
    premium: {
      name: 'Pro',
      subtitle: 'For clarity, confidence, and real growth',
      price: { monthly: 9.99, yearly: 79 },
      credits: PRO_USER_CREDITS,
      features: [
        `${PRO_USER_CREDITS} credits per month`,
        'Advanced confidence & emotional analysis',
        'Full Practice Mode with coaching feedback',
        'Voice Profile that learns over time',
        'Priority processing',
        'Session insights & progress tracking',
      ],
      footnote: 'Built for students, professionals, and storytellers.',
    },
  };

  useEffect(() => {
    if (authUser && session && !authLoading) {
      loadSubscriptionStatus();
    }
  }, [authUser, session, authLoading, loadSubscriptionStatus]);

  // Determine current plan from subscription status
  const currentPlan = subscriptionStatus?.plan === 'free' || !subscriptionStatus?.plan 
    ? 'free' 
    : 'premium';
  
  const isProUser = subscriptionStatus?.plan?.startsWith('pro_');
  const cancelAtPeriodEnd = subscriptionStatus?.cancel_at_period_end;

  const usage = {
    creditsRemaining: subscriptionStatus?.credits_remaining ?? authUser?.credits_remaining ?? DEFAULT_USER_CREDITS,
    totalCredits: subscriptionStatus?.monthly_credit_allowance ?? authUser?.monthly_credit_allowance ?? DEFAULT_USER_CREDITS,
    sessionsUsed: 0, // Could be computed from sessions API
    resetDate: subscriptionStatus?.current_period_end 
      ? new Date(subscriptionStatus.current_period_end).toLocaleDateString() 
      : (authUser?.credits_reset_at ? new Date(authUser.credits_reset_at).toLocaleDateString() : '—'),
  };

  const handleUpgrade = async () => {
    if (!session) {
      navigate('/auth', { state: { from: location }, replace: false });
      return;
    }
    if (!isStripeConfigured()) {
      toast({
        title: 'Billing not configured',
        description: 'Please contact support to upgrade your plan.',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    try {
      const priceId = billingCycle === 'monthly' 
        ? STRIPE_PRICES.PRO_MONTHLY 
        : STRIPE_PRICES.PRO_YEARLY;
      
      const { checkout_url } = await billing.createCheckoutSession(priceId);
      
      // Redirect to Stripe Checkout
      window.location.href = checkout_url;
    } catch (error) {
      console.error('Checkout error:', error);
      toast({
        title: 'Checkout failed',
        description: error.message || 'Please try again.',
        variant: 'destructive',
      });
      setIsLoading(false);
    }
  };

  const handleManageSubscription = async () => {
    if (!session) {
      navigate('/auth', { state: { from: location }, replace: false });
      return;
    }
    setIsLoading(true);
    try {
      const { portal_url } = await billing.createPortalSession();
      window.location.href = portal_url;
    } catch (error) {
      console.error('Portal error:', error);
      toast({
        title: 'Failed to open billing portal',
        description: error.message || 'Please try again.',
        variant: 'destructive',
      });
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-[#0D0D12] p-6 lg:p-10">
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
                ? billingToggleActiveClass
                : 'text-zinc-600 dark:text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300'
            }`}
          >
            Monthly
          </button>
          <button
            onClick={() => setBillingCycle('yearly')}
            className={`px-6 py-2 rounded-full text-sm font-medium transition-all ${
              billingCycle === 'yearly'
                ? billingToggleActiveClass
                : 'text-zinc-600 dark:text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300'
            }`}
          >
            Yearly
            <span className="ml-2 text-xs text-zinc-600 dark:text-zinc-400">Save 17%</span>
          </button>
        </motion.div>

        {/* Plan Cards */}
        <div className="grid md:grid-cols-2 gap-6 mb-12">
          {/* Free Plan */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white dark:bg-[#1a1a24] rounded-2xl border border-zinc-200 dark:border-white/5 shadow-md dark:shadow-none p-8"
          >
            <div className="mb-6">
              <h3 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mb-1">Free</h3>
              <p className="text-sm text-zinc-600 dark:text-zinc-500 mb-4">{plans.free.subtitle}</p>
              <div className="flex items-baseline gap-2 mb-4">
                <span className="text-4xl font-bold text-zinc-900 dark:text-zinc-100">$0</span>
                <span className="text-zinc-600 dark:text-zinc-500">/ month</span>
              </div>
              {currentPlan === 'free' && (
                <Badge className="bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-300 dark:border-white/10">
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
            className="relative bg-white dark:bg-[#1a1a24] rounded-2xl border border-zinc-300 dark:border-white/10 shadow-md dark:shadow-none p-8"
          >
            {!isProUser && (
              <Badge className={`absolute top-4 right-4 ${primaryCtaClass}`}>
                <Sparkles className="w-3 h-3 mr-1" />
                Recommended
              </Badge>
            )}
            {isProUser && (
              <Badge className="absolute top-4 right-4 bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-300 dark:border-white/10">
                <CheckCircle className="w-3 h-3 mr-1" />
                Active
              </Badge>
            )}

            <div className="mb-6">
              <h3 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mb-1 flex items-center gap-2">
                <Crown className="w-6 h-6 text-zinc-600 dark:text-zinc-400" />
                Pro
              </h3>
              <p className="text-sm text-zinc-600 dark:text-zinc-500 mb-4">{plans.premium.subtitle}</p>
              <div className="flex items-baseline gap-2 mb-4">
                <span className="text-4xl font-bold text-zinc-900 dark:text-zinc-100">
                  ${billingCycle === 'monthly' ? plans.premium.price.monthly : plans.premium.price.yearly}
                </span>
                <span className="text-zinc-600 dark:text-zinc-500">
                  / {billingCycle === 'monthly' ? 'month' : 'year'}
                </span>
              </div>
              {cancelAtPeriodEnd && (
                <div className="flex items-center gap-2 text-amber-500 text-sm">
                  <AlertCircle className="w-4 h-4" />
                  <span>Cancels at period end</span>
                </div>
              )}
            </div>

            <ul className="space-y-3 mb-8">
              {plans.premium.features.map((feature, index) => (
                <li key={index} className="flex items-start gap-3 text-zinc-700 dark:text-zinc-400 text-sm">
                  <Check className="w-5 h-5 text-zinc-500 dark:text-zinc-400 shrink-0 mt-0.5" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>

            {isProUser ? (
              <Button
                onClick={handleManageSubscription}
                disabled={isLoading}
                variant="outline"
                className="w-full h-12 border-zinc-300 dark:border-white/10 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/5 mb-3"
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <ExternalLink className="w-4 h-4 mr-2" />
                )}
                Manage Subscription
              </Button>
            ) : (
              <Button
                onClick={handleUpgrade}
                disabled={isLoading}
                className={`w-full h-12 ${primaryCtaClass} mb-3`}
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Crown className="w-4 h-4 mr-2" />
                )}
                Upgrade to Pro
              </Button>
            )}
            <p className="text-xs text-center text-zinc-500 dark:text-zinc-600">{plans.premium.footnote}</p>
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
              <CreditsDisplay credits={usage.creditsRemaining} total={usage.totalCredits} compact={false} showWarning />
            </div>

            <div>
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-4 h-4 text-zinc-600 dark:text-zinc-400" />
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
    </div>
  );
}
