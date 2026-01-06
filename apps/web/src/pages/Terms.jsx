import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function Terms() {
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
            Terms of Service
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
              <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 mb-3">Agreement to Terms</h2>
              <p className="text-zinc-700 dark:text-zinc-400">
                By accessing and using Voira, you agree to be bound by these Terms of Service and all applicable laws and regulations.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 mb-3">Use of Service</h2>
              <p className="text-zinc-700 dark:text-zinc-400 mb-3">
                Voira provides AI-powered voice refinement tools. You agree to use the service responsibly and in accordance with all applicable laws.
              </p>
              <ul className="list-disc list-inside text-zinc-700 dark:text-zinc-400 space-y-2">
                <li>You must be at least 13 years old to use Voira</li>
                <li>You are responsible for maintaining the security of your account</li>
                <li>You retain ownership of all content you create</li>
                <li>You must not use Voira for any illegal or harmful purposes</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 mb-3">Credits and Billing</h2>
              <p className="text-zinc-700 dark:text-zinc-400">
                Free accounts receive a monthly credit allocation. Premium accounts have expanded limits and features. All billing is handled securely and you may cancel at any time.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 mb-3">Limitation of Liability</h2>
              <p className="text-zinc-700 dark:text-zinc-400">
                Voira is provided "as is" without warranties of any kind. We are not liable for any damages arising from your use of the service.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 mb-3">Changes to Terms</h2>
              <p className="text-zinc-700 dark:text-zinc-400">
                We reserve the right to modify these terms at any time. Continued use of Voira constitutes acceptance of updated terms.
              </p>
            </section>
          </div>
        </motion.div>
      </div>
    </div>
  );
}