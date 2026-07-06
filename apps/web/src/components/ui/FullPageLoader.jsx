import { Loader2 } from 'lucide-react';

/**
 * Full-viewport centered loading spinner.
 *
 * Shared so auth gates and pages show a consistent loading state instead of a
 * blank screen (return null) while auth/session/data resolves.
 */
export default function FullPageLoader({ label = 'Loading…' }) {
  return (
    <div
      className="min-h-screen flex items-center justify-center"
      role="status"
      aria-live="polite"
    >
      <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
      <span className="sr-only">{label}</span>
    </div>
  );
}
