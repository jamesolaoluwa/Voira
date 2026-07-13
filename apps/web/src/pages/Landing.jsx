import React, { useRef, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { motion, useScroll, useTransform } from 'framer-motion';
import { Button } from '@/components/ui/button';
import VoiceVisualizer from '@/components/ui/VoiceVisualizer';
import Container from '@/components/layout/Container';
import { MotionDiv } from '@/components/ui/Motion';
import EtherealShadow from '@/components/ui/EtherealShadow';
import EtherealShadowFilter from '@/components/ui/EtherealShadowFilter';
import LandingHero from '@/components/landing/LandingHero';
import { FeatureTabs } from '@/components/ui/FeatureTabs';
import { TestimonialSection } from '@/components/ui/TestimonialSection';
import { ArcGalleryHero } from '@/components/ui/ArcGalleryHero';
import { ScrollExpandMedia } from '@/components/ui/ScrollExpandMedia';
import { useScramble } from 'use-scramble';
import {
  ArrowRight,
  GraduationCap,
  Award,
  Mic,
  Megaphone,
  FileText,
  Sparkles,
} from 'lucide-react';

/* ─── Animation presets (slower, smoother) ───────────────────────────── */
const SMOOTH = [0.22, 1, 0.36, 1];

/* ─── Dark palette — black base for hero and scenes ──────────────────── */
const PURPLE_DARK = '#000000';
const PURPLE_MID = '#110C24';

/* ─── Feature scenes — full-viewport background with text overlay ────── */
const FEATURE_SCENES = [
  {
    id: 'college',
    headline: 'Personal statements\nfrom what you say',
    description: 'Talk about your experience out loud. Voira removes filler words and turns it into a clear personal statement.',
    cta: 'Try Now',
    bgImage: 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=1920&q=80',
  },
  {
    id: 'scholarships',
    headline: 'Scholarship essays\nfrom your voice',
    description: 'Explain why you need support in your own words. Voira turns that into a clear draft you can edit.',
    cta: 'Try Now',
    bgImage: 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=1920&q=80',
  },
  {
    id: 'interviews',
    headline: 'Practice interview answers\nby speaking',
    description: 'Practice common questions by speaking. Voira writes a clean version you can review and adjust.',
    cta: 'Try Now',
    bgImage: 'https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?auto=format&fit=crop&w=1920&q=80',
  },
  {
    id: 'career',
    headline: 'Cover letters and pitches\nfrom your voice',
    description: 'Record a short cover letter or pitch. Voira turns it into a simple, direct message for recruiters.',
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
      title: 'Personal statements in your own voice.',
      description: 'Talk through your story. Voira writes a first draft for your application essay so you are not starting from a blank page.',
      icon: <GraduationCap className="h-16 w-16 text-accent/30" />,
      imageSrc: "/assets/voira-media/Anna'sAvatar.jpg",
      imageAlt: 'Anna',
    },
  },
  {
    value: 'scholarships',
    icon: <Award className="h-auto w-4 shrink-0" />,
    label: 'Scholarships',
    content: {
      badge: 'Financial Aid',
      title: 'Simpler scholarship essays.',
      description: 'Explain your goals out loud. Voira turns that into a clear, short essay you can adjust.',
      icon: <Award className="h-16 w-16 text-accent/30" />,
      imageSrc: "/assets/voira-media/AnnaScholarship.jpg",
      imageAlt: 'Anna',
    },
  },
  {
    value: 'interviews',
    icon: <Mic className="h-auto w-4 shrink-0" />,
    label: 'Interviews',
    content: {
      badge: 'Prep & Practice',
      title: 'Prepare clear interview answers.',
      description: 'Practice questions by speaking. Voira gives you a written answer you can refine before you use it.',
      icon: <Mic className="h-16 w-16 text-accent/30" />,
      imageSrc: "/assets/voira-media/JakeUsingVoira.jpg",
      imageAlt: 'Jake using Voira',
    },
  },
  {
    value: 'speeches',
    icon: <Megaphone className="h-auto w-4 shrink-0" />,
    label: 'Speeches',
    content: {
      badge: 'Speaking',
      title: 'Speech outlines that sound like you.',
      description: 'Talk through your idea out loud. Voira turns your voice into a clear outline and draft you can practice and refine—whether it’s a TED-style talk, a class presentation, or a prepared speech.',
      icon: <Megaphone className="h-16 w-16 text-accent/30" />,
      imageSrc: '/assets/voira-media/BenGivingTalk.png',
      imageAlt: 'Giving a speech',
    },
  },
];

