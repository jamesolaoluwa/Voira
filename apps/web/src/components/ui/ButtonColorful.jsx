import React from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ArrowUpRight } from 'lucide-react';

export function ButtonColorful({
  className,
  label = 'Get Started',
  ...props
}) {
  return (
    <Button
      className={cn(
        'relative h-10 px-4 overflow-hidden',
        'bg-zinc-900 dark:bg-zinc-100',
        'transition-all duration-200',
        'group',
        className
      )}
      {...props}
    >
      {/* Gradient background effect — brand magenta/purple */}
      <div
        className={cn(
          'absolute inset-0',
          'bg-gradient-to-r from-[rgb(193,53,135)] via-[#5B5CF6] to-[rgb(193,53,135)]',
          'opacity-40 group-hover:opacity-80',
          'blur transition-opacity duration-500'
        )}
      />

      {/* Content */}
      <div className="relative flex items-center justify-center gap-2">
        <span className="text-white dark:text-zinc-900">{label}</span>
        <ArrowUpRight className="w-3.5 h-3.5 text-white/90 dark:text-zinc-900/90" />
      </div>
    </Button>
  );
}
