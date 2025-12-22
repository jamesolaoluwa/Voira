import React from 'react';
import { motion } from 'framer-motion';
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendingUp, TrendingDown, Award, Mic, Sparkles } from 'lucide-react';

const fillerData = [
  { week: 'Week 1', count: 24 },
  { week: 'Week 2', count: 18 },
  { week: 'Week 3', count: 15 },
  { week: 'Week 4', count: 12 },
  { week: 'Week 5', count: 8 },
  { week: 'Week 6', count: 5 },
];

const confidenceData = [
  { week: 'Week 1', score: 62 },
  { week: 'Week 2', score: 68 },
  { week: 'Week 3', score: 71 },
  { week: 'Week 4', score: 75 },
  { week: 'Week 5', score: 82 },
  { week: 'Week 6', score: 87 },
];

const speakingData = [
  { week: 'Week 1', words: 120 },
  { week: 'Week 2', words: 145 },
  { week: 'Week 3', words: 138 },
  { week: 'Week 4', words: 155 },
  { week: 'Week 5', words: 162 },
  { week: 'Week 6', words: 158 },
];

const improvements = [
  { trait: 'Filler Word Reduction', change: '-79%', positive: true },
  { trait: 'Confidence Score', change: '+40%', positive: true },
  { trait: 'Speaking Pace', change: 'Optimal', positive: true },
  { trait: 'Clarity', change: '+25%', positive: true },
];

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
            <span className="text-xs text-green-400 flex items-center">
              <TrendingDown className="w-3 h-3 mr-1" />
              -79%
            </span>
          </div>
          <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">5</p>
          <p className="text-sm text-zinc-600 dark:text-zinc-500 mt-1">Filler Words/Session</p>
        </div>
        
        <div className="bg-white dark:bg-[#1a1a24] rounded-2xl border border-zinc-200 dark:border-white/5 shadow-sm dark:shadow-none p-6">
          <div className="flex items-center justify-between mb-3">
            <Sparkles className="w-5 h-5 text-teal-600 dark:text-teal-400" />
            <span className="text-xs text-green-400 flex items-center">
              <TrendingUp className="w-3 h-3 mr-1" />
              +40%
            </span>
          </div>
          <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">87%</p>
          <p className="text-sm text-zinc-600 dark:text-zinc-500 mt-1">Confidence Score</p>
        </div>
        
        <div className="bg-white dark:bg-[#1a1a24] rounded-2xl border border-zinc-200 dark:border-white/5 shadow-sm dark:shadow-none p-6">
          <div className="flex items-center justify-between mb-3">
            <Award className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          </div>
          <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">158</p>
          <p className="text-sm text-zinc-600 dark:text-zinc-500 mt-1">Words/Minute</p>
        </div>
        
        <div className="bg-white dark:bg-[#1a1a24] rounded-2xl border border-zinc-200 dark:border-white/5 shadow-sm dark:shadow-none p-6">
          <div className="flex items-center justify-between mb-3">
            <TrendingUp className="w-5 h-5 text-rose-600 dark:text-rose-400" />
          </div>
          <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">24</p>
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