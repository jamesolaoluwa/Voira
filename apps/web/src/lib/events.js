/**
 * Event tracking utility with batching for analytics.
 * 
 * Events are queued and sent in batches to reduce API calls:
 * - Batch size: 10 events
 * - Batch timeout: 30 seconds
 * - Auto-flush on page unload
 * 
 * Usage:
 *   import { trackEvent, flushAnalytics } from './events';
 *   
 *   trackEvent('session_started', { session_id: '123', duration: 30 });
 *   // Events are queued and sent automatically
 */

import { apiClient } from './apiClient';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

// Batching configuration
const BATCH_SIZE = 10;
const BATCH_TIMEOUT_MS = 30000;  // 30 seconds

let analyticsQueue = [];
let flushTimer = null;

/**
 * Queue an analytics event for batched sending
 * 
 * @param {String} event - Event name (e.g., 'session_started', 'recording_complete')
 * @param {Object} data - Event data/context
 */
export async function trackEvent(event, data = {}) {
  try {
    const eventPayload = {
      event,
      data,
      timestamp: new Date().toISOString(),
      url: window?.location?.pathname || 'unknown',
      user_agent: window?.navigator?.userAgent || 'unknown',
    };

    analyticsQueue.push(eventPayload);
    console.debug(`Analytics event queued: ${event} (queue size: ${analyticsQueue.length})`);

    // Check if we should flush
    if (analyticsQueue.length >= BATCH_SIZE) {
      await flushAnalytics();
    } else if (!flushTimer) {
      // Schedule flush after timeout
      flushTimer = setTimeout(flushAnalytics, BATCH_TIMEOUT_MS);
    }
  } catch (error) {
    console.error(`Failed to queue event: ${error.message}`);
  }
}

/**
 * Flush queued analytics events in a batch
 */
export async function flushAnalytics() {
  if (analyticsQueue.length === 0) return;

  // Clear timer if set
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }

  // Dequeue all events
  const batch = analyticsQueue.splice(0);
  console.debug(`Flushing ${batch.length} analytics events`);

  try {
    const response = await apiClient.post('/analytics/batch', { 
      events: batch,
      count: batch.length,
    });
    console.debug(`Batch flushed successfully: ${batch.length} events`);
    return response.data;
  } catch (error) {
    console.error(`Failed to flush analytics batch: ${error.message}`);
    
    // Re-queue failed events (prepend to queue)
    analyticsQueue = batch.concat(analyticsQueue);
    
    // Schedule retry
    if (!flushTimer) {
      flushTimer = setTimeout(flushAnalytics, BATCH_TIMEOUT_MS);
    }
  }
}

// Flush analytics on page unload (don't lose data)
if (typeof window !== 'undefined') {
  // Use beforeunload for best compatibility
  window.addEventListener('beforeunload', () => {
    // Synchronous flush or sendBeacon for reliability
    if (analyticsQueue.length > 0) {
      try {
        const blob = new Blob(
          [JSON.stringify({ events: analyticsQueue })],
          { type: 'application/json' }
        );
        navigator.sendBeacon(`${API_BASE_URL}/analytics/batch`, blob);
      } catch (error) {
        console.error('Failed to send beacon on unload:', error);
      }
    }
  });
}

// Also flush on visibility change (app minimized or tab switched)
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && analyticsQueue.length > 0) {
      flushAnalytics();
    }
  });
}