/* ─── Testimonials data — 4 people ───────────────────────────────────── */
const TESTIMONIALS = [
  {
    id: 1,
    quote: 'Voira turned a messy voice note into a personal statement that worked. It still sounded like me.',
    name: 'Sarah M.',
    role: 'College Freshman',
    imageSrc: 'https://images.unsplash.com/photo-1581403341630-a6e0b9d2d257?auto=format&fit=crop&w=900&q=80',
  },
  {
    id: 2,
    quote: 'I used to stall when writing scholarship essays. Now I talk through my ideas and Voira gives me a draft to edit.',
    name: 'Marcus J.',
    role: 'Scholarship Recipient',
    imageSrc: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=900&q=80',
  },
  {
    id: 3,
    quote: 'Interview prep felt stressful before. Practicing out loud with Voira gave me clear answers I could take into the room.',
    name: 'Priya K.',
    role: 'Software Intern',
    imageSrc: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=900&q=80',
  },
  {
    id: 4,
    quote: 'Speaking for three minutes gave me a cleaner cover letter than anything I had typed on my own.',
    name: 'David L.',
    role: 'Job Seeker',
    imageSrc: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=900&q=80',
  },
];

const APPLICATION_IMAGES = [
  'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1523580846011-d3a5bc25702b?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1523050854058-8df90110c9f1?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1513258496099-48168024aec0?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1526498460520-4c246339dccb?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1488590528505-98d2b5aba04b?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1545239351-1141bd82e8a6?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1542744173-8e7e53415bb0?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1553877522-43269d4ea984?auto=format&fit=crop&w=800&q=80',
];

const STUDENT_SECTION = {
  mediaType: 'video',
  mediaSrc: "/assets/voira-media/AnnaVideoVoira.mp4",
  posterSrc: "/assets/voira-media/Anna'sAvatar.jpg",
  bgColor: '#BDB7A9',
  title: 'Voira for students',
  date: 'Essays, prompts, and applications',
  scrollToExpand: 'Scroll to see how Voira helps with school work.',
};

const PROFESSIONAL_SECTION = {
  mediaType: 'image',
  mediaSrc:
    'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1600&q=80',
  background:
    'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1920&q=80',
  title: 'Voira for early professionals',
  date: 'Interviews, emails, and pitches',
  scrollToExpand: 'Scroll to see how Voira helps at work.',
};

/* ─── Built for [scramble] heading — runs once in this order: essays, prompts, interviews, then everything applications ──────── */
const BUILT_FOR_PHRASES = [
  'essays',
  'prompts',
  'interviews',
  'everything applications.',
];

