'use client';

import { cn } from '@/lib/utils';
import React, { useEffect, useRef } from 'react';
import { createNoise3D } from 'simplex-noise';

const DEFAULT_COLORS = ['#5B5CF6', '#7c7df8', '#9d9efa'];

/**
 * Canvas-based wavy background for hero. Uses brand accent; no external assets.
 */
export function WavyBackground({
  children,
  className,
  containerClassName,
  colors = DEFAULT_COLORS,
  waveWidth = 48,
  backgroundFill = '#000000',
  blur = 10,
  speed = 'slow',
  waveOpacity = 0.4,
  ...props
}) {
  const canvasRef = useRef(null);
  const animationIdRef = useRef(null);
  const speedVal = speed === 'fast' ? 0.002 : 0.001;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const noise = createNoise3D();
    const ctx = canvas.getContext('2d');
    let w = (canvas.width = window.innerWidth);
    let h = (canvas.height = window.innerHeight);
    let nt = 0;
    ctx.filter = `blur(${blur}px)`;

    const drawWave = (n) => {
      nt += speedVal;
      for (let i = 0; i < n; i++) {
        ctx.beginPath();
        ctx.lineWidth = waveWidth;
        ctx.strokeStyle = colors[i % colors.length];
        for (let x = 0; x < w; x += 5) {
          const y = noise(x / 800, 0.3 * i, nt) * 80;
          ctx.lineTo(x, y + h * 0.5);
        }
        ctx.stroke();
        ctx.closePath();
      }
    };

    const render = () => {
      ctx.fillStyle = backgroundFill;
      ctx.globalAlpha = waveOpacity;
      ctx.fillRect(0, 0, w, h);
      drawWave(4);
      animationIdRef.current = requestAnimationFrame(render);
    };

    const onResize = () => {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
      ctx.filter = `blur(${blur}px)`;
    };
    window.addEventListener('resize', onResize);
    render();
    return () => {
      window.removeEventListener('resize', onResize);
      if (animationIdRef.current) cancelAnimationFrame(animationIdRef.current);
    };
  }, [blur, speedVal, waveOpacity, backgroundFill, waveWidth]);

  return (
    <div
      className={cn(
        'relative flex min-h-full w-full flex-col items-center justify-center',
        containerClassName
      )}
    >
      <canvas
        className="absolute inset-0 z-0 h-full w-full"
        ref={canvasRef}
        style={{ display: 'block' }}
      />
      <div className={cn('relative z-10 w-full', className)} {...props}>
        {children}
      </div>
    </div>
  );
}
