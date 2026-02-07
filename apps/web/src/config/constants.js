/**
 * Frontend Application Constants
 * 
 * This file centralizes all configurable values that affect application behavior.
 * Values can be overridden via environment variables where appropriate.
 * 
 * DO NOT hardcode these values in component files - import from here.
 */

// =============================================================================
// API CONFIGURATION
// =============================================================================

/**
 * Base URL for backend API.
 * In production, this should be set via VITE_API_BASE_URL environment variable.
 * Default: localhost:8000 for local development
 */
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

/**
 * WebSocket URL for live transcription.
 * Derived from API_BASE_URL if not explicitly set.
 * Can be overridden via VITE_TRANSCRIPTION_WS_URL for special deployments.
 */
export const getWebSocketUrl = () => {
  const explicitWsUrl = import.meta.env.VITE_TRANSCRIPTION_WS_URL;
  if (explicitWsUrl) {
    return explicitWsUrl;
  }
  
  try {
    const apiUrl = new URL(API_BASE_URL);
    const wsProtocol = apiUrl.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${wsProtocol}//${apiUrl.host}/ws/listen`;
  } catch {
    // Fallback for local development
    return 'ws://localhost:8000/ws/listen';
  }
};

// =============================================================================
// RECORDING CONFIGURATION
// =============================================================================

/**
 * MediaRecorder timeslice in milliseconds.
 * Controls how frequently audio chunks are emitted.
 * Lower values = more frequent chunks = lower latency transcription
 * Higher values = fewer chunks = more efficient but higher latency
 * 
 * 250ms is a good balance for live transcription.
 */
export const RECORDING_TIMESLICE_MS = 250;

/**
 * WebSocket connection timeout in milliseconds.
 * How long to wait for WebSocket to connect before failing.
 */
export const WEBSOCKET_CONNECTION_TIMEOUT_MS = 3000;

/**
 * WebSocket ready check interval in milliseconds.
 * How often to check if WebSocket is ready during connection.
 */
export const WEBSOCKET_READY_CHECK_INTERVAL_MS = 50;

/**
 * Minimum token length for JWT validation.
 * Supabase JWTs are typically 100+ chars.
 */
export const MIN_JWT_TOKEN_LENGTH = 50;

// =============================================================================
// UI TIMING CONFIGURATION
// =============================================================================

/**
 * Duration for toast notifications in milliseconds.
 */
export const TOAST_DURATION = {
  SHORT: 2000,
  DEFAULT: 4000,
  LONG: 5000,
  ERROR: 6000,
};

/**
 * Delay for undo actions before permanent deletion (ms).
 */
export const UNDO_DELAY_MS = 4000;

/**
 * Clipboard feedback duration (ms).
 */
export const COPY_FEEDBACK_DURATION_MS = 2000;

/**
 * Admin message auto-dismiss duration (ms).
 */
export const ADMIN_MESSAGE_DURATION_MS = 3000;

// =============================================================================
// FILE UPLOAD LIMITS
// =============================================================================

/**
 * Maximum audio file size in bytes (15MB).
 */
export const MAX_AUDIO_FILE_SIZE_BYTES = 15 * 1024 * 1024;

/**
 * Maximum audio file size display string.
 */
export const MAX_AUDIO_FILE_SIZE_DISPLAY = '15MB';

// =============================================================================
// CREDITS & LIMITS
// =============================================================================

/**
 * Default credits for free users.
 */
export const DEFAULT_USER_CREDITS = 10;

/**
 * Credits for Pro users.
 */
export const PRO_USER_CREDITS = 60;

/**
 * Credits for Pro+ users (future).
 */
export const PRO_PLUS_USER_CREDITS = 200;

/**
 * Credits reset amount for admin actions.
 */
export const CREDITS_RESET_AMOUNT = 60;

// =============================================================================
// STRIPE BILLING
// =============================================================================

/**
 * Stripe publishable key (for frontend).
 * REQUIRED for checkout integration.
 */
export const STRIPE_PUBLISHABLE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '';

/**
 * Stripe Price IDs for subscription plans.
 * These must match the Price IDs in your Stripe Dashboard.
 * Set via environment variables in production.
 */
export const STRIPE_PRICES = {
  PRO_MONTHLY: import.meta.env.VITE_STRIPE_PRICE_ID_MONTHLY || 'price_1SwSeWRMlOCa3iSrNXkanthZ',
  PRO_YEARLY: import.meta.env.VITE_STRIPE_PRICE_ID_YEARLY || 'price_1SwShxRMlOCa3iSrmEInGSLw',
};

/**
 * Plan display names.
 */
export const PLAN_NAMES = {
  free: 'Free',
  pro_monthly: 'Pro (Monthly)',
  pro_yearly: 'Pro (Yearly)',
  pro_plus_monthly: 'Pro+ (Monthly)',
  pro_plus_yearly: 'Pro+ (Yearly)',
};

/**
 * Check if Stripe is configured.
 */
export const isStripeConfigured = () => Boolean(STRIPE_PUBLISHABLE_KEY);

// =============================================================================
// SESSION STORE
// =============================================================================

/**
 * Prefix for seed/demo session IDs.
 * Sessions with this prefix are filtered out of real user data.
 */
export const SEED_SESSION_ID_PREFIX = 'seed-';

/**
 * Prefix for local session IDs.
 */
export const LOCAL_SESSION_ID_PREFIX = 'local-';

// =============================================================================
// TRANSCRIPTION
// =============================================================================

/**
 * Minimum transcript length to be considered valid (characters).
 */
export const MIN_VALID_TRANSCRIPT_LENGTH = 3;

/**
 * Transcript length threshold for "short transcript" warning.
 */
export const SHORT_TRANSCRIPT_THRESHOLD = 50;

/**
 * Maximum transcript length to keep in UI (characters).
 * Prevents memory issues with very long recordings.
 */
export const MAX_TRANSCRIPT_UI_LENGTH = 1200;

// =============================================================================
// CHART CONFIGURATION (Growth page)
// =============================================================================

/**
 * Number of recent sessions to display in charts.
 */
export const CHART_SESSION_COUNT = 12;

/**
 * Default Y-axis domains for charts.
 */
export const CHART_DOMAINS = {
  CONFIDENCE: [50, 100],
  WPM: [100, 180],
};
