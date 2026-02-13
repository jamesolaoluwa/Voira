import React from 'react';
import { cn } from '@/lib/utils';

/**
 * Max-width container with consistent horizontal padding.
 * Use for landing and app content; respects design tokens.
 */
export default function Container({ children, className, as: Component = 'div', size = 'default' }) {
  const sizeClasses = {
    default: 'max-w-6xl',
    wide: 'max-w-7xl',
    narrow: 'max-w-4xl',
    full: 'max-w-full',
  };
  return (
    <Component
      className={cn(
        'w-full mx-auto px-4 sm:px-6 lg:px-8',
        sizeClasses[size],
        className
      )}
    >
      {children}
    </Component>
  );
}
