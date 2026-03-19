import React from 'react';
import { cn } from '@/lib/utils';

/**
 * Vertical section with consistent spacing and optional background.
 * Use between landing sections for clean separation and transitions.
 */
export default function Section({
  children,
  className,
  as: Component = 'section',
  spacing = 'default',
  background = 'transparent',
  containerSize = 'default',
}) {
  const spacingClasses = {
    tight: 'py-12 lg:py-16',
    default: 'py-16 lg:py-24',
    loose: 'py-20 lg:py-32',
  };
  const backgroundClasses = {
    transparent: '',
    muted: 'bg-muted/50 dark:bg-surface',
    card: 'bg-card',
  };
  return (
    <Component
      className={cn(
        spacingClasses[spacing],
        backgroundClasses[background],
        className
      )}
    >
      {      (containerSize && containerSize !== 'none') ? (
        <div className={cn(
          'w-full mx-auto px-4 sm:px-6 lg:px-8',
          containerSize === 'wide' && 'max-w-7xl',
          containerSize === 'default' && 'max-w-6xl',
          containerSize === 'narrow' && 'max-w-4xl'
        )}>
          {children}
        </div>
      ) : (
        children
      )}
    </Component>
  );
}
