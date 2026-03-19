import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect, Children } from 'react';

const defaultVariants = {
  initial: { y: 20, opacity: 0 },
  animate: { y: 0, opacity: 1 },
  exit: { y: -20, opacity: 0 },
};

/**
 * Cycles through children with a smooth vertical slide animation.
 * Use for rotating taglines or feature highlights.
 *
 * @param {boolean} loop — if false (default), stops on the last item after one full cycle.
 */
export function TextLoop({
  children,
  className,
  interval = 3,
  transition = { duration: 0.4, ease: [0.22, 1, 0.36, 1] },
  variants,
  onIndexChange,
  loop = false,
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [stopped, setStopped] = useState(false);
  const items = Children.toArray(children);

  useEffect(() => {
    if (stopped) return;

    const timer = setInterval(() => {
      setCurrentIndex((current) => {
        const next = current + 1;
        // If we've reached the last item and loop is off, stop cycling
        if (!loop && next >= items.length - 1) {
          setStopped(true);
          onIndexChange?.(items.length - 1);
          return items.length - 1;
        }
        const idx = loop ? next % items.length : next;
        onIndexChange?.(idx);
        return idx;
      });
    }, interval * 1000);
    return () => clearInterval(timer);
  }, [items.length, interval, onIndexChange, loop, stopped]);

  return (
    <div className={cn('relative inline-block whitespace-nowrap', className)}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={currentIndex}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={transition}
          variants={variants || defaultVariants}
        >
          {items[currentIndex]}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
