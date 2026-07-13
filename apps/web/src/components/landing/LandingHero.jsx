import React, { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { ArrowRight } from 'lucide-react';

/* Template hero clip for now. Swap for the Anna Pixar-themed video later. */
const HERO_VIDEO_URL =
  'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260328_115001_bcdaa3b4-03de-47e7-ad63-ae3e392c32d4.mp4';

const FADE_MS = 500;
const FADE_OUT_LEAD_S = 0.55; // begin fade-out this many seconds before the end

/**
 * Full-screen cinematic hero: a muted, autoplaying background video that loops
 * with a custom JS crossfade (no CSS transitions) so the loop seam is invisible.
 * Falls back to a static first frame under prefers-reduced-motion.
 */
export default function LandingHero() {
  const videoRef = useRef(null);
  const rafRef = useRef(null);
  const fadingOutRef = useRef(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;

    const prefersReduced =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Reduced motion: hold a static frame, no loop churn, no fades.
    if (prefersReduced) {
      video.style.opacity = '1';
      video.pause();
      try {
        video.currentTime = 0;
      } catch {
        /* currentTime can throw before metadata loads; ignore */
      }
      return undefined;
    }

    const cancelFade = () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };

    // Fade opacity to `target` over FADE_MS, resuming from the current opacity.
    const fadeTo = (target) => {
      cancelFade();
      const from = parseFloat(video.style.opacity || '0');
      const start = performance.now();
      const step = (now) => {
        const t = Math.min((now - start) / FADE_MS, 1);
        video.style.opacity = String(from + (target - from) * t);
        if (t < 1) {
          rafRef.current = requestAnimationFrame(step);
        } else {
          rafRef.current = null;
        }
      };
      rafRef.current = requestAnimationFrame(step);
    };

    const startPlayback = () => {
      video.style.opacity = '0';
      fadingOutRef.current = false;
      const p = video.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
      fadeTo(1);
    };

    const handleTimeUpdate = () => {
      const { duration, currentTime } = video;
      if (!duration || Number.isNaN(duration)) return;
      if (duration - currentTime <= FADE_OUT_LEAD_S && !fadingOutRef.current) {
        fadingOutRef.current = true;
        fadeTo(0);
      }
    };

    const handleEnded = () => {
      video.style.opacity = '0';
      setTimeout(() => {
        try {
          video.currentTime = 0;
        } catch {
          /* ignore */
        }
        startPlayback();
      }, 100);
    };

    video.style.opacity = '0';
    if (video.readyState >= 2) {
      startPlayback();
    } else {
      video.addEventListener('loadeddata', startPlayback, { once: true });
    }
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('ended', handleEnded);

    return () => {
      cancelFade();
      video.removeEventListener('loadeddata', startPlayback);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('ended', handleEnded);
    };
  }, []);

  return (
    <section className="relative min-h-screen overflow-hidden bg-black">
      {/* Background video — decorative, shifted down so the lower framing shows */}
      <video
        ref={videoRef}
        src={HERO_VIDEO_URL}
        muted
        autoPlay
        playsInline
        preload="auto"
        aria-hidden="true"
        style={{ opacity: 0 }}
        className="pointer-events-none absolute inset-0 h-full w-full translate-y-[17%] object-cover"
      />

      {/* Scrim — keeps text >= AA over any video frame. Linear wash plus a
          centered radial pool behind the hero copy so contrast never depends
          on a specific (possibly bright) video frame. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/45 to-black/80"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(60% 45% at 50% 52%, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0) 70%)',
        }}
      />

      {/* Nav */}
      <header className="relative z-20">
        <div className="mx-auto flex h-16 w-full items-center justify-between px-5 sm:px-8 lg:px-12">
          <Link to={createPageUrl('Landing')} className="group flex items-center">
            <img
              src="/assets/VoiraLogoMain.png"
              alt="Voira"
              className="h-14 w-14 object-contain transition-transform duration-normal ease-smooth group-hover:scale-105"
            />
          </Link>
          <div className="flex items-center gap-3">
            <Link
              to={createPageUrl('Auth')}
              className="inline-flex h-10 items-center rounded-xl border border-white/[0.15] bg-white/[0.08] px-6 text-sm font-medium text-white/90 no-underline backdrop-blur-md transition-all duration-300 hover:bg-white/[0.14] hover:text-white"
            >
              Login
            </Link>
            <Link
              to={createPageUrl('Auth') + '?signup=true'}
              className="inline-flex h-10 items-center rounded-xl bg-white px-6 text-sm font-medium text-zinc-900 no-underline transition-all duration-300 hover:bg-white/90"
            >
              Sign up
            </Link>
          </div>
        </div>
      </header>

      {/* Hero content */}
      <div className="relative z-10 flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center px-6 text-center">
        <h1 className="font-display-landing animate-fade-rise text-5xl leading-[1.05] tracking-tight text-white [text-shadow:0_2px_24px_rgba(0,0,0,0.5)] sm:text-6xl lg:text-7xl xl:text-8xl">
          Say it out loud.
        </h1>
        <p className="animate-fade-rise-delay mt-6 max-w-xl text-base leading-relaxed text-white/90 [text-shadow:0_1px_12px_rgba(0,0,0,0.6)] sm:text-lg">
          Voira turns what you say into writing that still sounds like you.
        </p>
        <div className="animate-fade-rise-delay-2 mt-10">
          <Link
            to={createPageUrl('Auth') + '?signup=true'}
            className="inline-flex h-12 items-center gap-2 rounded-xl border border-white/[0.15] bg-white/[0.08] px-8 text-base font-medium text-white/90 no-underline backdrop-blur-md transition-all duration-300 hover:bg-white/[0.14] hover:text-white"
          >
            Get Started
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}
