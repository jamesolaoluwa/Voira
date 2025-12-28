import React from 'react';

export default function LiveTranscription({ text, isActive }) {
  if (!isActive) return null;
  if (!text) {
    return (
      <div className="mt-8 w-full max-w-2xl bg-white dark:bg-[hsl(var(--card))] rounded-2xl border border-zinc-200 dark:border-white/5 shadow-sm dark:shadow-none p-6">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-400">Live Transcription</span>
        </div>
        <p className="text-zinc-600 dark:text-zinc-500 italic">Listening...</p>
      </div>
    );
  }

  return (
    <div className="mt-8 w-full max-w-2xl bg-white dark:bg-[hsl(var(--card))] rounded-2xl border border-zinc-200 dark:border-white/5 shadow-sm dark:shadow-none p-6">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-400">Live Transcription</span>
      </div>
      <p className="text-zinc-800 dark:text-zinc-300 leading-relaxed" aria-live="polite">
        {text}
        <span className="inline-block w-0.5 h-5 bg-violet-600 dark:bg-violet-400 ml-1 align-middle animate-pulse" />
      </p>
    </div>
  );
}
