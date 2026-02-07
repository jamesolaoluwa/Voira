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
    // Try backend first, fallback to direct Supabase if backend unavailable
    // Use requireAuth: true to fail fast if no session exists (prevents 429s during OAuth)
    try {
      const { apiClient } = await import('@/lib/apiClient');
      return await apiClient.get('/auth/me', { requireAuth: true });
    } catch (error) {
      // If no session, return null immediately (don't try fallback)
      if (error.code === 'NO_SESSION') {
        console.debug('[api.getMe] No session available, returning null');
        return null;
      }
      
      console.warn('Backend /auth/me failed, falling back to direct Supabase:', error.message);
      // Fallback to direct Supabase query
      const { data: { user }, error: supabaseError } = await supabase.auth.getUser();
      if (supabaseError) throw supabaseError;
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
    }
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
      // If backend fails with 402 (payment required), re-throw for UI to handle
      if (error.message?.includes('402') || error.message?.includes('Insufficient credits')) {
        throw error;
      }
      // Fallback to direct Supabase (legacy)
      console.warn('Backend /sessions failed, falling back to direct Supabase:', error);
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
        clarity_score: clarityScore,
        confidence_score: confidenceScore,
        filler_count: fillerCount,
        words_per_minute: wordsPerMinute,
        highlights: JSON.stringify(highlights),
      });
      return session;
    }
  },

  /**
   * Get a session by ID
   * 
   * LOADING STRATEGY:
   * 1. Try backend API first
   * 2. If backend returns 404 → return null immediately (NO fallback)
   * 3. If backend is unavailable → try direct Supabase query
   * 
   * This prevents duplicate 404 errors and unnecessary network calls.
   */
  async getSessionById(id) {
    // Validate ID before querying
    if (!id || typeof id !== 'string' || id.trim().length === 0) {
      console.error('[sessions.getSessionById] Invalid session ID:', id);
      return null;
    }
    
    // Track if we got an explicit 404 from backend
    let backendReturned404 = false;
    
    try {
      // Try backend API first (preferred)
      try {
        const { apiClient } = await import('@/lib/apiClient');
        const session = await apiClient.get(`/sessions/${id}`);
        if (session) {
          console.log('[sessions.getSessionById] Loaded from backend API:', id);
          return session;
        }
      } catch (apiError) {
        const errorMsg = apiError.message || String(apiError);
        
        // Check if this is an explicit 404 from the backend
        if (errorMsg.includes('404') || errorMsg.includes('not found') || errorMsg.includes('Not Found')) {
          console.warn('[sessions.getSessionById] Backend returned 404, NOT retrying:', id);
          backendReturned404 = true;
          // DO NOT fall through to direct query - return null immediately
          return null;
        }
        
        // For other errors (network, CORS, etc.), fall through to direct query
        console.warn('[sessions.getSessionById] Backend unavailable, trying direct query:', apiError.message);
      }
      
      // ONLY do fallback query if backend was unavailable (not if it returned 404)
      if (backendReturned404) {
        return null;
      }
      
      // Fallback: Direct Supabase query via Base44
      const recordings = await base44.entities.Recording.filter({ id });
      
      if (!recordings || recordings.length === 0) {
        console.warn('[sessions.getSessionById] Session not found in direct query:', id);
        return null;
      }
      
      const recording = recordings[0];
      
      // Parse highlights JSON safely
      if (recording.highlights && typeof recording.highlights === 'string') {
        try {
          recording.highlights = JSON.parse(recording.highlights);
        } catch (e) {
          console.warn('[sessions.getSessionById] Failed to parse highlights JSON:', e);
          recording.highlights = [];
        }
      }

      console.log('[sessions.getSessionById] Loaded from direct query:', id);
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
        source: 'backend', // Mark as backend-sourced
      };
    } catch (error) {
      const errorMsg = error.message || String(error);
      
      if (errorMsg.includes('permission') || errorMsg.includes('403') || errorMsg.includes('unauthorized')) {
        console.error('[sessions.getSessionById] Permission denied for session:', id);
        throw new Error('You do not have permission to view this recording.');
      } else if (errorMsg.includes('404') || errorMsg.includes('not found')) {
        // Should not reach here due to early return above, but handle just in case
        console.warn('[sessions.getSessionById] Session not found:', id);
        return null;
      } else {
        console.error('[sessions.getSessionById] Database error loading session:', id, error);
        throw new Error(`Failed to load session: ${errorMsg}`);
      }
    }
  },

  async listSessions(filters = {}) {
    // Try backend first
    try {
      const { apiClient } = await import('@/lib/apiClient');
      const sessions = await apiClient.get('/sessions');
      return sessions.map(session => ({
        id: session.id,
        user_id: session.user_id,
        title: session.title,
        type: session.type,
        question: session.question || '',
        transcript: session.transcript || '',
        duration_seconds: session.duration_seconds || 0,
        confidence_score: session.confidence_score || 0,
        clarity_score: session.clarity_score || 0,
        filler_count: session.filler_count || 0,
        words_per_minute: session.words_per_minute || 0,
        tags: session.tags || [],
        created_at: session.created_at,
      }));
    } catch (error) {
      // Fallback to direct Supabase
      console.warn('Backend /sessions list failed, falling back to direct Supabase:', error);
      const recordings = await base44.entities.Recording.list('-created_date');
      return recordings.map(recording => ({
        id: recording.id,
        user_id: recording.created_by,
        title: recording.title,
        type: recording.type,
        question: recording.question || '',
        transcript: recording.transcript || '',
        duration_seconds: recording.duration_seconds || 0,
        confidence_score: recording.confidence_score || 0,
        clarity_score: recording.clarity_score || 0,
        filler_count: recording.filler_count || 0,
        words_per_minute: recording.words_per_minute || 0,
        tags: recording.tags || [],
        created_at: recording.created_date,
      }));
    }
  },

  async deleteSession(id) {
    await base44.entities.Recording.delete(id);
  },

  async deleteAllSessions() {
    // Try backend first
    try {
      const { apiClient } = await import('@/lib/apiClient');
      return await apiClient.delete('/sessions');
    } catch (error) {
      // Fallback to direct Supabase (delete all for current user)
      console.warn('Backend DELETE /sessions failed, falling back to direct Supabase:', error);
      const recordings = await base44.entities.Recording.list('-created_date');
      // Delete all recordings one by one (Supabase doesn't have bulk delete via client)
      for (const recording of recordings) {
        await base44.entities.Recording.delete(recording.id);
      }
      return { deleted_count: recordings.length, message: `Deleted ${recordings.length} session(s)` };
    }
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
        credits_total: 10,
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

  // Backwards-compatible helper that decrements by an arbitrary amount
  // amount: number of credits to remove (defaults to 1)
  async decrement(amount = 1, reason = 'recording_saved') {
    const user = await auth.getMe();
    if (!user) throw new Error('Not authenticated');

    const profiles = await base44.entities.UserProfile.filter({ user_id: user.id });

    if (profiles.length === 0) {
      // Create a profile with starting credits minus amount
      const starting = Math.max(0, 60 - amount);
      await base44.entities.UserProfile.create({
        user_id: user.id,
        full_name: user.full_name,
        role: user.role,
        credits_remaining: starting,
      });
      return starting;
    }

    const profile = profiles[0];
    const newCredits = Math.max(0, (profile.credits_remaining || 60) - Number(amount));

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