import React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cn } from '@/lib/utils';

/**
 * Liquid glass button — frosted backdrop with inner glow.
 * Stays within the existing palette; accent-tinted glass.
 */
export function LiquidButton({
  children,
  className,
  asChild = false,
  size = 'default',
  ...props
}) {
  const Comp = asChild ? Slot : 'button';

  const sizeClasses = {
    sm: 'h-8 px-4 text-xs',
    default: 'h-9 px-5 py-2 text-sm',
    lg: 'h-11 px-8 text-sm',
  };

  return (
    <Comp
      className={cn(
        'relative inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium transition-all duration-300 outline-none',
        'text-white',
        'hover:scale-105 active:scale-[0.98]',
        'disabled:pointer-events-none disabled:opacity-50',
        '[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
        sizeClasses[size] ?? sizeClasses.default,
        className
      )}
      {...props}
    >
      {/* Glass layer */}
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-0 z-0 rounded-full',
          'shadow-[0_0_6px_rgba(0,0,0,0.04),0_2px_8px_rgba(0,0,0,0.08),inset_1px_1px_1px_-0.5px_rgba(255,255,255,0.12),inset_-1px_-1px_1px_-0.5px_rgba(255,255,255,0.12),inset_0_0_8px_4px_rgba(255,255,255,0.06),0_0_14px_rgba(255,255,255,0.08)]',
          'dark:shadow-[0_0_8px_rgba(0,0,0,0.06),0_2px_8px_rgba(0,0,0,0.12),inset_1px_1px_1px_-0.5px_rgba(255,255,255,0.15),inset_-1px_-1px_1px_-0.5px_rgba(255,255,255,0.15),inset_0_0_8px_4px_rgba(255,255,255,0.08),0_0_14px_rgba(255,255,255,0.06)]',
        )}
      />
      {/* Frosted backdrop */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-full backdrop-blur-md bg-white/[0.06] dark:bg-white/[0.04]"
      />
      {/* Content */}
      <span className="relative z-10">{children}</span>
      <GlassFilter />
    </Comp>
  );
}

function GlassFilter() {
  return (
    <svg className="hidden" aria-hidden>
      <defs>
        <filter
          id="container-glass"
          x="0%"
          y="0%"
          width="100%"
          height="100%"
          colorInterpolationFilters="sRGB"
        >
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.05 0.05"
            numOctaves="1"
            seed="1"
            result="turbulence"
          />
          <feGaussianBlur in="turbulence" stdDeviation="2" result="blurredNoise" />
          <feDisplacementMap
            in="SourceGraphic"
            in2="blurredNoise"
            scale="70"
            xChannelSelector="R"
            yChannelSelector="B"
            result="displaced"
          />
          <feGaussianBlur in="displaced" stdDeviation="4" result="finalBlur" />
          <feComposite in="finalBlur" in2="finalBlur" operator="over" />
        </filter>
      </defs>
    </svg>
  );
}
