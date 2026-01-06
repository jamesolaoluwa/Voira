import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { 
  Save, 
  Volume2, 
  Shield, 
  Download, 
  Cpu,
  Trash2,
  AlertTriangle,
  CreditCard,
  Crown
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import useSessionStore from '@/stores/useSessionStore';
import CreditsDisplay from '@/components/ui/CreditsDisplay';
import { useAuth } from '@/contexts/AuthContext';

const cleanupOptions = [
  { value: 'light', label: 'Light', description: 'Minimal changes, keep more of your natural voice' },
  { value: 'moderate', label: 'Moderate', description: 'Balanced cleanup with natural flow preserved' },
  { value: 'aggressive', label: 'Aggressive', description: 'Maximum polish and refinement' },
];

const exportOptions = [
  { value: 'txt', label: 'Plain Text (.txt)' },
  { value: 'pdf', label: 'PDF Document (.pdf)' },
  { value: 'docx', label: 'Word Document (.docx)' },
];

const aiProviders = [
  { value: 'default', label: 'Default', description: 'Fast and reliable' },
  { value: 'premium', label: 'Premium', description: 'Highest quality output' },
];

export default function Settings() {
  const sessions = useSessionStore(state => state.sessions || []);
  const { user: authUser } = useAuth();
  const stats = React.useMemo(() => {
    const total = sessions.length;
    if (total === 0) return { avgConfidence: 0, avgWPM: 0, avgFillers: 0 };
    const avgConfidence = Math.round(sessions.reduce((s, x) => s + (x.confidenceScore || 0), 0) / total);
    const avgFillers = Math.round(sessions.reduce((s, x) => s + (x.fillerCount || 0), 0) / total);
    const avgWPM = Math.round(sessions.reduce((s, x) => s + (x.wordsPerMinute || 0), 0) / total);
    return { avgConfidence, avgWPM, avgFillers };
  }, [sessions]);
  const [cleanupIntensity, setCleanupIntensity] = useState('moderate');
  const [exportFormat, setExportFormat] = useState('txt');
  const [aiProvider, setAiProvider] = useState('default');
  const [autoSave, setAutoSave] = useState(true);
  const [analytics, setAnalytics] = useState(true);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-[#0a0a0f] p-6 lg:p-10">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <h1 className="text-3xl lg:text-4xl font-bold text-zinc-900 dark:text-zinc-100 mb-3">
          Settings
        </h1>
        <p className="text-zinc-600 dark:text-zinc-500 text-lg">
          Customize your Voira experience
        </p>
      </motion.div>
      
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Voice Cleanup */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white dark:bg-[#1a1a24] rounded-2xl border border-zinc-200 dark:border-white/5 shadow-sm dark:shadow-none p-6"
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-violet-500/20 flex items-center justify-center">
              <Volume2 className="w-5 h-5 text-violet-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Voice Cleanup Intensity</h2>
              <p className="text-sm text-zinc-600 dark:text-zinc-500">How much should Voira refine your speech?</p>
            </div>
          </div>
          
          <div className="grid gap-3">
            {cleanupOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => setCleanupIntensity(option.value)}
                className={`p-4 rounded-xl text-left transition-all ${
                  cleanupIntensity === option.value
                    ? 'bg-violet-500/20 border border-violet-500/30'
                    : 'bg-zinc-50 dark:bg-[#13131a] border border-transparent hover:border-zinc-300 dark:hover:border-white/10'
                }`}
              >
                <p className={`font-medium ${cleanupIntensity === option.value ? 'text-violet-700 dark:text-violet-300' : 'text-zinc-800 dark:text-zinc-200'}`}>
                  {option.label}
                </p>
                <p className="text-sm text-zinc-600 dark:text-zinc-500 mt-1">{option.description}</p>
              </button>
            ))}
          </div>
        </motion.div>
        
        {/* Privacy */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white dark:bg-[#1a1a24] rounded-2xl border border-zinc-200 dark:border-white/5 shadow-sm dark:shadow-none p-6"
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-teal-500/20 flex items-center justify-center">
              <Shield className="w-5 h-5 text-teal-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Privacy & Data</h2>
              <p className="text-sm text-zinc-600 dark:text-zinc-500">Control how your data is handled</p>
            </div>
          </div>
          
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-zinc-800 dark:text-zinc-200">Auto-save recordings</Label>
                <p className="text-sm text-zinc-600 dark:text-zinc-500 mt-1">Automatically save all recordings to library</p>
              </div>
              <Switch
                checked={autoSave}
                onCheckedChange={setAutoSave}
              />
            </div>
            
            <div className="border-t border-zinc-200 dark:border-white/5 pt-6 flex items-center justify-between">
              <div>
                <Label className="text-zinc-800 dark:text-zinc-200">Usage analytics</Label>
                <p className="text-sm text-zinc-600 dark:text-zinc-500 mt-1">Help improve Voira with anonymous usage data</p>
              </div>
              <Switch
                checked={analytics}
                onCheckedChange={setAnalytics}
              />
            </div>
          </div>
        </motion.div>
        
        {/* Export */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white dark:bg-[#1a1a24] rounded-2xl border border-zinc-200 dark:border-white/5 shadow-sm dark:shadow-none p-6"
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center">
              <Download className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Export Preferences</h2>
              <p className="text-sm text-zinc-600 dark:text-zinc-500">Default format for exporting drafts</p>
            </div>
          </div>
          
          <div className="grid grid-cols-3 gap-3">
            {exportOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => setExportFormat(option.value)}
                className={`p-4 rounded-xl text-center transition-all ${
                  exportFormat === option.value
                    ? 'bg-amber-500/20 border border-amber-500/30'
                    : 'bg-zinc-50 dark:bg-[#13131a] border border-transparent hover:border-zinc-300 dark:hover:border-white/10'
                }`}
              >
                <p className={`font-medium ${exportFormat === option.value ? 'text-amber-700 dark:text-amber-300' : 'text-zinc-800 dark:text-zinc-200'}`}>
                  {option.label}
                </p>
              </button>
            ))}
          </div>
        </motion.div>
        
        {/* Plan & Billing */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="bg-white dark:bg-[#1a1a24] rounded-2xl border border-zinc-200 dark:border-white/5 shadow-sm dark:shadow-none p-6"
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-violet-500/20 flex items-center justify-center">
              <CreditCard className="w-5 h-5 text-violet-400" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Plan & Billing</h2>
              <p className="text-sm text-zinc-600 dark:text-zinc-500">Manage your plan, usage, and billing</p>
            </div>
          </div>
          
          <div className="bg-zinc-50 dark:bg-[#13131a] rounded-xl p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-zinc-600 dark:text-zinc-400">Current Plan</span>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-zinc-800 dark:text-zinc-200">Free</span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-600 dark:text-zinc-400">Credits Remaining</span>
              <span className="font-semibold text-zinc-800 dark:text-zinc-200"><CreditsDisplay credits={authUser?.credits_remaining ?? 0} total={authUser?.credits_total ?? (authUser?.role === 'premium_user' ? 200 : 60)} compact={true} /></span>
            </div>
          </div>
          {/* Small session stats */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="bg-white dark:bg-[#111118] rounded-xl p-4 text-center">
              <div className="text-xs text-zinc-500">Avg. Confidence</div>
              <div className="text-lg font-semibold">{stats?.avgConfidence ?? '-'}%</div>
            </div>
            <div className="bg-white dark:bg-[#111118] rounded-xl p-4 text-center">
              <div className="text-xs text-zinc-500">Avg. WPM</div>
              <div className="text-lg font-semibold">{stats?.avgWPM ?? '-'} WPM</div>
            </div>
            <div className="bg-white dark:bg-[#111118] rounded-xl p-4 text-center">
              <div className="text-xs text-zinc-500">Fillers / Session</div>
              <div className="text-lg font-semibold">{stats?.avgFillers ?? '-'}</div>
            </div>
          </div>
          
          <Link to={createPageUrl('Pricing')}>
            <Button className="w-full bg-gradient-to-r from-violet-600 to-violet-500 hover:from-violet-500 hover:to-violet-400">
              <Crown className="w-4 h-4 mr-2" />
              Upgrade Plan
            </Button>
          </Link>
        </motion.div>

        {/* AI Provider */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-white dark:bg-[#1a1a24] rounded-2xl border border-zinc-200 dark:border-white/5 shadow-sm dark:shadow-none p-6"
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-rose-500/20 flex items-center justify-center">
              <Cpu className="w-5 h-5 text-rose-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">AI Provider</h2>
              <p className="text-sm text-zinc-600 dark:text-zinc-500">Choose your preferred AI engine</p>
            </div>
          </div>
          
          <div className="grid gap-3">
            {aiProviders.map((option) => (
              <button
                key={option.value}
                onClick={() => setAiProvider(option.value)}
                className={`p-4 rounded-xl text-left transition-all ${
                  aiProvider === option.value
                    ? 'bg-rose-500/20 border border-rose-500/30'
                    : 'bg-zinc-50 dark:bg-[#13131a] border border-transparent hover:border-zinc-300 dark:hover:border-white/10'
                }`}
              >
                <p className={`font-medium ${aiProvider === option.value ? 'text-rose-700 dark:text-rose-300' : 'text-zinc-800 dark:text-zinc-200'}`}>
                  {option.label}
                </p>
                <p className="text-sm text-zinc-600 dark:text-zinc-500 mt-1">{option.description}</p>
              </button>
            ))}
          </div>
        </motion.div>
        
        {/* Danger Zone */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="bg-white dark:bg-[#1a1a24] rounded-2xl border border-rose-300 dark:border-rose-500/20 shadow-sm dark:shadow-none p-6"
        >
          <div className="flex items-center gap-3 mb-4">
            <AlertTriangle className="w-5 h-5 text-rose-500 dark:text-rose-400" />
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Danger Zone</h2>
          </div>
          
          {!showDeleteConfirm ? (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-zinc-800 dark:text-zinc-200">Delete all data</p>
                <p className="text-sm text-zinc-600 dark:text-zinc-500">Permanently remove all recordings and settings</p>
              </div>
              <Button
                variant="outline"
                onClick={() => setShowDeleteConfirm(true)}
                className="border-rose-500/30 text-rose-400 hover:bg-rose-500/10"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete All
              </Button>
            </div>
          ) : (
            <div className="bg-rose-500/10 rounded-xl p-4">
              <p className="text-rose-300 mb-4">Are you sure? This action cannot be undone.</p>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => setShowDeleteConfirm(false)}
                  className="border-white/10"
                >
                  Cancel
                </Button>
                <Button
                  className="bg-rose-600 hover:bg-rose-500"
                >
                  Yes, Delete Everything
                </Button>
              </div>
            </div>
          )}
        </motion.div>
        
        {/* Save Button */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="flex justify-end"
        >
          <Button className="bg-gradient-to-r from-violet-600 to-violet-500 hover:from-violet-500 hover:to-violet-400 px-8">
            <Save className="w-4 h-4 mr-2" />
            Save Settings
          </Button>
        </motion.div>
      </div>
    </div>
  );
}