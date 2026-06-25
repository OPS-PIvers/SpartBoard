import React, { useState } from 'react';
import { Link2, Loader2, Check } from 'lucide-react';

import { useAuth } from '@/context/useAuth';
import { useShortLinks } from '@/hooks/useShortLinks';
import { SHORT_LINK_PREFIX } from '@/utils/shortLinkValidation';

const buildShortUrl = (code: string): string => {
  if (typeof window === 'undefined') return SHORT_LINK_PREFIX + code;
  return `${window.location.origin}${SHORT_LINK_PREFIX}${code}`;
};

interface ShortenUrlButtonProps {
  /** The long URL to shorten. Button is disabled when blank. */
  url: string;
  /** Called with the resulting `/r/:code` short URL on success. */
  onShortened: (shortUrl: string) => void;
  /**
   * Optional contextual label stored on the new short link (e.g. the
   * announcement title or widget label) so the admin link table is readable.
   */
  label?: string;
  /** Optional extra classes for the wrapper. */
  className?: string;
}

/**
 * Inline "Shorten this URL" button placed next to URL inputs across the admin
 * surface. On click it creates a `short_links/{code}` doc via `createShortLink`
 * and hands the resulting `/r/:code` URL back to the parent via `onShortened`,
 * which decides whether to replace the field value.
 *
 * Admin-gated: renders `null` for non-admins, so teachers keep entering raw
 * URLs exactly as before. It never auto-replaces — the parent owns that.
 */
export const ShortenUrlButton: React.FC<ShortenUrlButtonProps> = ({
  url,
  onShortened,
  label,
  className,
}) => {
  const { isAdmin } = useAuth();
  const { createShortLink } = useShortLinks();
  const [state, setState] = useState<'idle' | 'working' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);

  // Non-admins never see the button. Firestore rules also reject the write,
  // but hiding it keeps the teacher-facing surface clean.
  if (!isAdmin) return null;

  const trimmed = url.trim();
  const disabled = state === 'working' || trimmed === '';

  const handleClick = async () => {
    if (disabled) return;
    setError(null);
    setState('working');
    try {
      const result = await createShortLink({
        destination: trimmed,
        label: label?.trim() || undefined,
      });
      if (!result.ok) {
        setError(result.reason);
        setState('idle');
        return;
      }
      onShortened(buildShortUrl(result.link.code));
      setState('done');
      window.setTimeout(() => setState('idle'), 1500);
    } catch {
      setError('Failed to shorten URL.');
      setState('idle');
    }
  };

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => void handleClick()}
        disabled={disabled}
        title="Create a short /r/ link for this URL"
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-brand-blue-primary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {state === 'working' ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : state === 'done' ? (
          <Check className="w-3.5 h-3.5 text-emerald-600" />
        ) : (
          <Link2 className="w-3.5 h-3.5" />
        )}
        {state === 'done' ? 'Shortened' : 'Shorten URL'}
      </button>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
};
