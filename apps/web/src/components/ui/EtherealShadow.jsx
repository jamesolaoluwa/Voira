import React, { useEffect, useRef, useState } from 'react';
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
  color: colorOverride,
  className,
  ...props
}) {
  const rootRef = useRef(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    if (!enabled) return undefined;
    const el = rootRef.current;
    if (!el) return undefined;
    const io = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { rootMargin: '40% 0px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [enabled]);

  if (!enabled) return null;

  const opacityClasses = {
    default: 'opacity-100',
    hero: 'opacity-100',
    separator: 'opacity-30',
    subtle: 'opacity-15',
  };
  const opacityKey = opacityClasses[opacity] ?? opacityClasses.default;
  const positionClass = variant === 'absolute' ? 'absolute inset-0' : 'fixed inset-0';

  const withAlpha = (a) => colorOverride.replace(/,?\s*[\d.]+\)$/, `, ${a})`);
  const orb1 = colorOverride
    ? `radial-gradient(circle, ${withAlpha(0.28)} 0%, ${withAlpha(0.08)} 40%, transparent 70%)`
    : 'radial-gradient(circle, hsl(var(--accent) / 0.28) 0%, hsl(var(--accent) / 0.08) 40%, transparent 70%)';
  const orb2 = colorOverride
    ? `radial-gradient(circle, ${withAlpha(0.2)} 0%, ${withAlpha(0.06)} 40%, transparent 70%)`
    : 'radial-gradient(circle, hsl(var(--accent) / 0.2) 0%, hsl(var(--accent) / 0.06) 40%, transparent 70%)';
  const orb3 = colorOverride
    ? `radial-gradient(circle, ${withAlpha(0.15)} 0%, transparent 65%)`
    : 'radial-gradient(circle, hsl(var(--accent) / 0.15) 0%, transparent 65%)';

  const playState = inView ? 'running' : 'paused';

  return (
    <div
      ref={rootRef}
      aria-hidden
      className={cn(
        'pointer-events-none overflow-hidden z-0',
        positionClass,
        opacityKey,
        className
      )}
      {...props}
    >
      {/* Soft gradient orbs — visible on dark; GPU-friendly transforms.
          Animation lives in CSS classes so prefers-reduced-motion can
          override it (inline `animation` can't be beaten by a media query). */}
      <div
        className="ethereal-orb-1 absolute -top-1/4 -left-1/4 w-[80vw] max-w-[800px] h-[80vw] max-h-[800px] rounded-full"
        style={{ background: orb1, filter: 'blur(32px)', animationPlayState: playState }}
      />
      <div
        className="ethereal-orb-2 absolute top-1/2 -right-1/4 w-[60vw] max-w-[600px] h-[60vw] max-h-[600px] rounded-full"
        style={{ background: orb2, filter: 'blur(40px)', animationPlayState: playState }}
      />
      <div
        className="ethereal-orb-3 absolute -bottom-1/4 left-1/3 w-[50vw] max-w-[500px] h-[50vw] max-h-[500px] rounded-full"
        style={{ background: orb3, filter: 'blur(44px)', animationPlayState: playState }}
      />
      <style>{`
        .ethereal-orb-1 { animation: ethereal-float-1 40s ease-in-out infinite; }
        .ethereal-orb-2 { animation: ethereal-float-2 48s ease-in-out infinite; }
        .ethereal-orb-3 { animation: ethereal-float-3 44s ease-in-out infinite; }
        @keyframes ethereal-float-1 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(2%, -1.5%) scale(1.03); }
          66% { transform: translate(-1.5%, 1.5%) scale(0.99); }
        }
        @keyframes ethereal-float-2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(-2.5%, 2%) scale(1.04); }
        }
        @keyframes ethereal-float-3 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(1.5%, -2%) scale(1.02); }
        }
        @media (prefers-reduced-motion: reduce) {
          .ethereal-orb-1, .ethereal-orb-2, .ethereal-orb-3 { animation: none !important; }
        }
      `}</style>
    </div>
  );
}
