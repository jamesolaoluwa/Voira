import React from 'react';
import { cn } from '@/lib/utils';

/**
 * Liquid/ethereal animated background for hero or section separators.
 * Background only (no content). No noise overlay. Subtle blur, performant.
 * Use enabled={true} in dark mode hero; low opacity as transition between sections.
 */
export default function EtherealShadow({
  enabled = true,
  opacity = 'default',
  variant = 'fixed',
  className,
  ...props
}) {
  if (!enabled) return null;

  const opacityClasses = {
    default: 'opacity-100',
    hero: 'opacity-100',
    separator: 'opacity-30',
    subtle: 'opacity-15',
  };
  const opacityKey = opacityClasses[opacity] ?? opacityClasses.default;
  const positionClass = variant === 'absolute' ? 'absolute inset-0' : 'fixed inset-0';

  return (
    <div
      aria-hidden
      className={cn(
        'pointer-events-none overflow-hidden z-0',
        positionClass,
        opacityKey,
        className
      )}
      {...props}
    >
      {/* Soft gradient orbs — visible on dark; GPU-friendly transforms */}
      <div
        className="absolute -top-1/4 -left-1/4 w-[80vw] max-w-[800px] h-[80vw] max-h-[800px] rounded-full"
        style={{
          background: 'radial-gradient(circle, hsl(var(--accent) / 0.28) 0%, hsl(var(--accent) / 0.08) 40%, transparent 70%)',
          filter: 'blur(32px)',
          transform: 'translate(0, 0)',
          animation: 'ethereal-float-1 25s ease-in-out infinite',
        }}
      />
      <div
        className="absolute top-1/2 -right-1/4 w-[60vw] max-w-[600px] h-[60vw] max-h-[600px] rounded-full"
        style={{
          background: 'radial-gradient(circle, hsl(var(--accent) / 0.2) 0%, hsl(var(--accent) / 0.06) 40%, transparent 70%)',
          filter: 'blur(40px)',
          animation: 'ethereal-float-2 30s ease-in-out infinite',
        }}
      />
      <div
        className="absolute -bottom-1/4 left-1/3 w-[50vw] max-w-[500px] h-[50vw] max-h-[500px] rounded-full"
        style={{
          background: 'radial-gradient(circle, hsl(var(--accent) / 0.15) 0%, transparent 65%)',
          filter: 'blur(44px)',
          animation: 'ethereal-float-3 28s ease-in-out infinite',
        }}
      />
      <style>{`
        @keyframes ethereal-float-1 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(3%, -2%) scale(1.05); }
          66% { transform: translate(-2%, 2%) scale(0.98); }
        }
        @keyframes ethereal-float-2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(-4%, 3%) scale(1.08); }
        }
        @keyframes ethereal-float-3 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(2%, -3%) scale(1.03); }
        }
      `}</style>
    </div>
  );
}
