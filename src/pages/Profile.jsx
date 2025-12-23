import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { 
  Crown, 
  Calendar, 
  TrendingUp, 
  Clock, 
  Target,
  Zap,
  Library,
  CreditCard,
  Settings,
  Download,
  Award
} from 'lucide-react';
import BadgeCard from '@/components/badges/BadgeCard';

export default function Profile() {
  const { user: authUser, isLoading, isAdmin } = useAuth();

  // Derive display values from authUser (populated by AuthContext)
  const displayName = authUser?.full_name || authUser?.email || 'User';
  const email = authUser?.email || '—';
  const avatar = authUser?.avatar || null;
  const creditsRemaining = authUser?.credits_remaining ?? 0;
  const totalCredits = authUser?.credits_total ?? 60;
  const resetDate = authUser?.credits_reset_at ? new Date(authUser.credits_reset_at).toLocaleDateString() : '—';
  const plan = isAdmin ? 'Premium' : (authUser?.role === 'premium_user' ? 'Premium' : 'Free');

  const stats = [
    { label: 'Sessions Completed', value: '24', icon: Library, color: 'violet' },
    { label: 'Hours Practiced', value: '8.5h', icon: Clock, color: 'teal' },
    { label: 'Avg. Confidence', value: '82%', icon: TrendingUp, color: 'green' },
    { label: 'Filler Reduction', value: '-45%', icon: Target, color: 'amber' },
  ];

  const quickActions = [
    { label: 'View Library', icon: Library, href: 'Library' },
    { label: 'Manage Plan', icon: CreditCard, href: 'Pricing' },
    { label: 'Edit Voice Profile', icon: Settings, href: 'VoiceProfile' },
    { label: 'Download Data', icon: Download, href: '#' },
  ];

  const recentBadges = [
    {
      badge_type: 'first_session',
      title: 'First Steps',
      description: 'Completed your first session',
      icon_color: 'violet',
      earned_date: '2024-01-15T10:30:00Z'
    },
    {
      badge_type: '5_sessions',
      title: 'Getting Started',
      description: 'Completed 5 practice sessions',
      icon_color: 'teal',
      earned_date: '2024-01-20T14:20:00Z'
    },
    {
      badge_type: 'confidence_70',
      title: 'Confident Speaker',
      description: 'Reached 70% confidence score',
      icon_color: 'amber',
      earned_date: '2024-01-22T09:15:00Z'
    },
  ];

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-[#0a0a0f] p-6 lg:p-10">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Profile Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white dark:bg-[hsl(var(--card))] rounded-2xl border border-zinc-200 dark:border-white/5 shadow-md dark:shadow-none p-8"
        >
          <div className="flex flex-col sm:flex-row items-center gap-6">
            <div className="relative">
              <Avatar className="w-24 h-24">
                <AvatarImage src={user.avatar} />
                <AvatarFallback className="bg-gradient-to-br from-violet-500 to-teal-500 text-white text-2xl">
                  {user.name.split(' ').map(n => n[0]).join('')}
                </AvatarFallback>
              </Avatar>
              <button className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-violet-500 hover:bg-violet-600 flex items-center justify-center text-white text-xs transition-colors">
                ✎
              </button>
            </div>
            
            <div className="flex-1 text-center sm:text-left">
              <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mb-1">{displayName}</h1>
              <p className="text-zinc-600 dark:text-zinc-500 mb-3">{email}</p>
              <Badge className={`${
                plan === 'Premium' 
                  ? 'bg-gradient-to-r from-violet-500 to-purple-500 text-white' 
                  : 'bg-zinc-300 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-400'
              }`}>
                {plan === 'Premium' && <Crown className="w-3 h-3 mr-1" />}
                {plan} Plan
              </Badge>
            </div>
          </div>
        </motion.div>

        <div className="h-px bg-gradient-to-r from-transparent via-zinc-300 dark:via-white/10 to-transparent" />

        {/* Account Status Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-gradient-to-br from-violet-500/10 to-purple-500/10 rounded-2xl border border-violet-500/20 p-6"
        >
          <div className="flex items-start justify-between mb-6">
            <div>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-1">Account Status</h2>
              <p className="text-sm text-zinc-700 dark:text-zinc-400">Manage your plan and usage</p>
            </div>
            {!isAdmin && plan === 'Free' && (
              <Link to={createPageUrl('Pricing')}>
                <Button className="bg-gradient-to-r from-violet-600 to-violet-500 hover:from-violet-500 hover:to-violet-400">
                  <Crown className="w-4 h-4 mr-2" />
                  Upgrade to Premium
                </Button>
              </Link>
            )}
          </div>

          <div className="grid sm:grid-cols-3 gap-4">
            <div className="bg-violet-100/50 dark:bg-[#1a1a24]/50 rounded-xl p-4 border border-violet-200 dark:border-transparent">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                <span className="text-xs text-zinc-600 dark:text-zinc-500">Credits</span>
              </div>
              <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                {creditsRemaining}
                <span className="text-sm font-normal text-zinc-600 dark:text-zinc-500"> / {totalCredits}</span>
              </p>
            </div>

            <div className="bg-teal-100/50 dark:bg-[#1a1a24]/50 rounded-xl p-4 border border-teal-200 dark:border-transparent">
              <div className="flex items-center gap-2 mb-2">
                <Calendar className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                <span className="text-xs text-zinc-600 dark:text-zinc-500">Resets</span>
              </div>
              <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">{resetDate}</p>
            </div>

            <div className="bg-amber-100/50 dark:bg-[#1a1a24]/50 rounded-xl p-4 border border-amber-200 dark:border-transparent">
              <div className="flex items-center gap-2 mb-2">
                <Crown className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                <span className="text-xs text-zinc-600 dark:text-zinc-500">Plan</span>
              </div>
              <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">{plan}</p>
            </div>
          </div>
        </motion.div>

        {/* Usage Summary */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-4">Usage Summary</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {stats.map((stat, index) => {
              const Icon = stat.icon;
              const colorClasses = {
                violet: 'from-violet-500/20 to-violet-500/10 border-violet-500/20',
                teal: 'from-teal-500/20 to-teal-500/10 border-teal-500/20',
                green: 'from-green-500/20 to-green-500/10 border-green-500/20',
                amber: 'from-amber-500/20 to-amber-500/10 border-amber-500/20',
              };
              
              return (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.3 + index * 0.1 }}
                  className={`bg-gradient-to-br ${colorClasses[stat.color]} rounded-xl border p-5`}
                >
                  <Icon className={`w-5 h-5 text-${stat.color}-600 dark:text-${stat.color}-400 mb-3`} />
                  <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mb-1">{stat.value}</p>
                  <p className="text-xs text-zinc-600 dark:text-zinc-500">{stat.label}</p>
                </motion.div>
              );
            })}
          </div>
        </motion.div>

        {/* Quick Actions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-4">Quick Actions</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <Link key={action.label} to={createPageUrl(action.href)}>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="w-full bg-white dark:bg-[hsl(var(--card))] hover:bg-zinc-50 dark:hover:bg-[hsl(var(--card))]/80 rounded-xl border border-zinc-200 dark:border-white/5 shadow-sm dark:shadow-none p-4 flex items-center gap-3 transition-colors"
                  >
                    <div className="w-10 h-10 rounded-lg bg-violet-500/10 flex items-center justify-center">
                      <Icon className="w-5 h-5 text-violet-600 dark:text-violet-400" />
                    </div>
                    <span className="text-zinc-800 dark:text-zinc-300 font-medium">{action.label}</span>
                  </motion.button>
                </Link>
              );
            })}
          </div>
        </motion.div>

        {/* Recent Badges */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="bg-white dark:bg-[hsl(var(--card))] rounded-2xl border border-zinc-200 dark:border-white/5 shadow-md dark:shadow-none p-8"
        >
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              <Award className="w-5 h-5 text-violet-600 dark:text-violet-400" />
              Recent Achievements
            </h2>
            <Button
              variant="ghost"
              size="sm"
              className="text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300"
            >
              View All
            </Button>
          </div>
          
          <div className="grid sm:grid-cols-3 gap-4">
            {recentBadges.map((badge, index) => (
              <BadgeCard key={index} badge={badge} size="default" showDate={false} />
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}