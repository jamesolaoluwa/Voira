import { useEffect, useRef, useState } from 'react';

type Options = {
  cadence?: number; // ms between chunks
};

// Frontend-only simulated live transcription hook.
// - Streams harmless demo text while `isActive` is true.
// - Cleans up intervals on unmount or when inactive.
export default function useLiveTranscription(isActive: boolean, options?: Options) {
  const cadence = options?.cadence ?? 1100;
  const [liveTranscript, setLiveTranscript] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const intervalRef = useRef<number | null>(null);

  // small corpus to simulate chunked transcript pieces
  const chunksRef = useRef<string[]>([
    'I started by...',
    'During my time...',
    'I focused on...',
    'This experience taught me...',
    'As a result, we...',
    'I learned to...',
    'In summary, I...',
  ]);

  useEffect(() => {
    if (isActive) {
      setIsStreaming(true);
      // start producing chunks
      intervalRef.current = window.setInterval(() => {
        setLiveTranscript((prev) => {
          const next = chunksRef.current[Math.floor(Math.random() * chunksRef.current.length)];
          const joined = prev ? `${prev} ${next}` : next;
          // keep transcript reasonably bounded
          return joined.length > 1200 ? joined.slice(joined.length - 1200) : joined;
        });
      }, cadence);
    } else {
      // stop streaming
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setIsStreaming(false);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setIsStreaming(false);
    };
  }, [isActive, cadence]);

  const reset = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setLiveTranscript('');
    setIsStreaming(false);
  };

  return { liveTranscript, isStreaming, reset } as const;
}
