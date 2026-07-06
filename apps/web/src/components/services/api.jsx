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
    
    if (error) {
      // Map common Supabase auth errors to user-friendly messages
      const msg = error.message?.toLowerCase() || '';
      
      if (msg.includes('email not confirmed')) {
        throw new Error('Please confirm your email before signing in. Check your inbox for a confirmation link.');
      }
      if (msg.includes('invalid login credentials') || msg.includes('invalid password')) {
        throw new Error('Invalid email or password. Please check your credentials and try again.');
      }
      if (msg.includes('user not found')) {
        throw new Error('No account found with this email. Please sign up first.');
      }
      if (msg.includes('too many requests') || msg.includes('rate limit')) {
        throw new Error('Too many sign-in attempts. Please wait a moment and try again.');
      }
      if (msg.includes('network') || msg.includes('fetch')) {
        throw new Error('Network error. Please check your connection and try again.');
      }
      
      // Re-throw original error for unhandled cases
      throw error;
    }
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
    const { apiClient } = await import('@/lib/apiClient');
    return await apiClient.get('/auth/me', { requireAuth: true });
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

// Note: processOAuthRedirect is no longer needed in Supabase v2.
// OAuth redirects are handled automatically by the Supabase client.
// The session is restored via onAuthStateChange when the page loads.

// ============================================
// SESSIONS
// ============================================

