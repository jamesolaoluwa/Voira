import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { GetStartedButton } from '@/components/ui/GetStartedButton';
import VoiceVisualizer from '@/components/ui/VoiceVisualizer';
import ThemeToggle from '@/components/theme/ThemeToggle';
import Container from '@/components/layout/Container';
import Section from '@/components/layout/Section';
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

/* ─── Full-viewport cinematic feature scene ──────────────────────────── */
function CinematicScene({ scene }) {
  return (
    <section className="relative w-full h-screen overflow-hidden" style={{ background: PURPLE_DARK }}>
      {/* Background image — slow reveal */}
      <motion.div
        className="absolute inset-0 z-0"
        initial={{ opacity: 0, scale: 1.08 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true, amount: 0.3 }}
        transition={{ duration: 1.4, ease: SMOOTH }}
      >
        <img
          src={scene.bgImage}
          alt=""
          className="h-full w-full object-cover"
          loading="lazy"
        />
        {/* Overlays — seamless, no visible edges */}
        <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/55 to-black/20" />
        <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-[#0A0515] to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#0A0515] to-transparent" />
        <div className="absolute inset-0 bg-[#5B5CF6]/[0.04] mix-blend-overlay" />
      </motion.div>

      {/* Content — centered vertically, left-aligned */}
      <div className="relative z-10 flex h-screen items-center">
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
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   MAIN LANDING PAGE
═══════════════════════════════════════════════════════════════════════ */
export default function Landing() {
  return (
    <div className="min-h-screen overflow-x-hidden" style={{ background: PURPLE_DARK, color: '#F5F5F7' }}>

      {/* ═══ 1. HERO ═══════════════════════════════════════════════════ */}
      <Section as="section" spacing="loose" containerSize="none" className="relative min-h-screen !py-0">
        <header className="absolute inset-x-0 top-0 z-30">
          <div className="w-full mx-auto flex h-16 items-center justify-between px-5 sm:px-8 lg:px-12">
            <Link to={createPageUrl('Landing')} className="flex items-center group">
              <img
                src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/694481d7a7391caf3ba6ba15/fbc3f3b33_VoiraLogoReduced.jpg"
                alt="Voira"
                className="h-9 w-9 object-contain transition-transform duration-normal ease-smooth group-hover:scale-105"
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

        <div className="relative min-h-screen w-full">
          <WavyBackground
            containerClassName="absolute inset-0 z-0 min-h-screen w-full"
            className="flex min-h-screen flex-col items-center justify-center py-24 px-4 sm:px-6 lg:px-8"
            colors={['#5B5CF6', '#7c7df8', '#9d9efa']}
            backgroundFill={PURPLE_DARK}
            blur={12}
            speed="slow"
            waveOpacity={0.38}
            waveWidth={48}
          >
            <EtherealShadowFilter
              color="rgba(91, 92, 246, 0.5)"
              animation={{ scale: 80, speed: 70 }}
              sizing="fill"
              enabled
            />
            <EtherealShadow variant="absolute" opacity="hero" className="inset-0 z-0" />
            <Container size="wide" className="relative z-10 flex flex-col items-center justify-center text-center">
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
                    <GetStartedButton className="h-12 bg-accent px-8 text-white shadow-sm hover:bg-accent/90 transition-colors duration-normal ease-smooth" />
                  </Link>
                </motion.div>
              </motion.div>
            </Container>
          </WavyBackground>
        </div>
      </Section>

      {/* ═══ 2. ORB SECTION ═══════════════════════════════════════════ */}
      <section className="relative w-full overflow-hidden" style={{ background: PURPLE_DARK }}>
        <div className="relative z-10 py-24 sm:py-32 lg:py-40">
          <MotionDiv
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.9, ease: SMOOTH }}
            className="flex flex-col items-center text-center mx-auto max-w-4xl px-5 sm:px-8"
          >
            <motion.div
              className="mb-12 flex justify-center"
              initial={{ opacity: 0, scale: 0.92 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 1, ease: SMOOTH }}
            >
              <VoiceVisualizer size={220} isActive amplitude={0.2} />
            </motion.div>
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

      {/* ═══ 4. TESTIMONIALS ══════════════════════════════════════════ */}
      <section className="relative w-full overflow-hidden" style={{ background: PURPLE_MID }}>
        <TestimonialSection
          title="Hear from students like you"
          subtitle="Real stories from real people who used Voira to find their voice."
          testimonials={TESTIMONIALS}
        />
      </section>

      {/* ═══ 5. FEATURE TABS ═════════════════════════════════════════ */}
      <section className="relative w-full overflow-hidden" style={{ background: PURPLE_DARK }}>
        <FeatureTabs
          badge="Voira"
          heading="Built for moments that shape your future."
          description="Whether you're applying to college, going for a scholarship, or prepping for interviews."
          tabs={FEATURE_TABS}
        />
      </section>

      {/* ═══ 6. FINAL CTA ════════════════════════════════════════════ */}
      <section className="relative w-full overflow-hidden" style={{ background: PURPLE_DARK }}>
        <div className="absolute inset-0 pointer-events-none">
          <EtherealShadow variant="absolute" opacity="subtle" className="inset-0 z-0" />
        </div>
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
              <GetStartedButton className="h-12 bg-accent px-10 text-white shadow-sm hover:bg-accent/90 transition-colors duration-normal ease-smooth" />
            </Link>
          </MotionDiv>
        </div>
      </section>

      {/* ═══ FOOTER ═══════════════════════════════════════════════════ */}
      <footer className="relative z-10 py-10" style={{ background: PURPLE_DARK }}>
        <Container size="wide" className="flex flex-col items-center justify-between gap-4 sm:flex-row">
          <p className="text-sm text-white/30">© 2025 Voira. All rights reserved.</p>
          <nav className="flex gap-6 text-sm">
            <Link to={createPageUrl('Privacy')} className="text-white/30 transition-colors duration-300 hover:text-white/60">
              Privacy
            </Link>
            <Link to={createPageUrl('Terms')} className="text-white/30 transition-colors duration-300 hover:text-white/60">
              Terms
            </Link>
            <Link to={createPageUrl('Contact')} className="text-white/30 transition-colors duration-300 hover:text-white/60">
              Contact
            </Link>
          </nav>
        </Container>
      </footer>
    </div>
  );
}
