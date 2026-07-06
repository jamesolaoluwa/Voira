import { Component } from 'react';
import { captureException } from '@/lib/sentry';

/**
 * Always-on React error boundary.
 *
 * The Sentry-provided boundary (lib/sentry.jsx) renders children unprotected
 * until the Sentry SDK finishes its async dynamic import, which leaves a window
 * where an uncaught render error white-screens the whole SPA. This class-based
 * boundary always catches, shows a recoverable fallback, and forwards the error
 * to Sentry when it is available.
 */
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    try {
      captureException(error, { componentStack: info?.componentStack });
    } catch {
      // Never let error reporting throw from the boundary itself.
    }
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-900 p-6">
          <div className="max-w-md w-full text-center">
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mb-4">
              Something went wrong
            </h1>
            <p className="text-zinc-600 dark:text-zinc-400 mb-6">
              An unexpected error occurred. Please try refreshing the page.
            </p>
            <button
              onClick={this.handleReload}
              className="px-6 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors"
            >
              Refresh
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
