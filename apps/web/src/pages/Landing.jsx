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
import { MotionDiv, sectionReveal } from '@/components/ui/Motion';
import MediaFrame from '@/components/ui/MediaFrame';
import EtherealShadow from '@/components/ui/EtherealShadow';
import EtherealShadowFilter from '@/components/ui/EtherealShadowFilter';
import { WavyBackground } from '@/components/ui/WavyBackground';
import GradientText from '@/components/ui/GradientText';
import { TextLoop } from '@/components/ui/TextLoop';
import {
  ArrowRight,
  GraduationCap,
  Award,
  Briefcase,
  TrendingUp,
} from 'lucide-react';

const HERO_STAGGER = { staggerChildren: 0.08, delayChildren: 0.12 };
const itemUp = { initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] } };

const USE_CASES = [
  { title: 'College Applications', description: 'Craft personal statements and supplemental essays that sound like you.', icon: GraduationCap },
  { title: 'Scholarships', description: 'Stand out in scholarship essays with clear, confident storytelling.', icon: Award },
  { title: 'Internship Interviews', description: 'Answer behavioral and situational questions with poise.', icon: Briefcase },
  { title: 'Career Prep', description: 'Prepare for job interviews with refined, authentic responses.', icon: TrendingUp },
];

const SCENARIOS = [
  {
    title: 'High school student applying to college',
    body: 'Turn brainstormed ideas into a cohesive personal statement. Speak naturally about your experiences—Voira removes fillers and sharpens your voice so admissions hear you.',
    align: 'left',
  },
  {
    title: 'College student applying for scholarships',
    body: 'From rough drafts to submission-ready essays. Capture your motivation in your own words, then refine without losing authenticity.',
    align: 'right',
  },
  {
    title: 'Interview preparation',
    body: 'Practice answers out loud, get a polished version in seconds. Walk into interviews with confidence and clarity.',
    align: 'left',
  },
];