export const sessions = {
  // Alias for getSessionById (Bug #13 fix - Draft.jsx was calling sessions.get())
  async get(id) {
    return this.getSessionById(id);
  },
  
  async createSessionDraft(payload) {
    const {
      title, type, question, goal, reference_text,
      audio_url, audio_mime, audio_size_bytes, duration_seconds,
      transcript, refined_draft, metrics, highlights = [],
      // Also accept flat properties for backward compatibility
      clarity_score: flatClarityScore,
      confidence_score: flatConfidenceScore,
      filler_count: flatFillerCount,
      words_per_minute: flatWordsPerMinute,
    } = payload;

    // Support both nested metrics and flat properties
    const clarityScore = metrics?.clarity_score ?? flatClarityScore ?? 0;
    const confidenceScore = metrics?.confidence_score ?? flatConfidenceScore ?? 0;
    const fillerCount = metrics?.filler_count ?? flatFillerCount ?? 0;
    const wordsPerMinute = metrics?.words_per_minute ?? flatWordsPerMinute ?? 0;

    // Try backend first (enforces credits server-side)
    try {
      const { apiClient } = await import('@/lib/apiClient');
      return await apiClient.post('/sessions', {
        title,
        type,
        question,
        goal,
        reference_text,
        audio_url,
        audio_mime,
        audio_size_bytes,
        duration_seconds,
        transcript,
        refined_draft,
        clarity_score: clarityScore,
        confidence_score: confidenceScore,
        filler_count: fillerCount,
        words_per_minute: wordsPerMinute,
        highlights: highlights || [],
      });
    } catch (error) {
      if (error.message?.includes('402') || error.message?.includes('Insufficient credits')) {
        throw error;
      }
      throw error;
    }
  },

  /**
   * Get a session by ID
   * 
   * LOADING STRATEGY:
   * 1. Try backend API
   * 2. If backend returns 404 → return null (no fallback)
   * 3. On other errors → throw (fail closed; no direct Supabase bypass)
   * 
   * This prevents duplicate 404 errors and unnecessary network calls.
   */
  async getSessionById(id) {
    // Validate ID before querying
    if (!id || typeof id !== 'string' || id.trim().length === 0) {
      console.error('[sessions.getSessionById] Invalid session ID:', id);
      return null;
    }
    
    try {
      const { apiClient } = await import('@/lib/apiClient');
      const session = await apiClient.get(`/sessions/${id}`);
      return session || null;
    } catch (apiError) {
        const errorMsg = apiError.message || String(apiError);
        
        // Check if this is an explicit 404 from the backend
        if (errorMsg.includes('404') || errorMsg.includes('not found') || errorMsg.includes('Not Found')) {
          if (import.meta.env.DEV) {
            console.warn('[sessions.getSessionById] Backend returned 404:', id);
          }
          return null;
        }
        throw apiError;
    }
  },

  async listSessions(filters = {}) {
    const { apiClient } = await import('@/lib/apiClient');
    const sessions = await apiClient.get('/sessions');
    return sessions.map(session => ({
        id: session.id,
        user_id: session.user_id,
        title: session.title,
        type: session.type,
        question: session.question || '',
        goal: session.goal || '',
        reference_text: session.reference_text || '',
        transcript: session.transcript || '',
        // CRITICAL: Persist the refined essay so reopening a session shows it.
        // Dropping this here caused Draft.jsx to render an empty refined essay
        // when a user opened a session from Library (sessionData came through
        // without refined_draft and the PRIORITY 3 refetch never triggered).
        refined_draft: session.refined_draft || '',
        duration_seconds: session.duration_seconds || 0,
        confidence_score: session.confidence_score || 0,
        clarity_score: session.clarity_score || 0,
        filler_count: session.filler_count || 0,
        words_per_minute: session.words_per_minute || 0,
        highlights: session.highlights || [],
        tags: session.tags || [],
        created_at: session.created_at,
        updated_at: session.updated_at,
      }));
  },

  async deleteSession(id) {
    const { apiClient } = await import('@/lib/apiClient');
    return await apiClient.delete(`/sessions/${id}`);
  },

  async deleteAllSessions() {
    const { apiClient } = await import('@/lib/apiClient');
    return await apiClient.delete('/sessions');
  },

  async updateSession(id, patch) {
    const updateData = {
      title: patch.title,
      transcript: patch.transcript,
      refined_draft: patch.refined_draft,
      highlights: patch.highlights
        ? (typeof patch.highlights === 'string' ? patch.highlights : JSON.stringify(patch.highlights))
        : undefined,
      clarity_score: patch.metrics?.clarity_score ?? patch.clarity_score,
      confidence_score: patch.metrics?.confidence_score ?? patch.confidence_score,
      filler_count: patch.metrics?.filler_count ?? patch.filler_count,
      words_per_minute: patch.metrics?.words_per_minute ?? patch.words_per_minute,
    };

    Object.keys(updateData).forEach(key => {
      if (updateData[key] === undefined) delete updateData[key];
    });

    if (Object.keys(updateData).length === 0) return null;

    const { apiClient } = await import('@/lib/apiClient');
    return await apiClient.put(`/sessions/${id}`, updateData);
  },

  async renameSession(id, title) {
    const trimmed = (title || '').trim();
    if (!trimmed) throw new Error('Title cannot be empty');
    return await sessions.updateSession(id, { title: trimmed });
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

  /**
   * Transcribe audio file using backend /transcribe endpoint
   * @param {File|Blob} audioFile - Audio file to transcribe
   * @param {string} language - Language code (default: 'en')
   * @returns {Promise<{transcript: string, confidence?: number, duration?: number, word_count?: number}>}
   */
  async transcribeAudio(audioFile, language = 'en') {
    try {
      const { apiClient } = await import('@/lib/apiClient');
      
      // Create FormData for multipart/form-data upload
      const formData = new FormData();
      formData.append('file', audioFile);
      formData.append('language', language);
      
      // Send to backend /transcribe endpoint
      const result = await apiClient.post('/transcribe', formData);
      
      return {
        transcript: result.transcript,
        confidence: result.confidence,
        duration: result.duration,
        word_count: result.word_count,
      };
    } catch (error) {
      // Handle specific HTTP status codes with user-friendly messages
      if (error.status === 402) {
        throw new Error('You are out of credits. Please upgrade.');
      } else if (error.status === 400) {
        throw new Error('Invalid or unsupported audio file.');
      } else if (error.status === 503) {
        throw new Error('Transcription service temporarily unavailable.');
      }
      // Re-throw other errors as-is
      throw error;
    }
  },

  /**
   * Start streaming transcription (deprecated - use WebSocket in AudioRecorder)
   * @deprecated Use live WebSocket transcription via AudioRecorder instead
   * This method is kept for backward compatibility but should not be used in production.
   */
  async startTranscriptionStream(audioBlob, onChunkUpdate) {
    // NOTE: This method is deprecated. Live transcription now uses WebSocket
    // via AudioRecorder.jsx directly connected to /ws/listen endpoint.
    // This stub exists only for backward compatibility.
    console.warn('[audio.startTranscriptionStream] Deprecated - use WebSocket transcription');
    return this.transcribeFinal(audioBlob);
  },

  /**
   * Finalize transcription by uploading audio file.
   * NOTE: Actual transcription is now done via live WebSocket streaming.
   * This method uploads the audio file and returns file metadata.
   */
  async transcribeFinal(audioBlob) {
    const audioFile = new File([audioBlob], 'recording.webm', { type: audioBlob.type });
    
    const { file_url } = await base44.integrations.Core.UploadFile({ file: audioFile });
    
    // NOTE: Transcript is captured from live WebSocket transcription, not generated here.
    // Return empty transcript - caller must provide transcript from live transcription.
    return {
      transcript: '', // Transcript comes from live WebSocket, not mock data
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
// BILLING / STRIPE
// ============================================

export const billing = {
  /**
   * Get current subscription status from backend.
   * Returns plan, status, credits info, etc.
   */
  async getSubscriptionStatus() {
    try {
      const { apiClient } = await import('@/lib/apiClient');
      return await apiClient.get('/billing/subscription-status');
    } catch (error) {
      console.error('[billing.getSubscriptionStatus] Error:', error);
      // Return free tier defaults on error
      return {
        plan: 'free',
        status: 'inactive',
        credits_remaining: 10,
        monthly_credit_allowance: 10,
        current_period_end: null,
        cancel_at_period_end: false,
      };
    }
  },

  /**
   * Create a Stripe Checkout session for subscription purchase.
   * Returns the checkout URL to redirect the user to.
   * 
   * @param {string} priceId - Stripe Price ID (monthly or yearly)
   * @returns {Promise<{checkout_url: string, session_id: string}>}
   */
  async createCheckoutSession(priceId) {
    try {
      const { apiClient } = await import('@/lib/apiClient');
      const successUrl = `${window.location.origin}/pricing?success=true`;
      const cancelUrl = `${window.location.origin}/pricing?canceled=true`;
      
      return await apiClient.post('/billing/create-checkout-session', {
        price_id: priceId,
        success_url: successUrl,
        cancel_url: cancelUrl,
      });
    } catch (error) {
      console.error('[billing.createCheckoutSession] Error:', error);
      throw new Error('Failed to start checkout. Please try again.');
    }
  },

  /**
   * Create a Stripe Customer Portal session.
   * Returns the portal URL where users can manage their subscription.
   * 
   * @returns {Promise<{portal_url: string}>}
   */
  async createPortalSession() {
    try {
      const { apiClient } = await import('@/lib/apiClient');
      const returnUrl = `${window.location.origin}/pricing`;
      
      return await apiClient.post('/billing/create-portal-session', {
        return_url: returnUrl,
      });
    } catch (error) {
      console.error('[billing.createPortalSession] Error:', error);
      throw new Error('Failed to open billing portal. Please try again.');
    }
  },

  /**
   * Legacy method for backward compatibility.
   * @deprecated Use getSubscriptionStatus() instead
   */
  async getPlan() {
    const status = await this.getSubscriptionStatus();
    return {
      role: status.plan === 'free' ? 'free_user' : 'premium_user',
      credits_remaining: status.credits_remaining,
      credits_reset_at: status.current_period_end,
    };
  },

  /**
   * Legacy method - no longer used.
   * @deprecated Use createCheckoutSession() instead
   */
  async setPlan(role) {
    console.warn('[billing.setPlan] Deprecated. Use createCheckoutSession() for upgrades.');
    throw new Error('Direct plan changes are not supported. Please use the upgrade button.');
  },
};

// ============================================
// CREDITS
// ============================================

// ============================================
// DRAFTS (Partial Save / Draft Naming)
// ============================================

export const drafts = {
  /**
   * Create a new draft.
   * No LLM calls, no credits consumed.
   */
  async create(draftData) {
    try {
      const { apiClient } = await import('@/lib/apiClient');
      return await apiClient.post('/drafts', draftData);
    } catch (error) {
      console.error('[drafts.create] Error:', error);
      throw error;
    }
  },

  /**
   * List all drafts for the current user.
   */
  async list() {
    try {
      const { apiClient } = await import('@/lib/apiClient');
      return await apiClient.get('/drafts');
    } catch (error) {
      console.error('[drafts.list] Error:', error);
      throw error;
    }
  },

  /**
   * Get a specific draft by ID.
   */
  async get(draftId) {
    if (!draftId) {
      console.error('[drafts.get] Invalid draft ID');
      return null;
    }
    
    try {
      const { apiClient } = await import('@/lib/apiClient');
      return await apiClient.get(`/drafts/${draftId}`);
    } catch (error) {
      const errorMsg = error.message || String(error);
      if (errorMsg.includes('404') || errorMsg.includes('not found')) {
        console.warn('[drafts.get] Draft not found:', draftId);
        return null;
      }
      console.error('[drafts.get] Error:', error);
      throw error;
    }
  },

  /**
   * Update an existing draft.
   */
  async update(draftId, draftData) {
    if (!draftId) {
      throw new Error('Draft ID is required');
    }
    
    try {
      const { apiClient } = await import('@/lib/apiClient');
      return await apiClient.put(`/drafts/${draftId}`, draftData);
    } catch (error) {
      console.error('[drafts.update] Error:', error);
      throw error;
    }
  },

  /**
   * Delete a draft.
   */
  async delete(draftId) {
    if (!draftId) {
      throw new Error('Draft ID is required');
    }
    
    try {
      const { apiClient } = await import('@/lib/apiClient');
      return await apiClient.delete(`/drafts/${draftId}`);
    } catch (error) {
      console.error('[drafts.delete] Error:', error);
      throw error;
    }
  },
};


// ============================================
// CREDITS
// ============================================

export const credits = {
  async decrementCredit(_reason = 'recording_started') {
    throw new Error('Client-side credit mutation is disabled. Credits are enforced server-side.');
  },

  async decrement(_amount = 1, _reason = 'recording_saved') {
    throw new Error('Client-side credit mutation is disabled. Credits are enforced server-side.');
  },

  async getCredits() {
    const user = await auth.getMe();
    if (!user) return 0;
    return user.credits_remaining ?? 0;
  },

  async resetCredits(_amount = 10) {
    throw new Error('Use the admin API to adjust credits. Client-side mutation is disabled.');
  },
};