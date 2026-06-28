import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import VoiceVisualizer from '@/components/ui/VoiceVisualizer';
import ThemeToggle from '@/components/theme/ThemeToggle';
import { auth } from '@/components/services/api';
import { Loader2 } from 'lucide-react';
import { Eye, EyeOff } from 'lucide-react';
import { supabase } from '@/components/lib/supabase';
import { safeParseEmail, safeParsePassword } from '@/lib/validation';
import { normalizeEmail } from '@/lib/sanitize';
import { useAuth } from '@/contexts/AuthContext';

// Auth flow timeout - if session not established after this, show error
const AUTH_TIMEOUT_MS = 8000;

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
  
  // Ref to prevent double-submission (covers race window before isLoading is set)
  const authInFlightRef = useRef(false);

  // forgot password flow
  const [forgotMode, setForgotMode] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSent, setForgotSent] = useState(false);

  // Redirect when session is established (handles both email login and OAuth)
  useEffect(() => {
    console.log('[Auth] useEffect - authLoading:', authLoading, 'session:', !!session);
    if (!authLoading && session) {
      console.log('[Auth] Session detected, redirecting to /home');
      navigate('/home', { replace: true });
    }
  }, [session, authLoading, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Prevent double-submission (covers race window before isLoading state updates)
    if (authInFlightRef.current || isLoading) {
      console.debug('[Auth] Sign-in already in progress, ignoring duplicate submit');
      return;
    }
    
    authInFlightRef.current = true;
    setError('');
    setIsLoading(true);
    setSignUpSuccess(false);

    try {
      // Validate and normalize inputs before calling auth
      const emailResult = safeParseEmail(email);
      if (!emailResult.success) throw new Error('Please enter a valid email address');
      const normalizedEmail = normalizeEmail(emailResult.data);

      const pwResult = safeParsePassword(password);
      if (!pwResult.success) throw new Error('Password must be at least 10 characters');

      if (isSignUp) {
        const result = await auth.signUp(normalizedEmail, password, name);
        
        // Check if email confirmation is required
        // Supabase returns user but session is null when confirmation is required
        if (result?.user && !result?.session) {
          setSignUpSuccess(true);
          setIsLoading(false);
          authInFlightRef.current = false;
          return;
        }
        // Immediate session (no confirmation): reset before redirect so returning to this page doesn't block future sign-in
        authInFlightRef.current = false;
        setIsLoading(false);
        // Redirect will happen via useEffect when session is set
      } else {
        const result = await auth.signIn(normalizedEmail, password);
        
        // signIn should return a session. If it succeeded but no session,
        // wait briefly for onAuthStateChange, then check explicitly
        if (result?.session) {
          // Session returned directly, redirect should happen via useEffect
          // Set a timeout fallback in case useEffect doesn't trigger
          setTimeout(async () => {
            if (authInFlightRef.current) {
              // Still waiting - check session manually
              const { data: { session: currentSession } } = await supabase.auth.getSession();
              if (currentSession) {
                console.log('[Auth] Timeout fallback: session found, navigating');
                navigate('/home', { replace: true });
                // Authentication succeeded; clear in-flight flag for consistency
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
          // Edge case: signIn returned without throwing but no session present.
          // Reset loading state so the user isn't stuck indefinitely.
          console.warn('[Auth] signIn completed without session; resetting state');
          setError('Sign-in did not complete. Please try again.');
          setIsLoading(false);
          authInFlightRef.current = false;
        }
      }
      // Don't navigate here - let useEffect handle it when session updates
      // Don't setIsLoading(false) on success - page will redirect
      
    } catch (err) {
      console.error('[Auth] Error:', err);
      setError(err.message || 'Authentication failed');
      setIsLoading(false);
      authInFlightRef.current = false;
    }
  };

  const handleGoogleSignIn = async () => {
    // Prevent spam-clicking Google button too
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
      // send password reset email; redirect back to our reset-password route
      const { data, error: supError } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
        redirectTo: `${window.location.origin}/reset-password`
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
      {/* Left Side: Visual / Animation */}
      <div className="hidden lg:flex lg:w-3/5 bg-zinc-100 dark:bg-[#0a0a0f] relative overflow-hidden">
        {/* Ambient background effects */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-violet-500/20 rounded-full blur-3xl animate-pulse" />
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-teal-500/20 rounded-full blur-3xl animate-pulse" 
               style={{ animationDelay: '1s' }} />
        </div>

        {/* Central animated element */}
        <div className="relative z-10 flex flex-col items-center justify-center w-full p-12">
          {/* Voice Visualizer */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1, ease: 'easeOut' }}
          >
            <VoiceVisualizer size={320} isActive={true} amplitude={0.4} />
          </motion.div>

          {/* Brand Section */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.5, ease: 'easeOut' }}
            className="mt-16 flex flex-col items-center"
          >
            <h2 className="text-4xl font-bold text-zinc-900 dark:text-zinc-100 mb-4">Voira</h2>
            
            {/* Animated Tagline with Letter Stagger */}
            <div className="text-xl text-zinc-700 dark:text-zinc-400">
              {'Your voice, refined.'.split('').map((char, i) => (
                <motion.span
                  key={i}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ 
                    duration: 0.4, 
                    delay: 0.8 + i * 0.025, 
                    ease: [0.25, 0.1, 0.25, 1]
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
          {/* Logo - routes back to Landing */}
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

          {/* Render the sign-in / sign-up form only when not in forgot mode */}
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
                    className="bg-white dark:bg-[#1a1a24] border-zinc-300 dark:border-white/10 focus:border-violet-500/50 text-zinc-900 dark:text-zinc-100"
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
                  className="bg-white dark:bg-[#1a1a24] border-zinc-300 dark:border-white/10 focus:border-violet-500/50 text-zinc-900 dark:text-zinc-100"
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
                    className="bg-white dark:bg-[#1a1a24] border-zinc-300 dark:border-white/10 focus:border-violet-500/50 text-zinc-900 dark:text-zinc-100 pr-10"
                    required
                  />
                  <button
                    type="button"
                    aria-label={passwordVisible ? 'Hide password' : 'Show password'}
                    onClick={togglePasswordVisibility}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-800"
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

              {/* Sign-up success message - shown when email confirmation is required */}
              {signUpSuccess && (
                <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3 text-sm text-emerald-400">
                  <p className="font-medium">Account created! 🎉</p>
                  <p className="mt-1">Please check your email for a confirmation link before signing in.</p>
                </div>
              )}

              {/* Forgot password link is shown on sign-in only and will toggle the forgotMode */}
              {!isSignUp && (
                <div className="text-sm text-right">
                  <button type="button" onClick={() => setForgotMode(true)} className="text-violet-500 hover:underline">Forgot password?</button>
                </div>
              )}

              <Button
                type="submit"
                disabled={isLoading}
                className="w-full h-12 bg-gradient-to-r from-violet-600 to-violet-500 hover:from-violet-500 hover:to-violet-400 text-white text-base disabled:opacity-50"
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
                  <div className="w-full border-t border-zinc-300 dark:border-white/10"></div>
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
                <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
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
            // Forgot-password UI is rendered outside the form so it cannot affect sign-in form behavior
            <div className="space-y-2">
              {forgotSent ? (
                <div className="text-sm text-teal-600">Check your email for a reset link.</div>
              ) : (
                <>
                  <Input
                    id="forgot-email"
                    type="email"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    placeholder="your@email.com"
                    className="bg-white dark:bg-[#1a1a24] border-zinc-300 dark:border-white/10 focus:border-violet-500/50 text-zinc-900 dark:text-zinc-100"
                  />
                  <div className="flex gap-2 justify-end">
                    <button type="button" onClick={() => { setForgotMode(false); setForgotEmail(''); setError(''); }} className="text-sm text-zinc-600">Cancel</button>
                    <button type="button" onClick={handleForgotSend} className="px-4 py-2 rounded-md bg-violet-600 text-white hover:opacity-90">Send reset</button>
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
                    <span className="text-violet-400 font-medium">Sign in</span>
                  </>
                ) : (
                  <>
                    Don't have an account?{' '}
                    <span className="text-violet-400 font-medium">Sign up</span>
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