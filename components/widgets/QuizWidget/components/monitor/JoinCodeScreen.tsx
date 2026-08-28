import React, { useState } from 'react';
import { Check, Copy, ExternalLink } from 'lucide-react';
import { QuizSession } from '@/types';
import { withPreviewFlag } from '@/utils/urlHelpers';

export const JoinCodeScreen: React.FC<{ session: QuizSession }> = ({
  session,
}) => {
  const [copied, setCopied] = useState(false);
  const hasCode = Boolean(session.code);
  const joinUrl = hasCode
    ? `${window.location.origin}/quiz?code=${session.code}`
    : '';

  const handleCopy = () => {
    if (!joinUrl) return;
    void navigator.clipboard.writeText(joinUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!hasCode) {
    return (
      <p
        className="text-brand-gray-primary text-center"
        style={{
          fontSize: 'min(13px, 4.5cqmin)',
          padding: 'min(16px, 4cqmin)',
        }}
      >
        This session has no join code — students join through their assignments
        page.
      </p>
    );
  }

  return (
    <div
      className="flex flex-col items-center text-center"
      style={{ gap: 'min(12px, 3cqmin)', padding: 'min(12px, 3cqmin) 0' }}
    >
      <p
        className="font-sans font-semibold text-brand-gray-primary uppercase tracking-wider"
        style={{ fontSize: 'min(11px, 3.8cqmin)' }}
      >
        Join at {window.location.host}/quiz
      </p>
      <p
        className="font-sans font-bold text-brand-blue-dark tracking-[0.15em] tabular-nums"
        style={{ fontSize: 'min(48px, 20cqmin)', lineHeight: 1 }}
      >
        {session.code}
      </p>
      <div
        className="flex flex-wrap justify-center"
        style={{ gap: 'min(8px, 2cqmin)' }}
      >
        <button
          onClick={handleCopy}
          className="inline-flex items-center bg-brand-blue-primary hover:bg-brand-blue-light text-white font-sans font-semibold rounded-md transition-colors"
          style={{
            gap: 'min(6px, 1.5cqmin)',
            padding: 'min(8px, 2cqmin) min(14px, 3cqmin)',
            fontSize: 'min(13px, 4.5cqmin)',
          }}
        >
          {copied ? (
            <Check
              style={{
                width: 'min(14px, 4.5cqmin)',
                height: 'min(14px, 4.5cqmin)',
              }}
            />
          ) : (
            <Copy
              style={{
                width: 'min(14px, 4.5cqmin)',
                height: 'min(14px, 4.5cqmin)',
              }}
            />
          )}
          {copied ? 'Copied' : 'Copy link'}
        </button>
        <a
          href={withPreviewFlag(joinUrl)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center bg-white border border-brand-gray-lighter hover:border-brand-blue-light text-brand-blue-primary font-sans font-semibold rounded-md transition-colors"
          style={{
            gap: 'min(6px, 1.5cqmin)',
            padding: 'min(8px, 2cqmin) min(14px, 3cqmin)',
            fontSize: 'min(13px, 4.5cqmin)',
          }}
        >
          <ExternalLink
            style={{
              width: 'min(14px, 4.5cqmin)',
              height: 'min(14px, 4.5cqmin)',
            }}
          />
          Preview
        </a>
      </div>
    </div>
  );
};
