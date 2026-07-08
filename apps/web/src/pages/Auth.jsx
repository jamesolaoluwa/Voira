import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import Orb from '@/components/ui/Orb';
import ThemeToggle from '@/components/theme/ThemeToggle';
import { auth } from '@/components/services/api';
import { Loader2 } from 'lucide-react';
import { Eye, EyeOff } from 'lucide-react';
import { supabase } from '@/components/lib/supabase';
import { safeParseEmail, safeParsePassword } from '@/lib/validation';
import { normalizeEmail } from '@/lib/sanitize';
import { useAuth } from '@/contexts/AuthContext';

const AUTH_TIMEOUT_MS = 8000;

const inputClassName =
  'bg-white dark:bg-[#1a1a24] border-zinc-300 dark:border-white/10 focus:border-accent/50 text-zinc-900 dark:text-zinc-100';

export default function Auth() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { session, isLoading: authLoading } = useAuth();
  const [isSignUp, setIsSignUp] = useState(searchParams.get('signup') === 'true');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [signUpSuccess, setSignUpSuccess] = useState(false);

  const authInFlightRef = useRef(false);

  const [forgotMode, setForgotMode] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSent, setForgotSent] = useState(false);

  useEffect(() => {
    console.log('[Auth] useEffect - authLoading:', authLoading, 'session:', !!session);
    if (!authLoading && session) {
      console.log('[Auth] Session detected, redirecting to /home');
      navigate('/home', { replace: true });
    }
  }, [session, authLoading, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (authInFlightRef.current || isLoading) {
      console.debug('[Auth] Sign-in already in progress, ignoring duplicate submit');
      return;
    }

    authInFlightRef.current = true;
    setError('');
    setIsLoading(true);
    setSignUpSuccess(false);

    try {
      const emailResult = safeParseEmail(email);
      if (!emailResult.success) throw new Error('Please enter a valid email address');
      const normalizedEmail = normalizeEmail(emailResult.data);

      const pwResult = safeParsePassword(password);
      if (!pwResult.success) throw new Error('Password must be at least 10 characters');

      if (isSignUp) {
        const result = await auth.signUp(normalizedEmail, password, name);

        if (result?.user && !result?.session) {
          setSignUpSuccess(true);
          setIsLoading(false);
          authInFlightRef.current = false;
          return;
        }
        authInFlightRef.current = false;
        setIsLoading(false);
      } else {
        const result = await auth.signIn(normalizedEmail, password);

        if (result?.session) {
          setTimeout(async () => {
            if (authInFlightRef.current) {
              const { data: { session: currentSession } } = await supabase.auth.getSession();
              if (currentSession) {
                console.log('[Auth] Timeout fallback: session found, navigating');
                navigate('/home', { replace: true });
                authInFlightRef.current = false;
                setIsLoading(false);
              } else {
                console.warn('[Auth] Timeout fallback: session still not established');
                setError('Sign-in took too long. Please try again.');
                setIsLoading(false);
                authInFlightRef.current = false;
              }
            }
          }, AUTH_TIMEOUT_MS);
        } else {
          console.warn('[Auth] signIn completed without session; resetting state');
          setError('Sign-in did not complete. Please try again.');
          setIsLoading(false);
          authInFlightRef.current = false;
        }
      }
    } catch (err) {
      console.error('[Auth] Error:', err);
      setError(err.message || 'Authentication failed');
      setIsLoading(false);
      authInFlightRef.current = false;
    }
  };

  const handleGoogleSignIn = async () => {
    if (authInFlightRef.current || isLoading) {
      console.debug('[Auth] Google sign-in already in progress');
      return;
    }

    setError('');
    try {
      await auth.signInWithGoogle();
    } catch (err) {
      setError(err.message || 'Google sign-in failed');
    }
  };

  const togglePasswordVisibility = () => setPasswordVisible(v => !v);

  const handleForgotSend = async () => {
    setError('');
    if (!forgotEmail) return setError('Please enter your email');
    setIsLoading(true);
    try {
      const { error: supError } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (supError) throw supError;
      setForgotSent(true);
    } catch (err) {
      setError(err.message || 'Unable to send reset email');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left panel: WebGL Orb on a fixed dark canvas (theme-independent) */}
      <div className="hidden lg:flex lg:w-3/5 bg-black relative overflow-hidden">
        <div className="absolute inset-0 z-0">
          <Orb
            hoverIntensity={0.52}
            rotateOnHover
            hue={0}
            forceHoverState={false}
            backgroundColor="#000000"
          />
        </div>

        <div className="relative z-10 flex flex-col items-center justify-end w-full p-12 pb-16 pointer-events-none">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.5, ease: 'easeOut' }}
            className="flex flex-col items-center text-center"
          >
            <h2 className="font-heading text-4xl font-bold text-white mb-4">Voira</h2>
            <div className="text-xl text-white/65">
              {'Your voice, refined.'.split('').map((char, i) => (
                <motion.span
                  key={i}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.4,
                    delay: 0.8 + i * 0.025,
                    ease: [0.25, 0.1, 0.25, 1],
                  }}
                  style={{ display: char === ' ' ? 'inline' : 'inline-block' }}
                >
                  {char === ' ' ? '\u00A0' : char}
                </motion.span>
              ))}
            </div>
          </motion.div>
        </div>
      </div>

      {/* Right Side: Auth Form */}
      <div className="w-full lg:w-2/5 bg-zinc-50 dark:bg-[#0D0D12] flex items-center justify-center p-8">
        <motion.div
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6 }}
          className="w-full max-w-md"
        >
          <div className="mb-8 flex items-center justify-between">
            <Link to={createPageUrl('Landing')} className="flex items-center gap-3 hover:opacity-80 transition-opacity">
              <img
                src="/assets/VoiraLogoMain.png"
                onError={(e) => { e.currentTarget.src = '/favicon.ico'; }}
                alt="Voira logo"
                className="w-10 h-10 object-contain"
              />
              <span className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">Voira</span>
            </Link>
            <ThemeToggle showLabel={false} />
          </div>

          <div className="mb-8">
            <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">
              {isSignUp ? 'Create your account' : 'Welcome back'}
            </h1>
            <p className="text-zinc-600 dark:text-zinc-500">
              Speak naturally. Let Voira shape it.
            </p>
          </div>

          {!forgotMode ? (
            <form onSubmit={handleSubmit} className="space-y-6">
              {isSignUp && (
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-zinc-800 dark:text-zinc-300">Full Name</Label>
                  <Input
                    id="name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Enter your name"
                    className={inputClassName}
                    required
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email" className="text-zinc-800 dark:text-zinc-300">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="user@example.com"
                  className={inputClassName}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-zinc-800 dark:text-zinc-300">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={passwordVisible ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className={`${inputClassName} pr-10`}
                    required
                  />
                  <button
                    type="button"
                    aria-label={passwordVisible ? 'Hide password' : 'Show password'}
                    onClick={togglePasswordVisibility}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                  >
                    {passwordVisible ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="bg-rose-500/10 border border-rose-500/30 rounded-lg p-3 text-sm text-rose-400">
                  {error}
                </div>
              )}

              {signUpSuccess && (
                <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3 text-sm text-emerald-400">
                  <p className="font-medium">Account created!</p>
                  <p className="mt-1">Please check your email for a confirmation link before signing in.</p>
                </div>
              )}

              {!isSignUp && (
                <div className="text-sm text-right">
                  <button type="button" onClick={() => setForgotMode(true)} className="text-accent hover:underline">
                    Forgot password?
                  </button>
                </div>
              )}

              <Button
                type="submit"
                disabled={isLoading}
                className="w-full h-12 bg-accent hover:bg-accent/90 text-white text-base disabled:opacity-50"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    {isSignUp ? 'Signing up...' : 'Signing in...'}
                  </>
                ) : (
                  isSignUp ? 'Sign Up' : 'Sign In'
                )}
              </Button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-zinc-300 dark:border-white/10" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-4 bg-zinc-50 dark:bg-[#0D0D12] text-zinc-600 dark:text-zinc-500">or</span>
                </div>
              </div>

              <Button
                type="button"
                variant="outline"
                onClick={handleGoogleSignIn}
                disabled={isLoading}
                className="w-full h-12 border-zinc-300 dark:border-white/10 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-white/5 disabled:opacity-50"
              >
                <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="currentColor"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="currentColor"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                Continue with Google
              </Button>
            </form>
          ) : (
            <div className="space-y-2">
              {forgotSent ? (
                <div className="text-sm text-emerald-600 dark:text-emerald-400">Check your email for a reset link.</div>
              ) : (
                <>
                  <Input
                    id="forgot-email"
                    type="email"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    placeholder="your@email.com"
                    className={inputClassName}
                  />
                  <div className="flex gap-2 justify-end">
                    <button
                      type="button"
                      onClick={() => { setForgotMode(false); setForgotEmail(''); setError(''); }}
                      className="text-sm text-zinc-600 dark:text-zinc-400"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleForgotSend}
                      className="px-4 py-2 rounded-md bg-accent text-white hover:bg-accent/90"
                    >
                      Send reset
                    </button>
                  </div>
                </>
              )}
              {error && (
                <div className="bg-rose-500/10 border border-rose-500/30 rounded-lg p-3 text-sm text-rose-400">
                  {error}
                </div>
              )}
            </div>
          )}

          <div className="mt-8 text-center">
            {forgotMode && forgotSent ? (
              <button
                onClick={() => { setForgotMode(false); setForgotEmail(''); setForgotSent(false); setError(''); }}
                className="text-zinc-600 dark:text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300 transition-colors"
              >
                Go back to sign in
              </button>
            ) : (
              <button
                onClick={() => setIsSignUp(!isSignUp)}
                className="text-zinc-600 dark:text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300 transition-colors"
              >
                {isSignUp ? (
                  <>
                    Already have an account?{' '}
                    <span className="text-accent font-medium">Sign in</span>
                  </>
                ) : (
                  <>
                    Don&apos;t have an account?{' '}
                    <span className="text-accent font-medium">Sign up</span>
                  </>
                )}
              </button>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
