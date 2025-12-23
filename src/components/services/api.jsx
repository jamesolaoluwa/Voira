/**
 * API Abstraction Layer
 * Centralizes all backend calls for easy FastAPI migration later
 * Currently uses Base44 entities/integrations
 */

import { base44 } from '@/api/base44Client';
import { supabase } from '@/components/lib/supabase';

// ============================================
// AUTH
// ============================================

export const auth = {
  async signUp(email, password, fullName) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          role: 'free_user',
        }
      }
    });
    if (error) throw error;
    return data;
  },

  async signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
    return data;
  },

  async signInWithGoogle() {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
  // redirect back to the sign-in route so the app can process the OAuth fragment
  redirectTo: `${window.location.origin}/auth`,
      }
    });
    if (error) throw error;
    return data;
  },

  async signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },

  async getMe() {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) throw error;
    if (!user) return null;

    const profiles = await base44.entities.UserProfile.filter({ user_id: user.id });
    const profile = profiles[0];

    return {
      id: user.id,
      email: user.email,
      full_name: user.user_metadata?.full_name || profile?.full_name || 'User',
      role: user.user_metadata?.role || profile?.role || 'free_user',
      credits_remaining: profile?.credits_remaining ?? 60,
      credits_reset_at: profile?.credits_reset_at || null,
    };
  },

  async getSession() {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    return data.session;
  },

  onAuthStateChange(callback) {
    return supabase.auth.onAuthStateChange(callback);
  }
};

// Utility to process OAuth redirect responses (useful after signInWithOAuth redirects)
export async function processOAuthRedirect() {
  try {
    const { data, error } = await supabase.auth.getSessionFromUrl({ storeSession: true });
    if (error) throw error;
    return data.session;
  } catch (e) {
    return null;
  }
}

// ============================================
// SESSIONS
// ============================================

export const sessions = {
  async createSessionDraft(payload) {
    const {
      title, type, question, goal, reference_text,
      audio_url, audio_mime, audio_size_bytes, duration_seconds,
      transcript, refined_draft, metrics, highlights = [],
    } = payload;

    const session = await base44.entities.Recording.create({
      title, type, question,
      goal: goal || null,
      reference_text: reference_text || null,
      audio_url: audio_url || null,
      audio_mime: audio_mime || null,
      audio_size_bytes: audio_size_bytes || 0,
      duration_seconds: duration_seconds || 0,
      transcript: transcript || '',
      refined_draft: refined_draft || '',
      clarity_score: metrics?.clarity_score || 0,
      confidence_score: metrics?.confidence_score || 0,
      filler_count: metrics?.filler_count || 0,
      words_per_minute: metrics?.words_per_minute || 0,
      highlights: JSON.stringify(highlights),
    });

    return session;
  },

  async getSessionById(id) {
    const recordings = await base44.entities.Recording.filter({ id });
    if (!recordings || recordings.length === 0) {
      throw new Error('Session not found');
    }
    const recording = recordings[0];
    
    if (recording.highlights && typeof recording.highlights === 'string') {
      try {
        recording.highlights = JSON.parse(recording.highlights);
      } catch (e) {
        recording.highlights = [];
      }
    }

    return {
      id: recording.id,
      user_id: recording.created_by,
      title: recording.title,
      type: recording.type,
      question: recording.question,
      goal: recording.goal || null,
      reference_text: recording.reference_text || null,
      audio_url: recording.audio_url || null,
      audio_mime: recording.audio_mime || null,
      audio_size_bytes: recording.audio_size_bytes || 0,
      duration_seconds: recording.duration_seconds || 0,
      transcript: recording.transcript || '',
      refined_draft: recording.refined_draft || '',
      metrics: {
        filler_count: recording.filler_count || 0,
        words_per_minute: recording.words_per_minute || 0,
        confidence_score: recording.confidence_score || 0,
        clarity_score: recording.clarity_score || 0,
      },
      highlights: recording.highlights || [],
      created_at: recording.created_date,
      updated_at: recording.updated_date,
    };
  },

  async listSessions(filters = {}) {
    const recordings = await base44.entities.Recording.list('-created_date');
    
    return recordings.map(recording => ({
      id: recording.id,
      user_id: recording.created_by,
      title: recording.title,
      type: recording.type,
      duration_seconds: recording.duration_seconds || 0,
      clarity_score: recording.clarity_score || 0,
      tags: recording.tags || [],
      created_at: recording.created_date,
    }));
  },

  async deleteSession(id) {
    await base44.entities.Recording.delete(id);
  },

  async updateSession(id, patch) {
    const updateData = {
      title: patch.title,
      refined_draft: patch.refined_draft,
      highlights: patch.highlights ? JSON.stringify(patch.highlights) : undefined,
      clarity_score: patch.metrics?.clarity_score,
      confidence_score: patch.metrics?.confidence_score,
      filler_count: patch.metrics?.filler_count,
      words_per_minute: patch.metrics?.words_per_minute,
    };

    Object.keys(updateData).forEach(key => {
      if (updateData[key] === undefined) delete updateData[key];
    });

    await base44.entities.Recording.update(id, updateData);
  },
};

