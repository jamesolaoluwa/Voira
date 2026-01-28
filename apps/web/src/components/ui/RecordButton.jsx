import React from 'react';
import { motion } from 'framer-motion';
import { Mic } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function RecordButton({ 
  isRecording = false, 
  onClick, 
  size = 'default',
  className = '' 
}) {
  return (
    <Button
      size={size}
      onClick={onClick}
      className={`relative ${className}`}
    >
      {isRecording && (
        <>
          {/* Pulsing ring */}
          <motion.div
            className="absolute inset-0 rounded-full border-2 border-rose-400"
            animate={{
              scale: [1, 1.3, 1],
              opacity: [0.8, 0, 0.8],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />
          {/* Glow effect */}
          <motion.div
            className="absolute inset-0 rounded-full bg-rose-500/20 blur-xl"
            animate={{
              scale: [1, 1.2, 1],
              opacity: [0.5, 0.8, 0.5],
            }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />
        </>
      )}
      
      {/* Icon with pulse */}
      <motion.div
        animate={isRecording ? {
          scale: [1, 1.1, 1],
        } : {}}
        transition={{
          duration: 0.8,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      >
        <Mic className={`w-4 h-4 ${isRecording ? 'text-rose-400' : ''}`} />
      </motion.div>
    </Button>
  );
}