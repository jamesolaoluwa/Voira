import React from 'react';
import { cn } from '@/lib/utils';

/**
 * Very subtle gradient text using brand accent. Use sparingly (e.g. one headline).
 */
export default function GradientText({ children, className, as: Component = 'span' }) {
  return (
    <Component
      className={cn(
        'bg-gradient-to-r from-accent to-accent/80 bg-clip-text text-transparent',
        className
      )}
    >
      {children}
    </Component>
  );
}
