import { useState, useRef, useEffect } from 'react';
import { base44 } from '@/api/base44Client';

export default function useAudioRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [error, setError] = useState(null);
  const [amplitude, setAmplitude] = useState(0);
  
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const animationFrameRef = useRef(null);
  const streamRef = useRef(null);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      
      // Set up MediaRecorder
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      // Set up audio analysis for visualizer
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      source.connect(analyserRef.current);

      // Start amplitude monitoring
      monitorAmplitude();

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setAudioBlob(audioBlob);
        stopAmplitudeMonitoring();
      };

      mediaRecorder.start(1000); // Collect data every second
      setIsRecording(true);
      setIsPaused(false);
      setError(null);
    } catch (err) {
      console.error('Error starting recording:', err);
      setError(err.message);
    }
  };

  const pauseRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
      stopAmplitudeMonitoring();
    }
  };

  const resumeRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
      mediaRecorderRef.current.resume();
      setIsPaused(false);
      monitorAmplitude();
    }
  };

  const stopRecording = () => {
    // Stop the recorder and return a Promise that resolves with the final Blob
    return new Promise((resolve) => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        const mr = mediaRecorderRef.current;

        const onStop = () => {
          const finalBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          setAudioBlob(finalBlob);

          // Stop all tracks
          if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
          }

          // Close audio context
          if (audioContextRef.current) {
            audioContextRef.current.close();
          }

          setIsRecording(false);
          setIsPaused(false);
          mr.removeEventListener('stop', onStop);
          resolve(finalBlob);
        };

        mr.addEventListener('stop', onStop);
        try { mr.stop(); } catch (e) { onStop(); }
      } else {
        // Already stopped or never started
        const finalBlob = audioBlob;
        setIsRecording(false);
        setIsPaused(false);
        resolve(finalBlob);
      }
    });
  };

  const monitorAmplitude = () => {
    const updateAmplitude = () => {
      if (!analyserRef.current) return;
      
      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
      analyserRef.current.getByteFrequencyData(dataArray);
      
      const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
      const normalizedAmplitude = Math.min(average / 128, 1);
      
      setAmplitude(normalizedAmplitude);
      animationFrameRef.current = requestAnimationFrame(updateAmplitude);
    };
    
    updateAmplitude();
  };

  const stopAmplitudeMonitoring = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      setAmplitude(0);
    }
  };

  const uploadAndTranscribe = async (onTranscriptUpdate, providedBlob = null) => {
    const blobToUse = providedBlob || audioBlob;
    if (!blobToUse) {
      throw new Error('No audio recorded');
    }

    try {
      // Convert blob to file
      const audioFile = new File([blobToUse], 'recording.webm', { type: 'audio/webm' });
      
      // Update with initial message
      if (onTranscriptUpdate) {
        onTranscriptUpdate('Processing recording...');
      }
      
      // Upload audio file for storage
      let file_url = null;
      try {
        const uploadResp = await base44.integrations.Core.UploadFile({ file: audioFile });
        file_url = uploadResp?.file_url ?? null;
      } catch (uploadErr) {
        console.warn('Audio upload returned an error or null URL:', uploadErr);
        file_url = null;
      }

      // ⚠️ TRANSCRIPTION PLACEHOLDER: Real STT not enabled. Demo transcript returned.
      console.warn('🔧 TRANSCRIPTION PLACEHOLDER: Real STT not enabled. Demo transcript returned.');
      const demoTranscript = "I believe my experience in leading community initiatives has shaped who I am today. When I started volunteering at the local food bank three years ago, I didn't realize how much it would transform my perspective on service and leadership. Through this work, I've learned the importance of empathy, collaboration, and making a tangible difference in people's lives. These experiences have reinforced my commitment to pursuing a career where I can continue to serve and uplift others.";
      if (onTranscriptUpdate) {
        onTranscriptUpdate(demoTranscript);
      }

      // Store the audio URL for future use (may be null)
      console.log('Audio saved at:', file_url);

      return { transcript: demoTranscript, file_url };
    } catch (err) {
      console.error('Error processing audio:', err);
      if (onTranscriptUpdate) {
        onTranscriptUpdate('Error processing audio. Please try again.');
      }
      throw err;
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopRecording();
      stopAmplitudeMonitoring();
    };
  }, []);

  return {
    isRecording,
    isPaused,
    audioBlob,
    amplitude,
    error,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    uploadAndTranscribe,
  };
}