import { useEffect, useRef, useState } from 'react';

type Options = {
  cadence?: number; // ms between chunks
};

// Chunk structure prepared for future STT integration
type TranscriptChunk = {
  text: string;
  startTime?: number;
  endTime?: number;
  confidence?: number;
};

// Frontend-only simulated live transcription hook.
// - Streams harmless demo text while `isActive` is true.
// - Cleans up intervals on unmount or when inactive.
// TODOs below mark where real streaming will be integrated.
export default function useLiveTranscription(isActive: boolean, options?: Options) {
  const cadence = options?.cadence ?? 1100;
  const [liveTranscript, setLiveTranscript] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [chunks, setChunks] = useState<TranscriptChunk[]>([]);
  const intervalRef = useRef<number | null>(null);

  // small corpus to simulate chunked transcript pieces
  const corpusRef = useRef<string[]>([
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
        const next = corpusRef.current[Math.floor(Math.random() * corpusRef.current.length)];

        // Append chunk object (only text populated for now)
        const chunk: TranscriptChunk = { text: next };
        setChunks((prev) => [...prev, chunk]);

        setLiveTranscript((prev) => {
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
    setChunks([]);
  };

  // TODO: Replace simulated interval with FastAPI WebSocket streaming
  // TODO: Map Deepgram partial transcripts to chunk objects here
  // TODO: Populate confidence and timestamps from STT provider

  return { liveTranscript, isStreaming, chunks, reset } as const;
}
