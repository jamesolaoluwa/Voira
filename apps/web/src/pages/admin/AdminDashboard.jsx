/**
 * Admin Dashboard Page
 * 
 * Overview page showing key metrics and recent activity.
 */

import React from 'react';
import { motion } from 'framer-motion';
import { 
  Users, 
  Mic, 
  FileText, 
  CreditCard,
  TrendingUp,
  TrendingDown,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { useAdminAnalytics } from '@/hooks/useAdminApi';

function StatCard({ title, value, icon: Icon, trend, trendLabel, color = 'violet' }) {
  const colorClasses = {
    violet: 'text-violet-600 dark:text-violet-400 bg-violet-500/10',
    teal: 'text-teal-600 dark:text-teal-400 bg-teal-500/10',
    amber: 'text-amber-600 dark:text-amber-400 bg-amber-500/10',
    blue: 'text-blue-600 dark:text-blue-400 bg-blue-500/10',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white dark:bg-[#1a1a24] rounded-2xl border border-zinc-200 dark:border-white/5 p-6"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-1">{title}</p>
          <p className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">
            {value?.toLocaleString() ?? '—'}
          </p>
          {trend !== undefined && (
            <div className="flex items-center gap-1 mt-2 text-sm">
              {trend >= 0 ? (
                <TrendingUp className="w-4 h-4 text-teal-500" />
              ) : (
                <TrendingDown className="w-4 h-4 text-red-500" />
              )}
              <span className={trend >= 0 ? 'text-teal-500' : 'text-red-500'}>
                {trend > 0 ? '+' : ''}{trend}%
              </span>
              <span className="text-zinc-400">{trendLabel}</span>
            </div>
          )}
        </div>
        <div className={`p-3 rounded-xl ${colorClasses[color]}`}>
          <Icon className="w-6 h-6" />
        </div>
      </div>
    </motion.div>
  );
}

export default function AdminDashboard() {
  const { data: analytics, isLoading, error } = useAdminAnalytics({ days: 30 });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <AlertCircle className="w-12 h-12 text-red-400" />
        <p className="text-zinc-600 dark:text-zinc-400">
          Failed to load analytics: {error.message}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">
          Dashboard
        </h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          Overview of system metrics and activity
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Users"
          value={analytics?.total_users}
          icon={Users}
          trend={analytics?.user_growth_percent}
          trendLabel="this month"
          color="violet"
        />
        <StatCard
          title="Active Users (30d)"
          value={analytics?.active_users_30d}
          icon={Users}
          color="teal"
        />
        <StatCard
          title="Total Sessions"
          value={analytics?.total_sessions}
          icon={Mic}
          color="blue"
        />
        <StatCard
          title="Total Credits Used"
          value={analytics?.total_credits_used}
          icon={CreditCard}
          color="amber"
        />
      </div>

      {/* Secondary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white dark:bg-[#1a1a24] rounded-2xl border border-zinc-200 dark:border-white/5 p-6"
        >
          <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-4">
            Sessions by Type
          </h3>
          <div className="space-y-3">
            {analytics?.sessions_by_type ? (
              Object.entries(analytics.sessions_by_type).map(([type, count]) => (
                <div key={type} className="flex items-center justify-between">
                  <span className="text-zinc-700 dark:text-zinc-300 capitalize">
                    {type.replace('_', ' ')}
                  </span>
                  <span className="text-zinc-900 dark:text-zinc-100 font-medium">
                    {count.toLocaleString()}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-zinc-400 text-sm">No data available</p>
            )}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="bg-white dark:bg-[#1a1a24] rounded-2xl border border-zinc-200 dark:border-white/5 p-6"
        >
          <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-4">
            User Breakdown
          </h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-zinc-700 dark:text-zinc-300">Free Users</span>
              <span className="text-zinc-900 dark:text-zinc-100 font-medium">
                {analytics?.free_users?.toLocaleString() ?? '—'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-zinc-700 dark:text-zinc-300">Premium Users</span>
              <span className="text-zinc-900 dark:text-zinc-100 font-medium">
                {analytics?.premium_users?.toLocaleString() ?? '—'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-zinc-700 dark:text-zinc-300">Disabled Accounts</span>
              <span className="text-zinc-900 dark:text-zinc-100 font-medium">
                {analytics?.disabled_users?.toLocaleString() ?? '—'}
              </span>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white dark:bg-[#1a1a24] rounded-2xl border border-zinc-200 dark:border-white/5 p-6"
        >
          <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-4">
            Drafts Overview
          </h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-zinc-700 dark:text-zinc-300">Total Drafts</span>
              <span className="text-zinc-900 dark:text-zinc-100 font-medium">
                {analytics?.total_drafts?.toLocaleString() ?? '—'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-zinc-700 dark:text-zinc-300">Avg per User</span>
              <span className="text-zinc-900 dark:text-zinc-100 font-medium">
                {analytics?.avg_drafts_per_user?.toFixed(1) ?? '—'}
              </span>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Period Note */}
      <p className="text-sm text-zinc-400 dark:text-zinc-500">
        Statistics are for the last 30 days. User growth is compared to the previous 30-day period.
      </p>
    </div>
  );
}