// ============================================
// AUDIO / TRANSCRIPTION
// ============================================

export const audio = {
  validateAudio(file) {
    const allowedTypes = ['audio/webm', 'audio/wav', 'audio/mp3', 'audio/mpeg'];
    const maxSize = 15 * 1024 * 1024;

    if (!allowedTypes.includes(file.type)) {
      throw new Error(`Invalid audio format. Allowed: webm, wav, mp3`);
    }

    if (file.size > maxSize) {
      throw new Error('Audio file too large. Maximum size: 15MB');
    }

    return true;
  },

  async startTranscriptionStream(audioBlob, onChunkUpdate) {
    const simulateChunks = async () => {
      const chunks = [
        'Hello, I would like to',
        'Hello, I would like to talk about my',
        'Hello, I would like to talk about my experience in',
        'Hello, I would like to talk about my experience in leading community projects...',
      ];

      for (let i = 0; i < chunks.length; i++) {
        await new Promise(resolve => setTimeout(resolve, 1500));
        onChunkUpdate(chunks[i]);
      }
    };

    simulateChunks();
    return this.transcribeFinal(audioBlob);
  },

  async transcribeFinal(audioBlob) {
    const audioFile = new File([audioBlob], 'recording.webm', { type: audioBlob.type });
    
    const { file_url } = await base44.integrations.Core.UploadFile({ file: audioFile });
    
    const mockTranscript = "I believe my experience in leading community initiatives has shaped who I am today. When I started volunteering at the local food bank three years ago, I didn't realize how much it would transform my perspective on service and leadership.";
    
    return {
      transcript: mockTranscript,
      audio_url: file_url,
      audio_mime: audioBlob.type,
      audio_size_bytes: audioBlob.size,
    };
  },
};

// ============================================
// ANALYSIS
// ============================================