function BuiltForScrambleHeading() {
  const [index, setIndex] = useState(0);
  const indexRef = useRef(0);
  const timeoutRef = useRef(null);
  indexRef.current = index;
  const text = BUILT_FOR_PHRASES[index];

  // Only run scramble when index >= 1 (prompts, interviews, everything applications.)
  const isLastPhrase = index === BUILT_FOR_PHRASES.length - 1;
  const { ref } = useScramble({
    text: index > 0 ? text : '',
    speed: isLastPhrase ? 0.45 : 0.25,
    tick: isLastPhrase ? 1 : 3,
    step: isLastPhrase ? 2 : 1,
    scramble: isLastPhrase ? 4 : 5,
    seed: 2,
    chance: 0.85,
    playOnMount: true,
    ignore: [' '],
    onAnimationEnd: () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      const current = indexRef.current;
      if (current >= BUILT_FOR_PHRASES.length - 1) return;
      timeoutRef.current = setTimeout(() => setIndex(current + 1), 1200);
    },
  });

  // Show "essays" as static text for 2s, then advance to scramble "prompts"
  useEffect(() => {
    if (index !== 0) return;
    const t = setTimeout(() => setIndex(1), 7000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const phrase = BUILT_FOR_PHRASES[index];
  const needsPeriod = index === 0 || !phrase.endsWith('.');

  return (
    <span>
      Built for{' '}
      {index === 0 ? (
        <span>essays</span>
      ) : (
        <span ref={ref} />
      )}
      {needsPeriod ? '.' : ''}
    </span>
  );
}

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
  useEffect(() => {
    // Force landing page to dark mode only (restore previous setting on unmount)
    const previousTheme = localStorage.getItem('voira-theme');
    const root = document.documentElement;

    localStorage.setItem('voira-theme', 'dark');
    root.classList.remove('light', 'dark');
    root.classList.add('dark');

    return () => {
      if (previousTheme) {
        localStorage.setItem('voira-theme', previousTheme);
        root.classList.remove('light', 'dark');
        root.classList.add(previousTheme);
      } else {
        localStorage.removeItem('voira-theme');
      }
    };
  }, []);

  return (
    <div className="min-h-screen overflow-x-hidden" style={{ background: PURPLE_DARK, color: '#F5F5F7' }}>

      {/* ═══ 1. HERO — cinematic looping video ════════════════════════ */}
      <LandingHero />

      {/* ═══ 2. TALK FIRST — voice visualizer intro ═══════════════════ */}
      <section className="relative w-full overflow-hidden" style={{ background: PURPLE_DARK }}>
        <div className="relative z-10 py-24 sm:py-32 lg:py-40">
          <MotionDiv
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.9, ease: SMOOTH }}
            className="flex flex-col items-center text-center mx-auto max-w-4xl px-5 sm:px-8"
          >
            {/* Voice Visualizer */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="flex justify-center mb-12"
            >
              <VoiceVisualizer size={280} isActive={true} amplitude={0.3} />
            </motion.div>
            <h2 className="font-heading text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight mb-5 text-white">
              Talk first. Edit later.
            </h2>
            <p className="text-lg max-w-xl text-white/50 leading-relaxed">
              You speak normally. Voira turns it into a clear draft for essays, forms, and emails.
              It keeps your style and cuts out filler words.
            </p>
          </MotionDiv>
        </div>
      </section>

      {/* ═══ 3. FEATURE SECTIONS — scroll expansion for use cases ═══════ */}
      <ScrollExpandMedia
        mediaType={STUDENT_SECTION.mediaType}
        mediaSrc={STUDENT_SECTION.mediaSrc}
        posterSrc={STUDENT_SECTION.posterSrc}
        bgColor={STUDENT_SECTION.bgColor}
        title={STUDENT_SECTION.title}
        date={STUDENT_SECTION.date}
        scrollToExpand={STUDENT_SECTION.scrollToExpand}
        textBlend
        className="pb-12"
      >
        <div className="max-w-3xl mx-auto text-left space-y-6">
          <h3 className="text-2xl sm:text-3xl font-bold text-white">
            How Voira helps students
          </h3>
          <p className="text-lg sm:text-xl text-white/90 leading-relaxed">
            Speak through your answers for personal statements, short responses, and forms. Voira turns your spoken words into clear drafts you can edit.
          </p>
          <ul className="list-disc list-inside space-y-3 text-base sm:text-lg text-white/80">
            <li>Record ideas for application essays instead of typing from scratch.</li>
            <li>Use Voira to draft scholarship responses in your own words.</li>
            <li>Turn rough notes into cleaner study summaries and reflections.</li>
          </ul>
        </div>
      </ScrollExpandMedia>

      <ScrollExpandMedia
        mediaType={PROFESSIONAL_SECTION.mediaType}
        mediaSrc={PROFESSIONAL_SECTION.mediaSrc}
        bgImageSrc={PROFESSIONAL_SECTION.background}
        title={PROFESSIONAL_SECTION.title}
        date={PROFESSIONAL_SECTION.date}
        scrollToExpand={PROFESSIONAL_SECTION.scrollToExpand}
        textBlend
        className="pt-12 pb-28"
      >
        <div className="max-w-3xl mx-auto text-left space-y-6">
          <h3 className="text-2xl sm:text-3xl font-bold text-white">
            How Voira helps early professionals
          </h3>
          <p className="text-lg sm:text-xl text-white/90 leading-relaxed">
            Use your voice to draft messages for work and job search. Voira turns what you say into clear, professional text.
          </p>
          <ul className="list-disc list-inside space-y-3 text-base sm:text-lg text-white/80">
            <li>Practice interview answers and get them back as clear bullet points.</li>
            <li>Draft outreach emails and LinkedIn messages by speaking first.</li>
            <li>Shape short pitches and intros without staring at a blank page.</li>
          </ul>
        </div>
      </ScrollExpandMedia>

      {/* ═══ 4–6. TESTIMONIALS → FEATURE TABS → CTA → FOOTER ═══ */}
      <section className="relative w-full overflow-hidden" style={{ background: PURPLE_DARK }}>
        {/* Shared ethereal effects — darker, black-focused background */}
        <EtherealShadowFilter
          color="rgba(0, 0, 0, 0.6)"
          animation={{ scale: 60, speed: 50 }}
          sizing="fill"
          enabled
        />
        <EtherealShadow
          variant="absolute"
          opacity="hero"
          className="inset-0 z-0"
          color="rgba(0, 0, 0, 0.7)"
        />

        {/* ── Testimonials ────────────────────────────────────────── */}
        <div className="relative z-10">
          <TestimonialSection
            title="Join the Founding 1000"
            subtitle="Stories from students and early professionals using Voira."
            testimonials={TESTIMONIALS}
          />
        </div>

        {/* ── Feature Tabs ────────────────────────────────────────── */}
        <div className="relative z-10">
          <FeatureTabs
            heading={<BuiltForScrambleHeading />}
            description="Use Voira for college applications, scholarships, interviews, and early career steps."
            tabs={FEATURE_TABS}
            className="pt-10 pb-12 sm:pt-14 sm:pb-20 lg:pt-16 lg:pb-24"
          />
        </div>

        {/* ── Final CTA with arc gallery ─────────────────────────── */}
        <div className="relative z-10 mx-auto max-w-5xl px-5 sm:px-8 lg:px-12 pt-16 pb-24 sm:pt-20 sm:pb-28 lg:pt-24 lg:pb-32">
          <ArcGalleryHero images={APPLICATION_IMAGES} className="mb-4 sm:mb-2 lg:mb-0" />
          <MotionDiv
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.9, ease: SMOOTH }}
            className="text-center -mt-10 sm:-mt-14 lg:-mt-16 transform sm:translate-x-4 lg:translate-x-6"
          >
            <h2 className="font-heading text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white leading-snug">
              Ready to work on your
            </h2>
            <h2 className="font-heading text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white leading-snug mt-2">
              next application?
            </h2>
            <p className="mt-6 text-xl sm:text-2xl font-medium text-accent">
              Use Voira to talk first, then edit the draft.
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
              <button
                type="button"
                className="inline-flex h-12 cursor-pointer items-center gap-2 rounded-xl bg-white px-10 text-base font-medium text-zinc-900 transition-all duration-300 hover:bg-white/90"
              >
                Get Started
                <ArrowRight className="h-4 w-4" />
              </button>
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
