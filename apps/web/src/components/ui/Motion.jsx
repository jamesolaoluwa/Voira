import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

const SMOOTH = [0.22, 1, 0.36, 1];
const DURATION_FAST = 0.3;
const DURATION_NORMAL = 0.45;
const DURATION_SLOW = 0.6;

const defaultTransition = {
  duration: DURATION_NORMAL,
  ease: SMOOTH,
};

/**
 * Wrapper for framer-motion with consistent easing and duration.
 * Use for landing section reveals: minimal translateY, no bounce.
 */
export function MotionDiv({
  children,
  className,
  transition = defaultTransition,
  initial,
  animate,
  whileInView,
  viewport,
  ...props
}) {
  return (
    <motion.div
      transition={typeof transition === 'object' ? transition : defaultTransition}
      initial={initial}
      animate={animate}
      whileInView={whileInView}
      viewport={viewport ?? (whileInView ? { once: true, margin: '-50px' } : undefined)}
      className={cn(className)}
      {...props}
    >
      {children}
    </motion.div>
  );
}

/**
 * Defaults for section reveal: fade + slight Y. No bounce.
 */
export const sectionReveal = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  whileInView: { opacity: 1, y: 0 },
  transition: { duration: DURATION_NORMAL, ease: SMOOTH },
  viewport: { once: true, margin: '-40px' },
};

export const durations = { fast: DURATION_FAST, normal: DURATION_NORMAL, slow: DURATION_SLOW };
export const easeSmooth = SMOOTH;