export default function Landing() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-background text-foreground">
      {/* ─── 1. Hero (full viewport, header overlaid) ─────────────────── */}
      <Section as="section" spacing="loose" containerSize="none" className="relative min-h-screen !py-0">
        {/* Header: absolute so it floats on top of the animation */}
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
            backgroundFill="#000000"
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

      {/* Subtle separator between hero and use cases */}
      <div className="relative h-0 w-full">
        <EtherealShadow variant="fixed" opacity="separator" className="pointer-events-none" />
      </div>

      {/* ─── 2. Use case grid ───────────────────────────────────────────── */}
      <Section id="use-cases" spacing="default" background="transparent" containerSize="wide">
        <MotionDiv
          initial={sectionReveal.initial}
          whileInView={sectionReveal.whileInView}
          viewport={sectionReveal.viewport}
          transition={sectionReveal.transition}
          className="text-center mb-14"
        >
          <h2 className="text-headline mb-4 text-foreground">
            Built for moments that shape your future.
          </h2>
          <p className="text-body-lg mx-auto max-w-2xl text-muted-foreground">
            Whether you’re applying to college, going for a scholarship, or prepping for interviews.
          </p>
        </MotionDiv>
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {USE_CASES.map((item, i) => (
            <MotionDiv
              key={item.title}
              initial={sectionReveal.initial}
              whileInView={sectionReveal.whileInView}
              viewport={{ ...sectionReveal.viewport, margin: '-30px' }}
              transition={{ ...sectionReveal.transition, delay: i * 0.06 }}
              className="group"
            >
              <div className="flex h-full flex-col rounded-xl border border-border bg-card p-6 transition-transform duration-normal ease-smooth hover:scale-[1.02]">
                <MediaFrame className="mb-5 aspect-video w-full">
                  <item.icon className="h-10 w-10 text-muted-foreground/50" />
                </MediaFrame>
                <h3 className="font-heading text-title mb-2 text-foreground">{item.title}</h3>
                <p className="text-body text-muted-foreground">{item.description}</p>
              </div>
            </MotionDiv>
          ))}
        </div>
      </Section>

      {/* ─── 3. Orb section ────────────────────────────────────────────── */}
      <Section id="orb" spacing="default" background="muted" containerSize="narrow">
        <MotionDiv
          initial={sectionReveal.initial}
          whileInView={sectionReveal.whileInView}
          viewport={sectionReveal.viewport}
          transition={sectionReveal.transition}
          className="flex flex-col items-center text-center"
        >
          <motion.div
            className="mb-10 flex justify-center"
            initial={{ opacity: 0, scale: 0.96 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          >
            <VoiceVisualizer size={220} isActive amplitude={0.2} />
          </motion.div>
          <h2 className="text-headline mb-4 text-foreground">
            Speak. Refine. Shine.
          </h2>
          <p className="text-body-lg max-w-xl text-muted-foreground">
            Voira turns your raw spoken words into clear, confident copy—without changing your voice. 
            Less filler, more impact.
          </p>
        </MotionDiv>
      </Section>

      {/* ─── 4. Scenario sections (alternating) ──────────────────────────── */}
      {SCENARIOS.map((scenario, i) => (
        <Section
          key={scenario.title}
          spacing="default"
          background={i % 2 === 0 ? 'transparent' : 'muted'}
          containerSize="wide"
        >
          <MotionDiv
            initial={sectionReveal.initial}
            whileInView={sectionReveal.whileInView}
            viewport={sectionReveal.viewport}
            transition={sectionReveal.transition}
            className={`grid gap-12 lg:grid-cols-2 lg:gap-16 items-center ${scenario.align === 'right' ? 'lg:grid-flow-dense' : ''}`}
          >
            <motion.div
              className={scenario.align === 'right' ? 'lg:col-start-2' : ''}
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-50px' }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: 0.05 }}
            >
              <h3 className="font-heading text-headline mb-4 text-foreground">
                {scenario.title}
              </h3>
              <p className="text-body-lg text-muted-foreground">{scenario.body}</p>
            </motion.div>
            <motion.div
              className={scenario.align === 'right' ? 'lg:col-start-1 lg:row-start-1' : ''}
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-50px' }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
            >
              <MediaFrame />
            </motion.div>
          </MotionDiv>
        </Section>
      ))}

      {/* ─── 5. Final CTA ───────────────────────────────────────────────── */}
      <Section spacing="loose" background="transparent" containerSize="narrow">
        <MotionDiv
          initial={sectionReveal.initial}
          whileInView={sectionReveal.whileInView}
          viewport={sectionReveal.viewport}
          transition={sectionReveal.transition}
          className="text-center"
        >
          <h2 className="text-headline mb-6 text-foreground">
            Looking forward to completing your next application?
            <br />
            Voira’s got you.
          </h2>
          <Link to={createPageUrl('Auth')} className="no-underline">
            <Button
              size="lg"
              className="h-12 bg-accent px-10 text-accent-foreground shadow-sm hover:bg-accent/90 transition-colors duration-normal ease-smooth"
            >
              Get Started
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </MotionDiv>
      </Section>

      {/* ─── Footer ────────────────────────────────────────────────────── */}
      <footer className="relative z-10 border-t border-border py-8">
        <Container size="wide" className="flex flex-col items-center justify-between gap-4 sm:flex-row">
          <p className="text-body text-muted-foreground">© 2024 Voira. All rights reserved.</p>
          <nav className="flex gap-6 text-sm">
            <Link to={createPageUrl('Privacy')} className="text-muted-foreground transition-colors duration-normal ease-smooth hover:text-foreground">
              Privacy
            </Link>
            <Link to={createPageUrl('Terms')} className="text-muted-foreground transition-colors duration-normal ease-smooth hover:text-foreground">
              Terms
            </Link>
            <Link to={createPageUrl('Contact')} className="text-muted-foreground transition-colors duration-normal ease-smooth hover:text-foreground">
              Contact
            </Link>
          </nav>
        </Container>
      </footer>
    </div>
  );
}
