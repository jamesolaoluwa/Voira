import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

const MOTION = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] },
};

/**
 * Reserved 16:9 area for future video/image. Clean border and subtle hover motion.
 */
export default function MediaFrame({ children, className, aspectRatio = '16/9' }) {
  return (
    <motion.div
      {...MOTION}
      className={cn(
        'relative w-full overflow-hidden rounded-lg border border-border bg-muted/30',
        'transition-transform duration-normal ease-smooth hover:scale-[1.01]',
        className
      )}
      style={{ aspectRatio }}
    >
      <div className="absolute inset-0 flex items-center justify-center">
        {children || null}
      </div>
    </motion.div>
  );
}