export const analysis = {
  async analyzeSession(payload) {
    const { transcript, type, question, goal, reference_text, voiceProfile } = payload;

    let prompt = `You are Voira, an AI writing assistant that refines spoken responses.

Context:
- Type: ${type}
- Question: ${question || 'N/A'}
- User's Goal: ${goal || 'Natural and authentic'}
${reference_text ? `- Reference Material: ${reference_text}` : ''}

User's raw spoken response:
"${transcript}"

${voiceProfile ? `Voice Profile:
- Tone: ${voiceProfile.tone}
- Confidence Level: ${voiceProfile.confidence_level}%
- Emotional Depth: ${voiceProfile.emotional_depth}%
- Sentence Length: ${voiceProfile.sentence_length}
- Preferred words: ${voiceProfile.preferred_words?.join(', ') || 'none'}
- Avoided words: ${voiceProfile.avoided_words?.join(', ') || 'none'}
` : ''}

Task: Refine this response by:
1. Removing filler words and hesitations
2. Improving clarity and structure
3. Maintaining the user's authentic voice
4. Making it sound natural and confident

Return JSON:
{
  "refined_draft": "the refined version",
  "confidence_score": number 0-100,
  "clarity_score": number 0-100,
  "filler_count": number of fillers removed,
  "suggestions": "brief improvement notes"
}`;

    const result = await base44.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: {
        type: 'object',
        properties: {
          refined_draft: { type: 'string' },
          confidence_score: { type: 'number' },
          clarity_score: { type: 'number' },
          filler_count: { type: 'number' },
          suggestions: { type: 'string' },
        },
      },
    });

    const words = transcript.split(/\s+/).length;
    const minutes = payload.duration_seconds / 60;
    const words_per_minute = Math.round(words / minutes);

    return {
      refined_draft: result.refined_draft,
      metrics: {
        confidence_score: result.confidence_score || 75,
        clarity_score: result.clarity_score || 80,
        filler_count: result.filler_count || 0,
        words_per_minute: words_per_minute || 150,
      },
    };
  },

  async rewriteDraft(payload) {
    const { draft, instruction, tone } = payload;

    let prompt = `Rewrite the following text with this instruction: "${instruction}"`;
    
    if (tone) {
      prompt += `\n\nTone: ${tone}`;
    }

    prompt += `\n\nOriginal text:\n"${draft}"`;
    prompt += `\n\nReturn only the rewritten text, no explanation.`;

    const result = await base44.integrations.Core.InvokeLLM({ prompt });

    return typeof result === 'string' ? result : result.output || draft;
  },
};

// ============================================
// BILLING / PLAN
// ============================================

export const billing = {
  async getPlan() {
    const user = await auth.getMe();
    if (!user) return null;

    return {
      role: user.role,
      credits_remaining: user.credits_remaining,
      credits_reset_at: user.credits_reset_at,
    };
  },

  async setPlan(role) {
    const user = await auth.getMe();
    if (!user) throw new Error('Not authenticated');

    const { error } = await supabase.auth.updateUser({
      data: { role }
    });

    if (error) throw error;

    const profiles = await base44.entities.UserProfile.filter({ user_id: user.id });
    if (profiles.length > 0) {
      await base44.entities.UserProfile.update(profiles[0].id, { role });
    } else {
      await base44.entities.UserProfile.create({
        user_id: user.id,
        full_name: user.full_name,
        role,
        credits_remaining: role === 'premium_user' ? 999 : 60,
      });
    }
  },
};

// ============================================
// CREDITS
// ============================================

export const credits = {
  async decrementCredit(reason = 'recording_started') {
    const user = await auth.getMe();
    if (!user) throw new Error('Not authenticated');

    const profiles = await base44.entities.UserProfile.filter({ user_id: user.id });
    
    if (profiles.length === 0) {
      await base44.entities.UserProfile.create({
        user_id: user.id,
        full_name: user.full_name,
        role: user.role,
        credits_remaining: 59,
      });
      return 59;
    }

    const profile = profiles[0];
    const newCredits = Math.max(0, (profile.credits_remaining || 60) - 1);

    await base44.entities.UserProfile.update(profile.id, {
      credits_remaining: newCredits,
    });

    return newCredits;
  },

  async getCredits() {
    const user = await auth.getMe();
    if (!user) return 0;
    return user.credits_remaining;
  },

  async resetCredits(amount = 60) {
    const user = await auth.getMe();
    if (!user) throw new Error('Not authenticated');

    const profiles = await base44.entities.UserProfile.filter({ user_id: user.id });
    
    if (profiles.length > 0) {
      await base44.entities.UserProfile.update(profiles[0].id, {
        credits_remaining: amount,
      });
    }
  },
};