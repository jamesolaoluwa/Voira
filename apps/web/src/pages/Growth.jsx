import React from 'react';
import { motion } from 'framer-motion';
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import useSessionStore from '@/stores/useSessionStore';
import { TrendingUp, TrendingDown, Award, Mic, Sparkles, AlertCircle, Info } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Button } from '@/components/ui/button';

// Import v3 analytics utilities (SINGLE SOURCE OF TRUTH)
import {
  computeGrowthStats,
  prepareChartData,
  DEFAULT_BASELINE,
  isReliable,
  getReliabilityLabel,
} from '@/lib/analytics';

/**
 * Custom Tooltip for charts with reliability indicator.
 */
const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const reliability = data.reliability;
    
    return (
      <div className="bg-white dark:bg-[#1a1a24] border border-zinc-200 dark:border-white/10 rounded-lg px-4 py-2 shadow-md dark:shadow-none">
        <p className="text-zinc-600 dark:text-zinc-400 text-sm">{label}</p>
        <p className="text-zinc-900 dark:text-zinc-100 font-semibold">{payload[0].value}</p>
        {reliability !== undefined && (
          <p className={`text-xs mt-1 ${isReliable(reliability) ? 'text-green-500' : 'text-amber-500'}`}>
            Reliability: {getReliabilityLabel(reliability)}
          </p>
        )}
      </div>
    );
  }
  return null;
};

/**
 * Reliability Badge component
 */
