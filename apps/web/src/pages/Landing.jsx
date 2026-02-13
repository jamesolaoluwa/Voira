import React, { useRef } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { motion, useScroll, useTransform } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { GradientButton } from '@/components/ui/GradientButton';
import VoiceVisualizer from '@/components/ui/VoiceVisualizer';
import ThemeToggle from '@/components/theme/ThemeToggle';
import Container from '@/components/layout/Container';
import { MotionDiv } from '@/components/ui/Motion';
import EtherealShadow from '@/components/ui/EtherealShadow';
import EtherealShadowFilter from '@/components/ui/EtherealShadowFilter';
import { WavyBackground } from '@/components/ui/WavyBackground';
import { TextLoop } from '@/components/ui/TextLoop';
import { FeatureTabs } from '@/components/ui/FeatureTabs';
import { TestimonialSection } from '@/components/ui/TestimonialSection';
import {
  ArrowRight,
  GraduationCap,
  Award,
  Mic,
  FileText,
  Sparkles,
} from 'lucide-react';

/* ─── Animation presets (slower, smoother) ───────────────────────────── */
const SMOOTH = [0.22, 1, 0.36, 1];
const HERO_STAGGER = { staggerChildren: 0.1, delayChildren: 0.15 };
const itemUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.7, ease: SMOOTH },
};

/* ─── Deep purple palette — seamless backgrounds ─────────────────────── */
const PURPLE_DARK = '#0A0515';
const PURPLE_MID = '#110C24';

/* ─── Feature scenes — full-viewport background with text overlay ────── */
const FEATURE_SCENES = [
  {
    id: 'college',
    headline: 'From brainstorm to\npersonal statement',
    description: 'Speak about your experiences naturally — Voira removes the fillers, sharpens your voice, and helps admissions hear the real you.',
    cta: 'Try Now',
    bgImage: 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=1920&q=80',
  },
  {
    id: 'scholarships',
    headline: 'Scholarship essays\nthat stand out',
    description: 'Capture your motivation in your own words, then refine without losing authenticity. Rough draft to submission-ready in minutes.',
    cta: 'Try Now',
    bgImage: 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=1920&q=80',
  },
  {
    id: 'interviews',
    headline: 'Walk into interviews\nwith confidence',
    description: 'Practice answers out loud, get a polished version in seconds. Prepare for behavioral and situational questions with clarity.',
    cta: 'Try Now',
    bgImage: 'https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?auto=format&fit=crop&w=1920&q=80',
  },
  {
    id: 'career',
    headline: 'Career prep, refined\nby your voice',
    description: 'Whether it\'s a cover letter or an elevator pitch — speak your truth and let Voira shape it into something hiring managers remember.',
    cta: 'Try Now',
    bgImage: 'https://images.unsplash.com/photo-1521737711867-e3b97375f902?auto=format&fit=crop&w=1920&q=80',
  },
];

/* ─── Feature tabs data ──────────────────────────────────────────────── */
const FEATURE_TABS = [
  {
    value: 'applications',
    icon: <FileText className="h-auto w-4 shrink-0" />,
    label: 'Applications',
    content: {
      badge: 'College & Graduate',
      title: 'Craft personal statements that sound like you.',
      description: 'Voira takes your spoken ideas and transforms them into compelling essays. No more staring at a blank page — just speak, refine, and submit with confidence.',
      icon: <GraduationCap className="h-16 w-16 text-accent/30" />,
    },
  },
  {
    value: 'scholarships',
    icon: <Award className="h-auto w-4 shrink-0" />,
    label: 'Scholarships',
    content: {
      badge: 'Financial Aid',
      title: 'Stand out in scholarship essays.',
      description: 'From rough motivation to polished narrative. Capture what drives you in your own words, and let Voira handle the refinement — keeping every ounce of authenticity.',
      icon: <Award className="h-16 w-16 text-accent/30" />,
    },
  },
  {
    value: 'interviews',
    icon: <Mic className="h-auto w-4 shrink-0" />,
    label: 'Interviews',
    content: {
      badge: 'Prep & Practice',
      title: 'Prepare answers that land.',
      description: 'Practice behavioral and situational questions out loud. Voira gives you a polished version in seconds so you walk into every interview with clarity and poise.',
      icon: <Mic className="h-16 w-16 text-accent/30" />,
    },
  },
  {
    value: 'career',
    icon: <Sparkles className="h-auto w-4 shrink-0" />,
    label: 'Career Prep',
    content: {
      badge: 'Professional Growth',
      title: 'Elevator pitches & cover letters, refined.',
      description: 'Whether you\'re networking or applying — speak your truth and let Voira shape it into something hiring managers and recruiters remember.',
      icon: <Sparkles className="h-16 w-16 text-accent/30" />,
    },
  },
];

