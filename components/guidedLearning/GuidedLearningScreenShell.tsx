import React from 'react';
import {
  AUTH_CARD,
  AUTH_PAGE_BG,
  AUTH_PAGE_DOTS,
} from '@/components/auth/authShellStyles';
import { GuidedLearningWelcomeImage } from './GuidedLearningWelcomeImage';

interface GuidedLearningScreenShellProps {
  children: React.ReactNode;
  /** The welcome card is wider than the plain start and end cards. */
  wide?: boolean;
}

/** A full-page Guided Learning start or end screen, in the sign-in page's style. */
export const GuidedLearningScreenShell: React.FC<
  GuidedLearningScreenShellProps
> = ({ children, wide = false }) => (
  <div className={`relative h-screen h-dvh overflow-y-auto ${AUTH_PAGE_BG}`}>
    <div className={AUTH_PAGE_DOTS} aria-hidden="true" />
    <div className="relative flex min-h-full items-center justify-center px-4 py-10">
      <div className={`${wide ? 'max-w-md' : 'max-w-sm'} ${AUTH_CARD}`}>
        {children}
      </div>
    </div>
  </div>
);

interface GuidedLearningWelcomeHeaderProps {
  title: string;
  /** The teacher's welcome image; the SpartBoard logo shows without one. */
  imageUrl?: string;
  imageAlt?: string;
  /** The teacher's welcome message, or the mode and step count line. */
  children?: React.ReactNode;
  titleAs?: 'h1' | 'p';
}

/** Logo or welcome image, title and message: shared by the start screen and its Studio preview. */
export const GuidedLearningWelcomeHeader: React.FC<
  GuidedLearningWelcomeHeaderProps
> = ({ title, imageUrl, imageAlt, children, titleAs: Title = 'h1' }) => (
  <>
    {imageUrl ? (
      <GuidedLearningWelcomeImage
        url={imageUrl}
        alt={imageAlt}
        className="mb-6"
      />
    ) : (
      <GuidedLearningLogo />
    )}
    <Title className="text-2xl font-semibold tracking-tight text-slate-900 break-words">
      {title}
    </Title>
    {children}
  </>
);

export const GuidedLearningLogo: React.FC = () => (
  <img
    src="/favicon.png"
    alt=""
    className="mx-auto mb-5 h-11 w-11 rounded-xl"
  />
);

/** The welcome message as plain text under the title. */
export const GuidedLearningWelcomeMessage: React.FC<{ text: string }> = ({
  text,
}) => (
  <p className="mt-3 whitespace-pre-wrap text-[15px] leading-relaxed text-slate-600">
    {text}
  </p>
);

export const GL_PRIMARY_BUTTON =
  'flex w-full items-center justify-center gap-2 rounded-xl bg-brand-blue-primary py-3 text-sm font-semibold text-white shadow-sm shadow-brand-blue-primary/20 transition-colors hover:bg-brand-blue-dark focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue-primary disabled:cursor-not-allowed disabled:opacity-60';
