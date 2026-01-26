import React, { useRef, useEffect } from 'react';

export default function LiveTranscription({ 
  transcript, 
  onEdit, 
  isEditable = false,
  isUserEdited = false 
}) {
  const textareaRef = useRef(null);
  
  // Auto-scroll to bottom when transcript updates (only if not user-edited)
  useEffect(() => {
    if (textareaRef.current && !isUserEdited) {
      textareaRef.current.scrollTop = textareaRef.current.scrollHeight;
    }
  }, [transcript, isUserEdited]);
  
  const handleChange = (e) => {
    if (onEdit) {
      onEdit(e.target.value);
    }
  };
  
  const displayText = transcript && transcript.length > 0 ? transcript : "";
  const placeholder = "Listening...";
  
  return (
    <div className="mt-8 w-full max-w-2xl bg-white dark:bg-[hsl(var(--card))] rounded-2xl border border-zinc-200 dark:border-white/5 shadow-sm dark:shadow-none p-6">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-400">Live Transcription</span>
        </div>
        {isUserEdited && (
          <span className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 px-2 py-0.5 rounded">
            Edited
          </span>
        )}
      </div>
      {isEditable ? (
        <textarea
          ref={textareaRef}
          value={displayText}
          onChange={handleChange}
          placeholder={placeholder}
          className="w-full min-h-[120px] max-h-[300px] resize-y bg-transparent border-0 p-0 text-zinc-800 dark:text-zinc-300 placeholder:text-zinc-500 dark:placeholder:text-zinc-600 placeholder:italic focus:outline-none focus:ring-0 leading-relaxed"
          aria-live="polite"
        />
      ) : (
        <p className={`leading-relaxed ${transcript && transcript.length > 0 ? 'text-zinc-800 dark:text-zinc-300' : 'text-zinc-600 dark:text-zinc-500 italic'}`} aria-live="polite">
          {displayText || placeholder}
          {transcript && transcript.length > 0 && (
            <span className="inline-block w-0.5 h-5 bg-violet-600 dark:bg-violet-400 ml-1 align-middle animate-pulse" />
          )}
        </p>
      )}
    </div>
  );
}
