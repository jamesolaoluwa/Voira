'use client';

import React, { useRef, useId, useEffect } from 'react';
import { animate, useMotionValue } from 'framer-motion';
import { cn } from '@/lib/utils';

function mapRange(value, fromLow, fromHigh, toLow, toHigh) {
  if (fromLow === fromHigh) return toLow;
  const percentage = (value - fromLow) / (fromHigh - fromLow);
  return toLow + percentage * (toHigh - toLow);
}

/**
 * Ethereal shadow background using SVG displacement filter (liquid/blob effect).
 * Background only — no heading or content. Optional noise overlay.
 */
export default function EtherealShadowFilter({
  color = 'rgba(91, 92, 246, 0.45)',
  animation = { scale: 80, speed: 70 },
  noise,
  sizing = 'fill',
  enabled = true,
  style,
  className,
  ...props
}) {
  const id = `shadowoverlay-${useId().replace(/:/g, '')}`;
  const animationEnabled = animation && animation.scale > 0;
  const feColorMatrixRef = useRef(null);
  const hueRotateMotionValue = useMotionValue(180);
  const hueRotateAnimationRef = useRef(null);

  const displacementScale = animation ? mapRange(animation.scale, 1, 100, 20, 100) : 0;
  const animationDuration = animation ? mapRange(animation.speed, 1, 100, 1000, 50) : 1;

  useEffect(() => {
    if (!feColorMatrixRef.current || !animationEnabled) return;
    if (hueRotateAnimationRef.current) hueRotateAnimationRef.current.stop();
    hueRotateMotionValue.set(0);
    hueRotateAnimationRef.current = animate(hueRotateMotionValue, 360, {
      duration: animationDuration / 25,
      repeat: Infinity,
      repeatType: 'loop',
      ease: 'linear',
      onUpdate: (value) => {
        if (feColorMatrixRef.current) feColorMatrixRef.current.setAttribute('values', String(value));
      },
    });
    return () => {
      if (hueRotateAnimationRef.current) hueRotateAnimationRef.current.stop();
    };
  }, [animationEnabled, animationDuration, hueRotateMotionValue]);

  if (!enabled) return null;

  return (
    <div
      aria-hidden
      className={cn('pointer-events-none absolute inset-0 z-0 overflow-hidden', className)}
      style={{ position: 'absolute', width: '100%', height: '100%', ...style }}
      {...props}
    >
      <div
        style={{
          position: 'absolute',
          inset: -displacementScale,
          filter: animationEnabled ? `url(#${id}) blur(6px)` : 'none',
        }}
      >
        {animationEnabled && (
          <svg style={{ position: 'absolute' }} aria-hidden>
            <defs>
              <filter id={id}>
                <feTurbulence
                  result="undulation"
                  numOctaves="2"
                  baseFrequency={`${mapRange(animation.scale, 0, 100, 0.001, 0.0005)},${mapRange(animation.scale, 0, 100, 0.004, 0.002)}`}
                  seed="0"
                  type="turbulence"
                />
                <feColorMatrix
                  ref={feColorMatrixRef}
                  in="undulation"
                  type="hueRotate"
                  values="180"
                />
                <feColorMatrix
                  in="dist"
                  result="circulation"
                  type="matrix"
                  values="4 0 0 0 1  4 0 0 0 1  4 0 0 0 1  1 0 0 0 0"
                />
                <feDisplacementMap
                  in="SourceGraphic"
                  in2="circulation"
                  scale={displacementScale}
                  result="dist"
                />
                <feDisplacementMap
                  in="dist"
                  in2="undulation"
                  scale={displacementScale}
                  result="output"
                />
              </filter>
            </defs>
          </svg>
        )}
        <div
          style={{
            backgroundColor: color,
            maskImage: `url('https://framerusercontent.com/images/ceBGguIpUU8luwByxuQz79t7To.png')`,
            maskSize: sizing === 'stretch' ? '100% 100%' : 'cover',
            maskRepeat: 'no-repeat',
            maskPosition: 'center',
            width: '100%',
            height: '100%',
          }}
        />
      </div>
      {noise && noise.opacity > 0 && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: `url("https://framerusercontent.com/images/g0QcWrxr87K0ufOxIUFBakwYA8.png")`,
            backgroundSize: (noise.scale || 1) * 200,
            backgroundRepeat: 'repeat',
            opacity: (noise.opacity || 0) / 2,
          }}
        />
      )}
    </div>
  );
}