const ReliabilityBadge = ({ reliability }) => {
  if (reliability === undefined) return null;
  
  const label = getReliabilityLabel(reliability);
  const colorClass = isReliable(reliability)
    ? 'bg-green-500/10 text-green-500 border-green-500/20'
    : 'bg-amber-500/10 text-amber-500 border-amber-500/20';
  
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border ${colorClass}`}>
      {label} Reliability
    </span>
  );
};

export default function Growth() {
  const sessions = useSessionStore(state => state.sessions || []);
  
  /**
   * CRITICAL: Use v3 analytics utilities for ALL stats computation.
   * NO client-side calculations allowed here.
   */
  const stats = React.useMemo(() => {
    return computeGrowthStats(sessions, DEFAULT_BASELINE);
  }, [sessions]);
  
  /**
   * CRITICAL: Use v3 chart data preparation.
   * Charts display pre-computed data, never recompute.
   */
  const chartData = React.useMemo(() => {
    const realSessions = sessions.filter(s => s.id && !s.id.startsWith('seed-'));
    return prepareChartData(realSessions, 12);
  }, [sessions]);
  
  // Get trend direction icons
  const getTrendIcon = (direction, positive) => {
    if (direction === 'improving' || (positive && direction !== 'declining')) {
      return <TrendingUp className="w-3 h-3 mr-1" />;
    } else if (direction === 'declining') {
      return <TrendingDown className="w-3 h-3 mr-1" />;
    }
    return null;
  };
  
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-[#0a0a0f] p-6 lg:p-10">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <h1 className="text-3xl lg:text-4xl font-bold text-zinc-900 dark:text-zinc-100 mb-3">
          Your Growth
        </h1>
        <p className="text-zinc-600 dark:text-zinc-500 text-lg">
          Track your improvement over time
        </p>
      </motion.div>
      
      {/* Empty State */}
      {stats.totalSessions === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white dark:bg-[#1a1a24] rounded-2xl border border-zinc-200 dark:border-white/5 shadow-sm dark:shadow-none p-8 mb-8 text-center"
        >
          <AlertCircle className="w-12 h-12 text-zinc-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-2">No sessions yet</h3>
          <p className="text-zinc-600 dark:text-zinc-500 mb-6 max-w-md mx-auto">
            Start recording to track your speaking growth over time. Your progress will appear here.
          </p>
          <Link to={createPageUrl('Speak')}>
            <Button className="bg-gradient-to-r from-violet-600 to-violet-500 hover:from-violet-500 hover:to-violet-400">
              <Mic className="w-4 h-4 mr-2" />
              Start Recording
            </Button>
          </Link>
        </motion.div>
      )}

      {/* Stats Overview - Using v3 reliability-weighted averages */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8"
      >
        {/* Thinking Pause Density (using density, not raw count) */}
        <div className="bg-white dark:bg-[#1a1a24] rounded-2xl border border-zinc-200 dark:border-white/5 shadow-sm dark:shadow-none p-6">
          <div className="flex items-center justify-between mb-3">
            <Mic className="w-5 h-5 text-violet-400" />
            {stats.totalSessions >= 2 && stats.trends.fillers.reductionPct !== 0 && (
              <span className={`text-xs ${stats.trends.fillers.reductionPct >= 0 ? 'text-green-400' : 'text-rose-400'} flex items-center`}>
                {getTrendIcon(stats.trends.fillers.direction, stats.trends.fillers.reductionPct >= 0)}
                {stats.trends.fillers.reductionPct > 0 ? `-${stats.trends.fillers.reductionPct}%` : `+${Math.abs(stats.trends.fillers.reductionPct)}%`}
              </span>
            )}
          </div>
          <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{stats.avgFillerDensity}%</p>
          <p className="text-sm text-zinc-600 dark:text-zinc-500 mt-1">Pause Density</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-600 mt-0.5">per 100 words</p>
        </div>
        
        {/* Confidence Score (reliability-weighted) */}
        <div className="bg-white dark:bg-[#1a1a24] rounded-2xl border border-zinc-200 dark:border-white/5 shadow-sm dark:shadow-none p-6">
          <div className="flex items-center justify-between mb-3">
            <Sparkles className="w-5 h-5 text-teal-600 dark:text-teal-400" />
            {stats.totalSessions >= 2 && stats.trends.confidence.change !== 0 && (
              <span className={`text-xs ${stats.trends.confidence.change >= 0 ? 'text-green-400' : 'text-rose-400'} flex items-center`}>
                {getTrendIcon(stats.trends.confidence.direction, stats.trends.confidence.change >= 0)}
                {stats.trends.confidence.change > 0 ? `+${stats.trends.confidence.change}` : stats.trends.confidence.change}
              </span>
            )}
          </div>
          <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{stats.avgConfidence}%</p>
          <p className="text-sm text-zinc-600 dark:text-zinc-500 mt-1">Confidence Score</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-600 mt-0.5">vs baseline: {DEFAULT_BASELINE.confidenceExpectation}</p>
        </div>
        
        {/* Speaking Pace */}
        <div className="bg-white dark:bg-[#1a1a24] rounded-2xl border border-zinc-200 dark:border-white/5 shadow-sm dark:shadow-none p-6">
          <div className="flex items-center justify-between mb-3">
            <Award className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            {stats.totalSessions >= 2 && (
              <span className={`text-xs ${stats.trends.pace.variance < 25 ? 'text-green-400' : 'text-amber-400'}`}>
                {stats.trends.pace.stability}
              </span>
            )}
          </div>
          <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{stats.avgWPM}</p>
          <p className="text-sm text-zinc-600 dark:text-zinc-500 mt-1">Words/Minute</p>
        </div>
        
        {/* Sessions Completed */}
        <div className="bg-white dark:bg-[#1a1a24] rounded-2xl border border-zinc-200 dark:border-white/5 shadow-sm dark:shadow-none p-6">
          <div className="flex items-center justify-between mb-3">
            <TrendingUp className="w-5 h-5 text-rose-600 dark:text-rose-400" />
          </div>
          <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{stats.totalSessions}</p>
          <p className="text-sm text-zinc-600 dark:text-zinc-500 mt-1">Sessions Completed</p>
        </div>
      </motion.div>
      
      {/* Analytics Note */}
      {stats.totalSessions > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15 }}
          className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-600 mb-6 px-1"
        >
          <Info className="w-3.5 h-3.5" />
          <span>
            Scores are reliability-weighted averages. Improvements are measured against your personal baseline.
          </span>
        </motion.div>
      )}
      
      {/* Charts - Using pre-computed chart data */}
      <div className="grid lg:grid-cols-2 gap-6 mb-8">
        {/* Thinking Pause Density Chart (using density, not count) */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white dark:bg-[#1a1a24] rounded-2xl border border-zinc-200 dark:border-white/5 shadow-sm dark:shadow-none p-6"
        >
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Thinking Pause Density</h3>
            <p className="text-xs text-teal-600 dark:text-teal-400">Normalized per 100 words</p>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData.fillerData}>
                <defs>
                  <linearGradient id="fillerGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis dataKey="session" stroke="#52525b" fontSize={12} />
                <YAxis stroke="#52525b" fontSize={12} />
                <Tooltip content={<CustomTooltip />} />
                <Area 
                  type="monotone" 
                  dataKey="density" 
                  stroke="#8B5CF6" 
                  strokeWidth={2}
                  fill="url(#fillerGradient)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
        
        {/* Confidence Chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white dark:bg-[#1a1a24] rounded-2xl border border-zinc-200 dark:border-white/5 shadow-sm dark:shadow-none p-6"
        >
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Confidence Trend</h3>
            <p className="text-xs text-violet-600 dark:text-violet-400">
              Baseline: {DEFAULT_BASELINE.confidenceExpectation}
            </p>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData.confidenceData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis dataKey="session" stroke="#52525b" fontSize={12} />
                <YAxis stroke="#52525b" fontSize={12} domain={[30, 100]} />
                <Tooltip content={<CustomTooltip />} />
                {/* Baseline reference line */}
                <Line 
                  type="monotone" 
                  dataKey={() => DEFAULT_BASELINE.confidenceExpectation}
                  stroke="#6b7280" 
                  strokeWidth={1}
                  strokeDasharray="5 5"
                  dot={false}
                />
                <Line 
                  type="monotone" 
                  dataKey="score" 
                  stroke="#14B8A6" 
                  strokeWidth={3}
                  dot={{ fill: '#14B8A6', strokeWidth: 0, r: 4 }}
                  activeDot={{ r: 6, fill: '#14B8A6' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
      </div>
      
      {/* Speaking Pace Chart */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="bg-white dark:bg-[#1a1a24] rounded-2xl border border-zinc-200 dark:border-white/5 shadow-sm dark:shadow-none p-6 mb-8"
      >
        <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-6">Speaking Pace (Words/Minute)</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData.paceData}>
              <defs>
                <linearGradient id="speakingGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#F59E0B" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="session" stroke="#52525b" fontSize={12} />
              <YAxis stroke="#52525b" fontSize={12} domain={[80, 200]} />
              <Tooltip content={<CustomTooltip />} />
              <Area 
                type="monotone" 
                dataKey="wpm" 
                stroke="#F59E0B" 
                strokeWidth={2}
                fill="url(#speakingGradient)" 
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </motion.div>
      
      {/* Most Improved - Using v3 improvements data */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="bg-gradient-to-br from-violet-100 to-teal-100 dark:from-violet-500/10 dark:to-teal-500/10 rounded-2xl border border-violet-200 dark:border-white/5 p-6"
      >
        <div className="flex items-center gap-2 mb-6">
          <Award className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Progress Summary</h3>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.improvements.map((item, index) => (
            <motion.div
              key={item.trait}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.6 + index * 0.1 }}
              className="bg-white/50 dark:bg-[#1a1a24]/50 rounded-xl p-4 border border-zinc-200 dark:border-transparent"
            >
              <p className="text-zinc-700 dark:text-zinc-400 text-sm mb-2">{item.trait}</p>
              <p className={`text-2xl font-bold ${item.positive ? 'text-green-500 dark:text-green-400' : 'text-zinc-700 dark:text-zinc-100'}`}>
                {item.change}
              </p>
              {item.note && (
                <p className="text-xs text-zinc-500 dark:text-zinc-600 mt-1">{item.note}</p>
              )}
            </motion.div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