/* ─── Testimonials data — 4 people ───────────────────────────────────── */
const TESTIMONIALS = [
  {
    id: 1,
    quote: 'Voira helped me turn a rambling voice note into a personal statement that got me into my dream school. It kept my voice — just made it better.',
    name: 'Sarah M.',
    role: 'College Freshman',
    imageSrc: 'https://images.unsplash.com/photo-1581403341630-a6e0b9d2d257?auto=format&fit=crop&w=900&q=80',
  },
  {
    id: 2,
    quote: 'I used to freeze when writing scholarship essays. Now I just talk through my ideas and Voira does the heavy lifting. Absolute game-changer.',
    name: 'Marcus J.',
    role: 'Scholarship Recipient',
    imageSrc: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=900&q=80',
  },
  {
    id: 3,
    quote: 'Interview prep went from stressful to smooth. I practiced out loud, got polished answers back, and walked in with real confidence.',
    name: 'Priya K.',
    role: 'Software Intern',
    imageSrc: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=900&q=80',
  },
  {
    id: 4,
    quote: 'I spoke my cover letter into Voira in 3 minutes and it came back cleaner than anything I\'d spent hours typing. This is the future of writing.',
    name: 'David L.',
    role: 'Job Seeker',
    imageSrc: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=900&q=80',
  },
];

/* ─── Full-viewport cinematic feature scene with strong parallax ──────── */
function CinematicScene({ scene }) {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end start'],
  });

  // Background moves at ~40% of scroll speed — strong visible parallax depth
  const bgY = useTransform(scrollYProgress, [0, 1], ['-15%', '15%']);
  // Zoom: starts zoomed-in, settles at center, slightly zooms again on exit
  const bgScale = useTransform(scrollYProgress, [0, 0.4, 0.6, 1], [1.2, 1.05, 1.05, 1.15]);
  // Content slides up slightly as user scrolls (counter-parallax for depth)
  const contentY = useTransform(scrollYProgress, [0, 0.5, 1], [60, 0, -40]);
  // Content fades in as it enters center, fades out as it leaves
  const contentOpacity = useTransform(scrollYProgress, [0, 0.25, 0.5, 0.75, 1], [0, 1, 1, 1, 0]);

  return (
    <section ref={ref} className="relative w-full h-screen overflow-hidden" style={{ background: PURPLE_DARK }}>
      {/* Background image — parallax layer (taller than viewport for shift room) */}
      <motion.div
        className="absolute -inset-x-0 -top-[15%] -bottom-[15%] z-0 will-change-transform"
        style={{ y: bgY, scale: bgScale }}
      >
        <img
          src={scene.bgImage}
          alt=""
          className="h-full w-full object-cover"
          loading="lazy"
        />
        {/* Overlays — seamless blending */}
        <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/55 to-black/20" />
        <div className="absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-[#0A0515] to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-[#0A0515] to-transparent" />
        <div className="absolute inset-0 bg-[#5B5CF6]/[0.04] mix-blend-overlay" />
      </motion.div>

      {/* Content — counter-parallax (moves opposite to bg for depth) */}
      <motion.div
        className="relative z-10 flex h-screen items-center will-change-transform"
        style={{ y: contentY, opacity: contentOpacity }}
      >
        <div className="w-full max-w-7xl mx-auto px-5 sm:px-8 lg:px-12">
          <div className="max-w-xl lg:max-w-2xl">
            <MotionDiv
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.9, ease: SMOOTH }}
            >
              <h3 className="font-heading text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-bold tracking-tight text-white leading-[1.1] mb-6 whitespace-pre-line">
                {scene.headline}
              </h3>
            </MotionDiv>
            <MotionDiv
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.9, ease: SMOOTH, delay: 0.1 }}
            >
              <p className="text-base sm:text-lg lg:text-xl text-white/65 leading-relaxed mb-10 max-w-lg">
                {scene.description}
              </p>
            </MotionDiv>
            <MotionDiv
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.7, ease: SMOOTH, delay: 0.2 }}
            >
              <Link to={createPageUrl('Auth') + '?signup=true'} className="no-underline">
                <Button
                  size="lg"
                  className="h-11 px-8 bg-accent text-white hover:bg-accent/90 transition-colors duration-300"
                >
                  {scene.cta}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </MotionDiv>
          </div>
        </div>
      </motion.div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   MAIN LANDING PAGE
