import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function Privacy() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-[#0a0a0f] p-6 lg:p-10">
      <div className="max-w-4xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <Link to={createPageUrl('Landing')}>
            <Button variant="ghost" className="mb-4 text-zinc-600 dark:text-zinc-400">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Home
            </Button>
          </Link>
          <h1 className="text-3xl lg:text-4xl font-bold text-zinc-900 dark:text-zinc-100 mb-3">
            Privacy Policy
          </h1>
          <p className="text-zinc-600 dark:text-zinc-500">Last updated: {new Date().toLocaleDateString()}</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="prose dark:prose-invert prose-zinc max-w-none"
        >
          <div className="bg-white dark:bg-[#1a1a24] rounded-2xl border border-zinc-200 dark:border-white/5 shadow-sm dark:shadow-none p-8 space-y-6">
            <section>
              <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 mb-3">Your Privacy Matters</h2>
              <p className="text-zinc-700 dark:text-zinc-400">
                At Voira, we are committed to protecting your privacy and ensuring the security of your personal information. This policy outlines how we collect, use, and safeguard your data.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 mb-3">Information We Collect</h2>
              <ul className="list-disc list-inside text-zinc-700 dark:text-zinc-400 space-y-2">
                <li>Account information (email, name)</li>
                <li>Audio recordings and transcripts you create</li>
                <li>Usage data and analytics</li>
                <li>Voice profile preferences</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 mb-3">How We Use Your Data</h2>
              <p className="text-zinc-700 dark:text-zinc-400">
                We use your information to provide and improve our services, personalize your experience, and help you refine your voice. Your recordings and transcripts belong to you and are never shared without your consent.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 mb-3">Data Security</h2>
              <p className="text-zinc-700 dark:text-zinc-400">
                We implement industry-standard security measures to protect your data. All recordings are encrypted in transit and at rest.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 mb-3">Your Rights</h2>
              <p className="text-zinc-700 dark:text-zinc-400">
                You have the right to access, modify, or delete your data at any time through your account settings.
              </p>
            </section>
          </div>
        </motion.div>
      </div>
    </div>
  );
}