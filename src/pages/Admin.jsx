import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Shield, User, CreditCard, Loader2 } from 'lucide-react';
import { auth, billing, credits } from '@/components/services/api';
import { useAuth } from '@/contexts/AuthContext';

export default function Admin() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedRole, setSelectedRole] = useState('free_user');
  const [creditAmount, setCreditAmount] = useState(60);
  const [isUpdating, setIsUpdating] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
  checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const currentUser = await auth.getMe();
      const { isAdmin: ctxIsAdmin } = useAuth();
      if (!currentUser || !ctxIsAdmin) {
        setUser(null);
        setIsLoading(false);
        return;
      }
      setUser(currentUser);
      setSelectedRole(currentUser.role);
    } catch (error) {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRoleChange = async () => {
    setIsUpdating(true);
    setMessage('');
    try {
      await billing.setPlan(selectedRole);
      setMessage('Role updated successfully!');
      setTimeout(() => setMessage(''), 3000);
      await checkAuth();
    } catch (error) {
      setMessage(`Error: ${error.message}`);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleCreditAdjustment = async () => {
    setIsUpdating(true);
    setMessage('');
    try {
      await credits.resetCredits(parseInt(creditAmount));
      setMessage('Credits updated successfully!');
      setTimeout(() => setMessage(''), 3000);
      await checkAuth();
    } catch (error) {
      setMessage(`Error: ${error.message}`);
    } finally {
      setIsUpdating(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-[#0a0a0f] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
      </div>
    );
  }
  if (!user) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-[#0a0a0f] p-6 lg:p-10 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-semibold mb-4">Access denied</h2>
          <p className="text-zinc-600">You do not have permission to view this page.</p>
        </div>
      </div>
    );
  }
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-[#0a0a0f] p-6 lg:p-10">
      <div className="max-w-4xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex items-center gap-3 mb-3">
            <Shield className="w-8 h-8 text-violet-600 dark:text-violet-400" />
            <h1 className="text-3xl lg:text-4xl font-bold text-zinc-900 dark:text-zinc-100">
              Admin Panel
            </h1>
          </div>
          <p className="text-zinc-600 dark:text-zinc-500 text-lg">
            Manage user roles and system settings
          </p>
        </motion.div>

        {message && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 bg-teal-500/10 border border-teal-500/30 rounded-xl p-4 text-teal-400"
          >
            {message}
          </motion.div>
        )}

        <div className="space-y-6">
          {/* Current User Info */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white dark:bg-[#1a1a24] rounded-2xl border border-zinc-200 dark:border-white/5 shadow-sm dark:shadow-none p-6"
          >
            <div className="flex items-center gap-3 mb-6">
              <User className="w-5 h-5 text-violet-600 dark:text-violet-400" />
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Current User</h2>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <Label className="text-zinc-600 dark:text-zinc-500">Name</Label>
                <p className="text-zinc-900 dark:text-zinc-100 font-medium">{user?.full_name}</p>
              </div>
              <div>
                <Label className="text-zinc-600 dark:text-zinc-500">Email</Label>
                <p className="text-zinc-900 dark:text-zinc-100 font-medium">{user?.email}</p>
              </div>
              <div>
                <Label className="text-zinc-600 dark:text-zinc-500">Role</Label>
                <p className="text-zinc-900 dark:text-zinc-100 font-medium capitalize">{user?.role?.replace('_', ' ')}</p>
              </div>
              <div>
                <Label className="text-zinc-600 dark:text-zinc-500">Credits</Label>
                <p className="text-zinc-900 dark:text-zinc-100 font-medium">{user?.credits_remaining}</p>
              </div>
            </div>
          </motion.div>

          {/* Role Management */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white dark:bg-[#1a1a24] rounded-2xl border border-zinc-200 dark:border-white/5 shadow-sm dark:shadow-none p-6"
          >
            <div className="flex items-center gap-3 mb-6">
              <Shield className="w-5 h-5 text-teal-600 dark:text-teal-400" />
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Role Management</h2>
            </div>
            <div className="space-y-4">
              <div>
                <Label className="text-zinc-800 dark:text-zinc-300 mb-2">Select Role</Label>
                <div className="grid grid-cols-3 gap-3 mt-2">
                  {['free_user', 'premium_user', 'admin'].map((role) => (
                    <button
                      key={role}
                      onClick={() => setSelectedRole(role)}
                      className={`p-3 rounded-xl text-center transition-all ${
                        selectedRole === role
                          ? 'bg-violet-500/20 border border-violet-500/30 text-violet-700 dark:text-violet-300'
                          : 'bg-zinc-50 dark:bg-[#13131a] border border-transparent text-zinc-700 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-white/10'
                      }`}
                    >
                      <span className="text-sm font-medium capitalize">{role.replace('_', ' ')}</span>
                    </button>
                  ))}
                </div>
              </div>
              <Button
                onClick={handleRoleChange}
                disabled={isUpdating || selectedRole === user?.role}
                className="w-full bg-gradient-to-r from-violet-600 to-violet-500 hover:from-violet-500 hover:to-violet-400 disabled:opacity-50"
              >
                {isUpdating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Updating...
                  </>
                ) : (
                  'Update Role'
                )}
              </Button>
            </div>
          </motion.div>

          {/* Credits Management */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-white dark:bg-[#1a1a24] rounded-2xl border border-zinc-200 dark:border-white/5 shadow-sm dark:shadow-none p-6"
          >
            <div className="flex items-center gap-3 mb-6">
              <CreditCard className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Credits Management</h2>
            </div>
            <div className="space-y-4">
              <div>
                <Label htmlFor="credits" className="text-zinc-800 dark:text-zinc-300">Credit Amount</Label>
                <Input
                  id="credits"
                  type="number"
                  value={creditAmount}
                  onChange={(e) => setCreditAmount(e.target.value)}
                  className="mt-2 bg-zinc-50 dark:bg-[#13131a] border-zinc-300 dark:border-white/10"
                />
              </div>
              <Button
                onClick={handleCreditAdjustment}
                disabled={isUpdating}
                className="w-full bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 disabled:opacity-50"
              >
                {isUpdating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Updating...
                  </>
                ) : (
                  'Set Credits'
                )}
              </Button>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}