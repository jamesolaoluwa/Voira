import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import ThemeToggle from '@/components/theme/ThemeToggle';
import { supabase } from '@/components/lib/supabase';
import { Eye, EyeOff } from 'lucide-react';
import { createPageUrl } from '@/utils';

export default function ResetPassword() {
  const location = useLocation();
  const initializedRef = useRef(false);

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [visible, setVisible] = useState(false);

  const [error, setError] = useState('');
  const [status, setStatus] = useState('idle'); // idle | saving | success
  const [sessionLoading, setSessionLoading] = useState(true);
  const [recoveryReady, setRecoveryReady] = useState(false);

  // 🔐 Initialize recovery session from URL hash (runs once)
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const initRecoverySession = async () => {
      setSessionLoading(true);
      setError('');

      const hash = location.hash?.startsWith('#')
        ? location.hash.slice(1)
        : location.hash || '';

      const params = new URLSearchParams(hash);
      const access_token = params.get('access_token');
      const refresh_token = params.get('refresh_token');
      const type = params.get('type');

      if (!access_token || !refresh_token || (type && type !== 'recovery')) {
        setError('Invalid or expired recovery link.');
        setSessionLoading(false);
        return;
      }

      try {
        const { error } = await supabase.auth.setSession({
          access_token,
          refresh_token,
        });
        if (error) throw error;

        setRecoveryReady(true);

        // Clean URL (remove tokens from address bar)
        try {
          history.replaceState({}, document.title, window.location.pathname);
        } catch {}
      } catch (err) {
        console.error('Recovery session error:', err);
        setError('Invalid or expired recovery link.');
      } finally {
        setSessionLoading(false);
      }
    };

    initRecoverySession();
  }, [location.hash]);

  // 🔑 Submit new password
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!recoveryReady) {
      setError('Recovery session not established.');
      return;
    }

    if (!password) {
      setError('Please enter a new password.');
      return;
    }

    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setStatus('saving');

    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      setStatus('success');

      // Clean up session after success (non-blocking)
      supabase.auth.signOut().catch(() => {});
    } catch (err) {
      console.error('Password update failed:', err);
      setError(err.message || 'Unable to reset password.');
      setStatus('idle');
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left visual panel */}
      <div className="hidden lg:flex lg:w-3/5 bg-zinc-100 dark:bg-[#0a0a0f] relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-violet-500/20 rounded-full blur-3xl animate-pulse" />
        </div>
        <div className="relative z-10 flex flex-col items-center justify-center w-full p-12">
          <h2 className="text-4xl font-bold text-zinc-900 dark:text-zinc-100 mb-4">Voira</h2>
          <p className="text-xl text-zinc-700 dark:text-zinc-400">Reset your password</p>
        </div>
      </div>

      {/* Right form panel */}
      <div className="w-full lg:w-2/5 bg-zinc-50 dark:bg-[#0D0D12] flex items-center justify-center p-8">
        <motion.div
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6 }}
          className="w-full max-w-md"
        >
          <div className="mb-8 flex items-center justify-between">
            <Link to={createPageUrl('Landing')} className="text-2xl font-semibold">
              Voira
            </Link>
            <ThemeToggle showLabel={false} />
          </div>

          <h1 className="text-3xl font-bold mb-2">Set a new password</h1>
          <p className="text-zinc-600 dark:text-zinc-500 mb-6">
            Enter a new password to update your account.
          </p>

          {sessionLoading && (
            <p className="text-sm text-zinc-500 mb-4">
              Establishing secure recovery session…
            </p>
          )}

          {!sessionLoading && !recoveryReady && error && (
            <p className="text-sm text-rose-500 mb-4">
              {error}{' '}
              <Link to={createPageUrl('Auth')} className="underline">
                Request a new reset
              </Link>
            </p>
          )}

          {status === 'success' ? (
            <div className="space-y-4">
              <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 text-green-600">
                Your password was updated successfully.
              </div>
              <Link
                to={createPageUrl('Auth')}
                className="w-full h-12 inline-flex items-center justify-center rounded-md border bg-white"
              >
                Return to sign in
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <Label>New Password</Label>
                <div className="relative">
                  <Input
                    type={visible ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setVisible((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500"
                  >
                    {visible ? <EyeOff /> : <Eye />}
                  </button>
                </div>
              </div>

              <div>
                <Label>Confirm Password</Label>
                <Input
                  type={visible ? 'text' : 'password'}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                />
              </div>

              {error && (
                <div className="bg-rose-500/10 border border-rose-500/30 rounded-lg p-3 text-sm text-rose-400">
                  {error}
                </div>
              )}

              <Button
                type="submit"
                disabled={sessionLoading || status === 'saving' || !recoveryReady}
                className="w-full h-12 bg-gradient-to-r from-violet-600 to-violet-500 text-white"
              >
                {status === 'saving' ? 'Saving…' : 'Set new password'}
              </Button>

              <div className="text-center">
                <Link to={createPageUrl('Auth')} className="text-sm underline">
                  Back to sign in
                </Link>
              </div>
            </form>
          )}
        </motion.div>
      </div>
    </div>
  );
}
