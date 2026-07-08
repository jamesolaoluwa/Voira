import React, { useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useReducedMotion } from 'framer-motion';
import { createPageUrl } from '@/utils';
import Container from '@/components/layout/Container';

export const HERO_VIDEO_SRC =
  'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260314_131748_f2ca2a28-fed7-44c8-b9a9-bd9acdd5ec31.mp4';

const HERO_NAVY = 'hsl(201, 100%, 13%)';

export default function LandingHero() {
  const videoRef = useRef(null);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (prefersReducedMotion) {
      video.pause();
    } else {
      video.play().catch(() => {});
    }
  }, [prefersReducedMotion]);

  return (
    <section
      className="relative min-h-screen w-full overflow-hidden"
      style={{ backgroundColor: HERO_NAVY }}
      aria-label="Voira hero"
    >
      {/* Background video */}
      <div className="absolute inset-0 z-0" aria-hidden="true">
        {!prefersReducedMotion && (
          <video
            ref={videoRef}
            autoPlay
            loop
            muted
            playsInline
            className="absolute inset-0 h-full w-full object-cover"
            poster="/assets/voira-media/Anna'sAvatar.jpg"
          >
            <source src={HERO_VIDEO_SRC} type="video/mp4" />
          </video>
        )}
        {/* Scrim for text contrast (WCAG AA over variable video frames) */}
        <div className="absolute inset-0 bg-[hsl(201,100%,13%)]/40" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/20 to-[hsl(201,100%,13%)]/80" />
      </div>

      {/* Glass nav */}
      <header className="absolute inset-x-0 top-0 z-30">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-8 lg:px-12">
          <Link
            to={createPageUrl('Landing')}
            className="group flex items-center gap-2 no-underline"
          >
            <img
              src="/assets/VoiraLogoMain.png"
              alt=""
              className="h-10 w-10 object-contain transition-transform duration-normal ease-smooth group-hover:scale-105"
            />
            <span className="font-display-landing text-xl text-white tracking-tight">
              Voira
            </span>
          </Link>

          <nav className="flex items-center gap-2 sm:gap-3" aria-label="Primary">
            <Link
              to={createPageUrl('Auth')}
              className="hidden rounded-xl px-4 py-2 text-sm font-medium text-white/80 transition-colors duration-300 hover:text-white sm:inline-block"
            >
              Login
            </Link>
            <Link
              to={createPageUrl('Auth') + '?signup=true'}
              className="liquid-glass rounded-xl px-4 py-2 text-sm font-medium text-white transition-all duration-300 hover:bg-white/10 no-underline"
            >
              Get Started
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero copy */}
      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-5 py-24 sm:px-8">
        <Container size="wide" className="text-center">
          <h1
            className="font-display-landing animate-fade-rise mx-auto max-w-4xl text-balance text-[clamp(2.75rem,6vw,5.5rem)] leading-[1.05] tracking-[-0.03em] text-white"
          >
            Say it{' '}
            <em className="text-white/55 not-italic">out loud.</em>
          </h1>
          <p className="animate-fade-rise-delay mx-auto mt-6 max-w-xl text-balance text-lg leading-relaxed text-white/75 sm:text-xl">
            Voira turns spoken thoughts into polished writing that still sounds like you.
          </p>
          <div className="animate-fade-rise-delay-2 mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link
              to={createPageUrl('Auth') + '?signup=true'}
              className="liquid-glass inline-flex h-12 items-center rounded-xl px-8 text-base font-medium text-white transition-all duration-300 hover:bg-white/10 no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60"
            >
              Get Started
            </Link>
            <Link
              to={createPageUrl('Auth')}
              className="inline-flex h-12 items-center rounded-xl px-6 text-base font-medium text-white/70 transition-colors duration-300 hover:text-white no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40"
            >
              Sign in
            </Link>
          </div>
        </Container>
      </div>
    </section>
  );
}
