import React from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';

export default function FeatureCard({ icon: Icon, title, description, href, delay = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay }}
    >
      <Link to={createPageUrl(href)}>
        <motion.div
          className="group relative p-6 rounded-2xl bg-white dark:bg-gradient-to-br dark:from-[#1a1a24] dark:to-[#13131a] border border-zinc-200 dark:border-white/5 shadow-sm dark:shadow-none cursor-pointer overflow-hidden"
          whileHover={{ scale: 1.02, y: -4 }}
          whileTap={{ scale: 0.98 }}
          transition={{ duration: 0.2 }}
        >
          {/* Hover glow effect */}
          <div className="absolute inset-0 bg-gradient-to-br from-violet-500/10 to-teal-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          
          {/* Icon container */}
          <motion.div 
            className="relative mb-4 w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500/20 to-teal-500/20 flex items-center justify-center"
            whileHover={{ scale: 1.1, rotate: 5 }}
            transition={{ type: 'spring', stiffness: 300 }}
          >
            <Icon className="w-6 h-6 text-violet-600 dark:text-violet-400 group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors duration-300" />
          </motion.div>
          
          {/* Content */}
          <h3 className="relative text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-2 group-hover:text-zinc-800 dark:group-hover:text-white transition-colors">
            {title}
          </h3>
          <p className="relative text-sm text-zinc-600 dark:text-zinc-500 group-hover:text-zinc-700 dark:group-hover:text-zinc-400 transition-colors">
            {description}
          </p>
          
          {/* Bottom accent line */}
          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-violet-500 to-teal-500 transform scale-x-0 group-hover:scale-x-100 transition-transform duration-500 origin-left" />
        </motion.div>
      </Link>
    </motion.div>
  );
}