import React, { useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { copyText } from '@/utils/copyText';
import { htmlToPlainText } from '@/utils/writtenAnnotations';

// Copies plain text; shows a check for 2s, and nothing when the clipboard refuses.
export const CopyTextButton: React.FC<{
  /** Plain text to copy, or `html` to copy as plain text. */
  text?: string;
  html?: string;
  label: string;
  copiedLabel: string;
  /** Visible word next to the icon; icon only when omitted. */
  caption?: string;
  className: string;
  iconClassName?: string;
  anchor?: Record<string, string>;
}> = ({
  text,
  html,
  label,
  copiedLabel,
  caption,
  className,
  iconClassName = 'h-3.5 w-3.5',
  anchor,
}) => {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );
  const handleClick = () => {
    void copyText(text ?? htmlToPlainText(html ?? '')).then((ok) => {
      if (!ok) return;
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    });
  };
  const Icon = copied ? Check : Copy;
  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={!text && !html}
      aria-label={copied ? copiedLabel : label}
      title={label}
      {...anchor}
      className={className}
    >
      <Icon
        aria-hidden
        className={`${iconClassName} ${copied ? 'text-emerald-600' : ''}`}
      />
      {caption !== undefined && <span>{copied ? copiedLabel : caption}</span>}
      <span aria-live="polite" className="sr-only">
        {copied ? copiedLabel : ''}
      </span>
    </button>
  );
};
