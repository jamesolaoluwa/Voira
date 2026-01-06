import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import VoiceVisualizer from '@/components/ui/VoiceVisualizer';
import ThemeToggle from '@/components/theme/ThemeToggle';
import { ArrowRight, Shield, Fingerprint, Lock, Sparkles, Play } from 'lucide-react';

export default function Landing() {
  return (
    <div className="min-h-screen overflow-hidden">
      {/* Ambient background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-violet-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl" />
      </div>
      
      {/* Header */}
      <header className="relative z-10">
        <div className="max-w-7xl mx-auto px-6 py-6 flex items-center justify-between">
          <Link to={createPageUrl('Landing')} className="flex items-center gap-3 group">
            <img 
              src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/694481d7a7391caf3ba6ba15/fbc3f3b33_VoiraLogoReduced.jpg"
              alt="Voira"
              className="w-10 h-10 object-contain group-hover:scale-105 transition-transform"
            />
            <span className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight group-hover:text-zinc-700 dark:group-hover:text-white transition-colors">Voira</span>
          </Link>
          
          <div className="flex items-center gap-4">
            <ThemeToggle showLabel={false} />
            <Link to={createPageUrl('Auth')}>
              <Button variant="ghost" className="text-zinc-700 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200 dark:hover:bg-white/5">
                Sign In
              </Button>
            </Link>
            <Link to={createPageUrl('Auth')}>
              <Button className="bg-gradient-to-r from-violet-600 to-violet-500 hover:from-violet-500 hover:to-violet-400 text-white border-0">
                Get Started
              </Button>
            </Link>
          </div>
        </div>
      </header>
      
      {/* Hero Section */}
      <section className="relative z-10 max-w-7xl mx-auto px-6 pt-20 lg:pt-32 pb-24">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight mb-6">
              <span className="text-zinc-900 dark:text-zinc-100">Speak your truth.</span>
              <br />
              <span className="bg-gradient-to-r from-violet-400 to-teal-400 bg-clip-text text-transparent">
                Voira shapes it.
              </span>
            </h1>
            
            <p className="text-lg text-zinc-700 dark:text-zinc-400 mb-8 max-w-xl leading-relaxed">
              Answer applications and interview questions naturally by speaking. 
              Voira removes fillers, refines your voice, and learns how you express yourself over time.
            </p>
            
            <div className="flex flex-wrap gap-4">
              <Link to={createPageUrl('Home')}>
                <Button 
                  size="lg" 
                  className="bg-gradient-to-r from-violet-600 to-violet-500 hover:from-violet-500 hover:to-violet-400 text-white border-0 px-8 h-14 text-base"
                >
                  Get Started
                  <ArrowRight className="ml-2 w-5 h-5" />
                </Button>
              </Link>
              <Button 
                size="lg" 
                variant="outline" 
                onClick={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })}
                className="border-zinc-300 dark:border-white/10 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-white/5 hover:text-zinc-900 dark:hover:text-white px-8 h-14 text-base"
              >
                <Play className="mr-2 w-4 h-4" />
                See How It Works
              </Button>
            </div>
          </motion.div>
          
          {/* Voice Visualizer */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="flex justify-center lg:justify-end"
          >
            <div className="relative">
              <VoiceVisualizer size={280} isActive={true} amplitude={0.3} />
              
              {/* Floating labels */}
              <motion.div
                className="absolute -top-4 -left-8 px-4 py-2 bg-white dark:bg-[#1a1a24] rounded-xl border border-zinc-200 dark:border-white/5 text-sm text-zinc-700 dark:text-zinc-400 shadow-sm dark:shadow-none"
                animate={{ y: [0, -8, 0] }}
                transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
              >
                No fillers
              </motion.div>
              <motion.div
                className="absolute top-1/2 -right-12 px-4 py-2 bg-white dark:bg-[#1a1a24] rounded-xl border border-zinc-200 dark:border-white/5 text-sm text-zinc-700 dark:text-zinc-400 shadow-sm dark:shadow-none"
                animate={{ y: [0, 8, 0] }}
                transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
              >
                Your voice
              </motion.div>
              <motion.div
                className="absolute -bottom-4 left-8 px-4 py-2 bg-white dark:bg-[#1a1a24] rounded-xl border border-zinc-200 dark:border-white/5 text-sm text-zinc-700 dark:text-zinc-400 shadow-sm dark:shadow-none"
                animate={{ y: [0, -6, 0] }}
                transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
              >
                Refined output
              </motion.div>
            </div>
          </motion.div>
        </div>
      </section>
      
      {/* Voira in Real Life Section */}
      <section className="relative z-10 py-24 bg-white dark:bg-transparent border-t border-zinc-200 dark:border-white/5">
        <div className="max-w-7xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl lg:text-4xl font-bold text-zinc-900 dark:text-zinc-100 mb-4">
              Voira in Real Life
            </h2>
            <p className="text-zinc-600 dark:text-zinc-500 text-lg max-w-2xl mx-auto">
              Real people, real transformations
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { name: 'Sarah Chen', title: 'College Applicant', story: 'From nervous rambling to a compelling personal narrative' },
              { name: 'Marcus Williams', title: 'Job Seeker', story: 'Turned interview anxiety into confident, authentic responses' },
              { name: 'Priya Sharma', title: 'Scholarship Winner', story: 'Refined passion into a clear, impactful essay' },
              { name: 'David Kim', title: 'Career Switcher', story: 'Articulated experience into a powerful new direction' },
            ].map((card, index) => (
              <motion.div
                key={card.title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                whileHover={{ y: -8, scale: 1.02 }}
                className="group relative bg-white border border-zinc-200 shadow-md rounded-2xl dark:bg-[hsl(var(--card))] dark:border-white/5 dark:shadow-none p-6 cursor-pointer overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-violet-500/5 to-teal-500/5 dark:from-violet-500/10 dark:to-teal-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <div className="relative">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-violet-600 to-teal-600 dark:from-violet-500 dark:to-teal-500 flex items-center justify-center text-white font-semibold">
                      {card.name.split(' ').map(n => n[0]).join('')}
                    </div>
                    <div>
                      <h4 className="font-medium text-zinc-900 dark:text-zinc-200">{card.name}</h4>
                      <p className="text-xs text-zinc-600 dark:text-zinc-500">{card.title}</p>
                    </div>
                  </div>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">{card.story}</p>
                </div>
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-violet-500 to-teal-500 transform scale-x-0 group-hover:scale-x-100 transition-transform duration-500 origin-left" />
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="relative z-10 py-24 bg-white dark:bg-transparent">
        <div className="max-w-7xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl lg:text-4xl font-bold text-zinc-900 dark:text-zinc-100 mb-4">
              How It Works
            </h2>
            <p className="text-zinc-600 dark:text-zinc-500 text-lg max-w-2xl mx-auto">
              From your raw thoughts to a polished response in three simple steps
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              { step: '1', title: 'Speak Naturally', desc: 'Record your response to any question or prompt, speaking as you normally would.' },
              { step: '2', title: 'AI Refinement', desc: 'Voira removes fillers, improves clarity, and maintains your authentic voice.' },
              { step: '3', title: 'Review & Use', desc: 'Edit highlights, adjust tone, and export your polished response.' },
            ].map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
                className="text-center"
              >
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-violet-600 to-teal-600 dark:from-violet-500 dark:to-teal-500 flex items-center justify-center mx-auto mb-4 text-2xl font-bold text-white">
                  {item.step}
                </div>
                <h3 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 mb-3">{item.title}</h3>
                <p className="text-zinc-600 dark:text-zinc-500">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Trust Signals */}
      <section className="relative z-10 border-t border-zinc-200 dark:border-white/5 bg-white dark:bg-[#0D0D12]/50">
        <div className="max-w-7xl mx-auto px-6 py-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="grid md:grid-cols-3 gap-8"
          >
            <div className="flex items-center gap-4 p-6 rounded-2xl bg-white border border-zinc-200 shadow-sm dark:bg-[hsl(var(--card))] dark:border-white/5 dark:shadow-none">
              <div className="w-12 h-12 rounded-xl bg-violet-100 dark:bg-violet-500/20 flex items-center justify-center">
                <Shield className="w-6 h-6 text-violet-600 dark:text-violet-400" />
              </div>
              <div>
                <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">Privacy-First</h3>
                <p className="text-sm text-zinc-600 dark:text-zinc-500">Your voice, your control</p>
              </div>
            </div>
            
            <div className="flex items-center gap-4 p-6 rounded-2xl bg-white border border-zinc-200 shadow-sm dark:bg-[hsl(var(--card))] dark:border-white/5 dark:shadow-none">
              <div className="w-12 h-12 rounded-xl bg-teal-100 dark:bg-teal-500/20 flex items-center justify-center">
                <Fingerprint className="w-6 h-6 text-teal-600 dark:text-teal-400" />
              </div>
              <div>
                <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">No Plagiarism</h3>
                <p className="text-sm text-zinc-600 dark:text-zinc-500">100% authentic content</p>
              </div>
            </div>
            
            <div className="flex items-center gap-4 p-6 rounded-2xl bg-white border border-zinc-200 shadow-sm dark:bg-[hsl(var(--card))] dark:border-white/5 dark:shadow-none">
              <div className="w-12 h-12 rounded-xl bg-amber-100 dark:bg-amber-500/20 flex items-center justify-center">
                <Lock className="w-6 h-6 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">User-Owned</h3>
                <p className="text-sm text-zinc-600 dark:text-zinc-500">Your content belongs to you</p>
              </div>
            </div>
          </motion.div>
        </div>
      </section>
      
      {/* Footer */}
      <footer className="relative z-10 border-t border-zinc-200 dark:border-white/5 py-8">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm text-zinc-700 dark:text-zinc-600">© 2024 Voira. All rights reserved.</p>
          <div className="flex items-center gap-6 text-sm text-zinc-600 dark:text-zinc-500">
            <Link to={createPageUrl('Privacy')} className="hover:text-zinc-900 dark:hover:text-zinc-300 transition-colors">Privacy</Link>
            <Link to={createPageUrl('Terms')} className="hover:text-zinc-900 dark:hover:text-zinc-300 transition-colors">Terms</Link>
            <Link to={createPageUrl('Contact')} className="hover:text-zinc-900 dark:hover:text-zinc-300 transition-colors">Contact</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}