/**
 * Sentry Error Tracking for Frontend
 * 
 * Provides:
 * - Automatic error capture and reporting
 * - Performance monitoring
 * - User context for error attribution
 * - Sensitive data scrubbing
 */

// Sentry initialization state
let sentryInitialized = false;
let Sentry = null;

/**
 * Initialize Sentry error tracking.
 * Must be called before app renders.
 */
export function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  
  if (!dsn) {
    if (import.meta.env.PROD) {
      console.warn(
        '[Sentry] VITE_SENTRY_DSN not configured. Error tracking disabled. ' +
        'Set VITE_SENTRY_DSN for production error tracking.'
      );
    }
    return false;
  }
  
  try {
    // Dynamic import to avoid bundling Sentry if not used
    import('@sentry/react').then((SentryModule) => {
      Sentry = SentryModule;
      
      // Environment-specific sampling rates (cost optimization)
      const environment = import.meta.env.MODE || 'development';
      const samplingConfig = {
        development: {
          traces: 1.0,      // 100% transaction tracing
          replays: 1.0,     // 100% session replay
        },
        staging: {
          traces: 0.5,      // 50% transaction tracing
          replays: 0.1,     // 10% session replay
        },
        production: {
          traces: 0.1,      // 10% transaction tracing
          replays: 0.02,    // 2% session replay
        },
      };
      
      const config = samplingConfig[environment] || samplingConfig.production;
      
      Sentry.init({
        dsn,
        environment,
        
        // Performance monitoring
        tracesSampleRate: config.traces,
        replaysSessionSampleRate: config.replays,
        replaysOnErrorSampleRate: import.meta.env.PROD ? 1.0 : 0,
        
        // Only send errors in production
        enabled: import.meta.env.PROD || import.meta.env.VITE_SENTRY_DEBUG === 'true',
        
        // Filter out noisy errors
        ignoreErrors: [
          // Browser extensions
          'top.GLOBALS',
          'originalCreateNotification',
          'canvas.contentDocument',
          'MyApp_RemoveAllHighlights',
          'http://tt.telegramkusev.com',
          
          // Common network errors (expected)
          'Network request failed',
          'Failed to fetch',
          'Load failed',
          'NetworkError',
          
          // Auth errors (expected)
          'Invalid login credentials',
          'Email not confirmed',
        ],
        
        // Don't send PII
        sendDefaultPii: false,
        
        // Before send hook
        beforeSend(event, hint) {
          // Filter out 401/403 errors (expected auth failures)
          const error = hint.originalException;
          if (error?.status === 401 || error?.status === 403) {
            return null;
          }
          
          // Scrub sensitive data from breadcrumbs
          if (event.breadcrumbs) {
            event.breadcrumbs = event.breadcrumbs.map(crumb => {
              if (crumb.data?.url) {
                // Remove tokens from URLs
                crumb.data.url = crumb.data.url.replace(/token=[^&]+/g, 'token=[REDACTED]');
              }
              return crumb;
            });
          }
          
          return event;
        },
        
        // Integrations
        integrations: [
          Sentry.browserTracingIntegration(),
          Sentry.replayIntegration({
            // Mask all text for privacy
            maskAllText: true,
            blockAllMedia: true,
          }),
        ],
        
      });
      
      sentryInitialized = true;
      console.log('[Sentry] Initialized for', import.meta.env.MODE, 'environment');
    }).catch((err) => {
      console.warn('[Sentry] Failed to load:', err);
    });
    
    return true;
  } catch (e) {
    console.warn('[Sentry] Initialization failed:', e);
    return false;
  }
}

/**
 * Set user context for Sentry events.
 * @param {string|null} userId - User ID or null to clear
 * @param {string|null} email - User email
 */
export function setUser(userId, email = null) {
  if (!Sentry) return;
  
  if (userId) {
    Sentry.setUser({
      id: userId,
      email: email || undefined,
    });
  } else {
    Sentry.setUser(null);
  }
}

/**
 * Capture an exception and send to Sentry.
 * @param {Error} error - The error to capture
 * @param {object} context - Additional context
 */
export function captureException(error, context = {}) {
  if (!Sentry) {
    console.error('[Error]', error, context);
    return;
  }
  
  Sentry.withScope((scope) => {
    if (context.tags) {
      Object.entries(context.tags).forEach(([key, value]) => {
        scope.setTag(key, value);
      });
    }
    if (context.extra) {
      Object.entries(context.extra).forEach(([key, value]) => {
        scope.setExtra(key, value);
      });
    }
    Sentry.captureException(error);
  });
}

/**
 * Capture a message and send to Sentry.
 * @param {string} message - The message to capture
 * @param {string} level - Log level (info, warning, error)
 */
export function captureMessage(message, level = 'info') {
  if (!Sentry) {
    console.log(`[${level}]`, message);
    return;
  }
  
  Sentry.captureMessage(message, level);
}

/**
 * Add a breadcrumb for debugging context.
 * @param {object} breadcrumb - Breadcrumb data
 */
export function addBreadcrumb(breadcrumb) {
  if (!Sentry) return;
  
  Sentry.addBreadcrumb(breadcrumb);
}

/**
 * React Error Boundary component.
 * Use this to wrap parts of your app that should catch errors.
 */
export function ErrorBoundary({ children, fallback }) {
  if (!Sentry) {
    // Fallback if Sentry not loaded - just render children
    return children;
  }
  
  return (
    <Sentry.ErrorBoundary fallback={fallback || DefaultErrorFallback}>
      {children}
    </Sentry.ErrorBoundary>
  );
}

/**
 * Default error fallback UI.
 */
function DefaultErrorFallback({ error, resetError }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-900 p-6">
      <div className="max-w-md w-full text-center">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mb-4">
          Something went wrong
        </h1>
        <p className="text-zinc-600 dark:text-zinc-400 mb-6">
          We've been notified and are working on a fix. Please try refreshing the page.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="px-6 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors"
        >
          Refresh Page
        </button>
      </div>
    </div>
  );
}