═══════════════════════════════════════════════════════════════════════ */
export default function Landing() {
  const heroRef = useRef(null);
  const { scrollYProgress: heroScroll } = useScroll({
    target: heroRef,
    offset: ['start start', 'end start'],
  });
  // Hero text floats up as user scrolls down — creates depth against static bg
  const heroTextY = useTransform(heroScroll, [0, 1], [0, -120]);
  const heroTextOpacity = useTransform(heroScroll, [0, 0.6, 1], [1, 0.6, 0]);

  return (
    <div className="min-h-screen overflow-x-hidden" style={{ background: PURPLE_DARK, color: '#F5F5F7' }}>

      {/* ═══ 1. HERO + ORB — Single shared background ═════════════════ */}
      <section ref={heroRef} className="relative w-full overflow-hidden" style={{ background: PURPLE_DARK }}>
        {/* Header: absolute so it floats on top */}
        <header className="absolute inset-x-0 top-0 z-30">
          <div className="w-full mx-auto flex h-16 items-center justify-between px-5 sm:px-8 lg:px-12">
            <Link to={createPageUrl('Landing')} className="flex items-center group">
              <img
                src="/assets/VoiraLogoMain.png"
                alt="Voira"
                className="h-14 w-14 object-contain transition-transform duration-normal ease-smooth group-hover:scale-105"
              />
            </Link>
            <div className="flex items-center gap-3">
              <ThemeToggle showLabel={false} />
              <Link to={createPageUrl('Auth')} className="no-underline">
                <button className="h-10 px-6 rounded-xl text-sm font-medium text-white/90 hover:text-white backdrop-blur-md bg-white/[0.08] border border-white/[0.15] hover:bg-white/[0.14] transition-all duration-300 cursor-pointer">
                  Login
                </button>
              </Link>
              <Link to={createPageUrl('Auth') + '?signup=true'} className="no-underline">
                <button className="h-10 px-6 rounded-xl text-sm font-medium text-zinc-900 bg-white hover:bg-white/90 transition-all duration-300 cursor-pointer">
                  Sign up
                </button>
              </Link>
            </div>
          </div>
        </header>

        {/* Wavy canvas — pinned to the hero viewport area only */}
        <div className="absolute inset-x-0 top-0 h-screen z-0 overflow-hidden">
          <WavyBackground
            containerClassName="absolute inset-0 w-full h-full"
            className="w-full h-full"
            colors={['#5B5CF6', '#7c7df8', '#9d9efa']}
            backgroundFill={PURPLE_DARK}
            blur={12}
            speed="slow"
            waveOpacity={0.38}
            waveWidth={48}
            waveCenterY={0.49}
          >
            <div className="sr-only" />
          </WavyBackground>
        </div>
        {/* Ethereal effects — span the full section seamlessly */}
        <EtherealShadowFilter
          color="rgba(193, 53, 135, 0.5)"
          animation={{ scale: 80, speed: 70 }}
          sizing="fill"
          enabled
        />
        <EtherealShadow variant="absolute" opacity="hero" className="inset-0 z-0" />

        {/* Hero content — floats up on scroll for depth */}
        <div className="relative z-10 flex min-h-screen flex-col items-center justify-center py-24 px-4 sm:px-6 lg:px-8">
          <motion.div style={{ y: heroTextY, opacity: heroTextOpacity }} className="will-change-transform">
          <Container size="wide" className="flex flex-col items-center justify-center text-center">
            <motion.div
              className="w-full max-w-3xl mx-auto"
              initial="initial"
              animate="animate"
              variants={HERO_STAGGER}
            >
              <motion.h1
                variants={itemUp}
                className="font-heading text-6xl sm:text-7xl lg:text-8xl xl:text-9xl font-bold tracking-[0.04em] sm:tracking-[0.06em] lg:tracking-[0.08em] mb-6 text-white"
              >
                VOIRA
              </motion.h1>
              <motion.p
                variants={itemUp}
                className="font-heading text-lg sm:text-xl lg:text-2xl font-medium tracking-tight mb-3 text-white"
              >
                Speak your truth. Voira refines it.
              </motion.p>
              <motion.div variants={itemUp} className="mb-10 h-8 flex items-center justify-center">
                <TextLoop interval={3} className="text-sm sm:text-base text-white/50">
                  <span>Turn your spoken words into polished essays.</span>
                  <span>Voira knows you and learns from you.</span>
                  <span>From rough ideas to submission-ready answers.</span>
                  <span>Your voice, refined — never replaced.</span>
                </TextLoop>
              </motion.div>
              <motion.div variants={itemUp} className="flex flex-wrap gap-4 justify-center">
                <Link to={createPageUrl('Auth') + '?signup=true'} className="no-underline">
                  <button
                    type="button"
                    className="h-12 px-8 rounded-xl text-base font-medium text-white/90 hover:text-white backdrop-blur-md bg-white/[0.08] border border-white/[0.15] hover:bg-white/[0.14] transition-all duration-300 cursor-pointer"
                  >
                    Get Started
                  </button>
                </Link>
              </motion.div>
            </motion.div>
          </Container>
          </motion.div>
        </div>

        {/* Orb content — same section, same background, no seam */}
        <div className="relative z-10 py-24 sm:py-32 lg:py-40">
          <MotionDiv
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.9, ease: SMOOTH }}
            className="flex flex-col items-center text-center mx-auto max-w-4xl px-5 sm:px-8"
          >
            {/* Orb with floating labels (No fillers, Your voice, Refined output) */}
            <div className="relative flex justify-center items-center mb-12" style={{ width: 320, height: 320 }}>
              <motion.div
                className="absolute flex justify-center items-center"
                initial={{ opacity: 0, scale: 0.92 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 1, ease: SMOOTH }}
              >
                <VoiceVisualizer size={220} isActive amplitude={0.2} />
              </motion.div>
              <motion.span
                className="absolute top-[8%] left-[18%] px-3 py-1.5 rounded-full text-sm font-medium bg-white/10 text-white/90 backdrop-blur-sm border border-white/10 shadow-sm"
                animate={{ y: [0, -4, 0] }}
                transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
              >
                No fillers
              </motion.span>
              <motion.span
                className="absolute top-[42%] right-[5%] px-3 py-1.5 rounded-full text-sm font-medium bg-white/10 text-white/90 backdrop-blur-sm border border-white/10 shadow-sm"
                animate={{ y: [0, 4, 0] }}
                transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut', delay: 0.3 }}
              >
                Your voice
              </motion.span>
              <motion.span
                className="absolute bottom-[12%] left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full text-sm font-medium bg-white/10 text-white/90 backdrop-blur-sm border border-white/10 shadow-sm"
                animate={{ y: [0, -3, 0] }}
                transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut', delay: 0.6 }}
              >
                Refined output
              </motion.span>
            </div>
            <h2 className="font-heading text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight mb-5 text-white">
              Speak. Refine. Shine.
            </h2>
            <p className="text-lg max-w-xl text-white/50 leading-relaxed">
              Voira turns your raw spoken words into clear, confident copy — without changing your voice.
              Less filler, more impact.
            </p>
          </MotionDiv>
        </div>
      </section>

      {/* ═══ 3. CINEMATIC FEATURE SCENES — each full viewport ═════════ */}
      {FEATURE_SCENES.map((scene) => (
        <CinematicScene key={scene.id} scene={scene} />
      ))}

      {/* ═══ 4–6. TESTIMONIALS → FEATURE TABS → CTA → FOOTER
           Shared ethereal background for consistent color throughout ═══ */}
      <section className="relative w-full overflow-hidden" style={{ background: PURPLE_DARK }}>
        {/* Shared ethereal effects — match hero wave color */}
        <EtherealShadowFilter
          color="rgba(193, 53, 135, 0.35)"
          animation={{ scale: 60, speed: 50 }}
          sizing="fill"
          enabled
        />
        <EtherealShadow variant="absolute" opacity="hero" className="inset-0 z-0" color="rgba(193, 53, 135, 0.4)" />

        {/* ── Testimonials ────────────────────────────────────────── */}
        <div className="relative z-10">
          <TestimonialSection
            title="Hear from students like you"
            subtitle="Real stories from real people who used Voira to find their voice."
            testimonials={TESTIMONIALS}
          />
        </div>

        {/* ── Feature Tabs ────────────────────────────────────────── */}
        <div className="relative z-10">
          <FeatureTabs
            badge="Voira"
            heading="Built for moments that shape your future."
            description="Whether you're applying to college, going for a scholarship, or prepping for interviews."
            tabs={FEATURE_TABS}
          />
        </div>

        {/* ── Final CTA ───────────────────────────────────────────── */}
        <div className="relative z-10 mx-auto max-w-3xl px-5 sm:px-8 lg:px-12 py-28 sm:py-36 lg:py-48">
          <MotionDiv
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.9, ease: SMOOTH }}
            className="text-center"
          >
            <h2 className="font-heading text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white leading-snug">
              Ready to complete your
            </h2>
            <h2 className="font-heading text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white leading-snug mt-2">
              next application?
            </h2>
            <p className="mt-6 text-xl sm:text-2xl font-medium text-accent">
              Voira's got you.
            </p>
          </MotionDiv>
          <MotionDiv
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.7, ease: SMOOTH, delay: 0.15 }}
            className="text-center mt-10"
          >
            <Link to={createPageUrl('Auth') + '?signup=true'} className="no-underline">
              <GradientButton className="h-12 px-10">Get Started</GradientButton>
            </Link>
          </MotionDiv>
        </div>

        {/* ── Footer ──────────────────────────────────────────────── */}
        <footer className="relative z-10 py-10">
          <Container size="wide" className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <p className="text-sm text-white/70">© 2026 Voira. All rights reserved.</p>
            <nav className="flex gap-6 text-sm">
              <Link to={createPageUrl('Privacy')} className="text-white/70 transition-colors duration-300 hover:text-white">
                Privacy
              </Link>
              <Link to={createPageUrl('Terms')} className="text-white/70 transition-colors duration-300 hover:text-white">
                Terms
              </Link>
              <Link to={createPageUrl('Contact')} className="text-white/70 transition-colors duration-300 hover:text-white">
                Contact
              </Link>
            </nav>
          </Container>
        </footer>
      </section>
    </div>
  );
}
