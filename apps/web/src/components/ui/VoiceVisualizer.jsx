import React from 'react';
import { motion } from 'framer-motion';

export default function VoiceVisualizer({ isActive = false, amplitude = 0, size = 200 }) {
  const baseScale = 1;
  const activeScale = 1 + (amplitude * 0.3);

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      {/* Outer glow rings */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: size * 1.4,
          height: size * 1.4,
          background: 'radial-gradient(circle, rgba(139, 92, 246, 0.1) 0%, transparent 70%)',
        }}
        animate={{
          scale: isActive ? [1, 1.1, 1] : 1,
          opacity: isActive ? [0.5, 0.8, 0.5] : 0.3,
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />

      {/* Middle ring */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: size * 1.2,
          height: size * 1.2,
          background: 'radial-gradient(circle, rgba(20, 184, 166, 0.15) 0%, transparent 70%)',
        }}
        animate={{
          scale: isActive ? [1, 1.15, 1] : 1,
          opacity: isActive ? [0.4, 0.7, 0.4] : 0.2,
        }}
        transition={{
          duration: 1.5,
          repeat: Infinity,
          ease: 'easeInOut',
          delay: 0.2,
        }}
      />

      {/* Inner glow */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: size,
          height: size,
          background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.3) 0%, rgba(20, 184, 166, 0.3) 100%)',
          boxShadow: isActive
            ? '0 0 60px rgba(139, 92, 246, 0.4), 0 0 100px rgba(20, 184, 166, 0.2)'
            : '0 0 40px rgba(139, 92, 246, 0.2)',
        }}
        animate={{
          scale: isActive ? activeScale : baseScale,
        }}
        transition={{
          duration: 0.1,
          ease: 'easeOut',
        }}
      />

      {/* Core circle */}
      <motion.div
        className="absolute rounded-full flex items-center justify-center"
        style={{
          width: size * 0.7,
          height: size * 0.7,
          background: 'linear-gradient(135deg, #3f3f46 0%, #18181b 100%)',
        }}
        animate={{
          scale: isActive ? [1, 1.05, 1] : 1,
        }}
        transition={{
          duration: 0.8,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      >
        {/* Inner pulse */}
        <motion.div
          className="rounded-full"
          style={{
            width: size * 0.4,
            height: size * 0.4,
            background: 'rgba(255, 255, 255, 0.1)',
          }}
          animate={{
            scale: isActive ? [1, 1.2, 1] : 1,
            opacity: isActive ? [0.3, 0.6, 0.3] : 0.2,
          }}
          transition={{
            duration: 1,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      </motion.div>
    </div>
  );
}
