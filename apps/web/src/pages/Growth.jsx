import React from 'react';
import { motion } from 'framer-motion';
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import useSessionStore from '@/stores/useSessionStore';
import { TrendingUp, TrendingDown, Award, Mic, Sparkles, AlertCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Button } from '@/components/ui/button';

// Calculate real improvements from session data

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white dark:bg-[#1a1a24] border border-zinc-200 dark:border-white/10 rounded-lg px-4 py-2 shadow-md dark:shadow-none">
        <p className="text-zinc-600 dark:text-zinc-400 text-sm">{label}</p>
        <p className="text-zinc-900 dark:text-zinc-100 font-semibold">{payload[0].value}</p>
      </div>
    );
  }
  return null;
};

export default function Growth() {
  const sessions = useSessionStore(state => state.sessions || []);
  
  // Filter out seed/demo data (only show real user recordings)
  const realSessions = React.useMemo(() => {
    return sessions.filter(s => s.id && !s.id.startsWith('seed-'));
  }, [sessions]);
  
  const stats = React.useMemo(() => {
    const total = realSessions.length;
    if (total === 0) return { totalSessions: 0, avgConfidence: 0, avgFillers: 0, avgWPM: 0 };
    const avgConfidence = Math.round(realSessions.reduce((s, x) => s + (x.confidenceScore || 0), 0) / total);
    const avgFillers = Math.round(realSessions.reduce((s, x) => s + (x.fillerCount || 0), 0) / total);
    const avgWPM = Math.round(realSessions.reduce((s, x) => s + (x.wordsPerMinute || 0), 0) / total);
    return { totalSessions: total, avgConfidence, avgFillers, avgWPM };
  }, [realSessions]);
  
  // Calculate real improvements by comparing first half vs second half of sessions
  const improvements = React.useMemo(() => {
    const total = realSessions.length;
    if (total < 2) {
      return [
        { trait: 'Filler Word Reduction', change: 'N/A', positive: true },
        { trait: 'Confidence Score', change: 'N/A', positive: true },
        { trait: 'Speaking Pace', change: 'N/A', positive: true },
        { trait: 'Sessions Completed', change: `${total}`, positive: total > 0 },
      ];
    }
    
    const half = Math.max(1, Math.floor(total / 2));
    // Sessions are sorted newest first, so first half = recent, last half = older
    const recentHalf = realSessions.slice(0, half);
    const olderHalf = realSessions.slice(-half);
    
    // Filler word reduction
    const recentFillers = recentHalf.reduce((s, x) => s + (x.fillerCount || 0), 0) / recentHalf.length;
    const olderFillers = olderHalf.reduce((s, x) => s + (x.fillerCount || 0), 0) / olderHalf.length;
    const fillerReduction = olderFillers > 0 ? Math.round(((olderFillers - recentFillers) / olderFillers) * 100) : 0;
    
    // Confidence improvement
    const recentConf = recentHalf.reduce((s, x) => s + (x.confidenceScore || 0), 0) / recentHalf.length;
    const olderConf = olderHalf.reduce((s, x) => s + (x.confidenceScore || 0), 0) / olderHalf.length;
    const confImprovement = Math.round(recentConf - olderConf);
    
    // Speaking pace stability
    const avgWPM = realSessions.reduce((s, x) => s + (x.wordsPerMinute || 0), 0) / total;
    const paceVariance = realSessions.reduce((s, x) => s + Math.abs((x.wordsPerMinute || 0) - avgWPM), 0) / total;
    const paceStatus = paceVariance < 15 ? 'Stable' : paceVariance < 25 ? 'Improving' : 'Variable';
    
    return [
      { 
        trait: 'Filler Word Reduction', 
        change: fillerReduction > 0 ? `-${fillerReduction}%` : fillerReduction < 0 ? `+${Math.abs(fillerReduction)}%` : '0%', 
        positive: fillerReduction >= 0 
      },
      { 
        trait: 'Confidence Score', 
        change: confImprovement > 0 ? `+${confImprovement}%` : `${confImprovement}%`, 
        positive: confImprovement >= 0 
      },
      { trait: 'Speaking Pace', change: paceStatus, positive: paceVariance < 25 },
      { trait: 'Sessions Completed', change: `${total}`, positive: true },
    ];
  }, [realSessions]);
  
  const recent = realSessions.slice(0, 12).reverse();
  const fillerData = recent.length > 0 
    ? recent.map((s, i) => ({ week: `S${i+1}`, count: s.fillerCount || 0 }))
    : [{ week: 'S1', count: 0 }];
  const confidenceData = recent.length > 0
    ? recent.map((s, i) => ({ week: `S${i+1}`, score: s.confidenceScore || 0 }))
    : [{ week: 'S1', score: 0 }];
  const speakingData = recent.length > 0
    ? recent.map((s, i) => ({ week: `S${i+1}`, words: s.wordsPerMinute || 0 }))
    : [{ week: 'S1', words: 0 }];
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
      {realSessions.length === 0 && (
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

      {/* Stats Overview */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8"
      >
        <div className="bg-white dark:bg-[#1a1a24] rounded-2xl border border-zinc-200 dark:border-white/5 shadow-sm dark:shadow-none p-6">
          <div className="flex items-center justify-between mb-3">
            <Mic className="w-5 h-5 text-violet-400" />
            {realSessions.length >= 2 && improvements[0]?.change !== 'N/A' && (
              <span className={`text-xs ${improvements[0]?.positive ? 'text-green-400' : 'text-rose-400'} flex items-center`}>
                {improvements[0]?.positive ? <TrendingDown className="w-3 h-3 mr-1" /> : <TrendingUp className="w-3 h-3 mr-1" />}
                {improvements[0]?.change}
              </span>
            )}
          </div>
          <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{stats.avgFillers}</p>
          <p className="text-sm text-zinc-600 dark:text-zinc-500 mt-1">Filler Words/Session</p>
        </div>
        
        <div className="bg-white dark:bg-[#1a1a24] rounded-2xl border border-zinc-200 dark:border-white/5 shadow-sm dark:shadow-none p-6">
          <div className="flex items-center justify-between mb-3">
            <Sparkles className="w-5 h-5 text-teal-600 dark:text-teal-400" />
            {realSessions.length >= 2 && improvements[1]?.change !== 'N/A' && (
              <span className={`text-xs ${improvements[1]?.positive ? 'text-green-400' : 'text-rose-400'} flex items-center`}>
                {improvements[1]?.positive ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
                {improvements[1]?.change}
              </span>
            )}
          </div>
          <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{stats.avgConfidence}%</p>
          <p className="text-sm text-zinc-600 dark:text-zinc-500 mt-1">Confidence Score</p>
        </div>
        
        <div className="bg-white dark:bg-[#1a1a24] rounded-2xl border border-zinc-200 dark:border-white/5 shadow-sm dark:shadow-none p-6">
          <div className="flex items-center justify-between mb-3">
            <Award className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            {realSessions.length >= 2 && (
              <span className={`text-xs ${improvements[2]?.positive ? 'text-green-400' : 'text-amber-400'}`}>
                {improvements[2]?.change}
              </span>
            )}
          </div>
          <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{stats.avgWPM}</p>
          <p className="text-sm text-zinc-600 dark:text-zinc-500 mt-1">Words/Minute</p>
        </div>
        
        <div className="bg-white dark:bg-[#1a1a24] rounded-2xl border border-zinc-200 dark:border-white/5 shadow-sm dark:shadow-none p-6">
          <div className="flex items-center justify-between mb-3">
            <TrendingUp className="w-5 h-5 text-rose-600 dark:text-rose-400" />
          </div>
          <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{stats.totalSessions}</p>
          <p className="text-sm text-zinc-600 dark:text-zinc-500 mt-1">Sessions Completed</p>
        </div>
      </motion.div>
      
      {/* Charts */}
      <div className="grid lg:grid-cols-2 gap-6 mb-8">
        {/* Filler Words Chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white dark:bg-[#1a1a24] rounded-2xl border border-zinc-200 dark:border-white/5 shadow-sm dark:shadow-none p-6"
        >
          <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Filler Word Reduction</h3>
          <p className="text-xs text-teal-600 dark:text-teal-400">You're becoming clearer with every session.</p>
        </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={fillerData}>
                <defs>
                  <linearGradient id="fillerGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis dataKey="week" stroke="#52525b" fontSize={12} />
                <YAxis stroke="#52525b" fontSize={12} />
                <Tooltip content={<CustomTooltip />} />
                <Area 
                  type="monotone" 
                  dataKey="count" 
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
          <p className="text-xs text-violet-600 dark:text-violet-400">Your confidence is trending upward — keep going.</p>
        </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={confidenceData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis dataKey="week" stroke="#52525b" fontSize={12} />
                <YAxis stroke="#52525b" fontSize={12} domain={[50, 100]} />
                <Tooltip content={<CustomTooltip />} />
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
            <AreaChart data={speakingData}>
              <defs>
                <linearGradient id="speakingGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#F59E0B" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="week" stroke="#52525b" fontSize={12} />
              <YAxis stroke="#52525b" fontSize={12} domain={[100, 180]} />
              <Tooltip content={<CustomTooltip />} />
              <Area 
                type="monotone" 
                dataKey="words" 
                stroke="#F59E0B" 
                strokeWidth={2}
                fill="url(#speakingGradient)" 
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </motion.div>
      
      {/* Most Improved */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="bg-gradient-to-br from-violet-100 to-teal-100 dark:from-violet-500/10 dark:to-teal-500/10 rounded-2xl border border-violet-200 dark:border-white/5 p-6"
      >
        <div className="flex items-center gap-2 mb-6">
          <Award className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Most Improved Traits</h3>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {improvements.map((item, index) => (
            <motion.div
              key={item.trait}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.6 + index * 0.1 }}
              className="bg-white/50 dark:bg-[#1a1a24]/50 rounded-xl p-4 border border-zinc-200 dark:border-transparent"
            >
              <p className="text-zinc-700 dark:text-zinc-400 text-sm mb-2">{item.trait}</p>
              <p className={`text-2xl font-bold ${item.positive ? 'text-green-400' : 'text-zinc-100'}`}>
                {item.change}
              </p>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}