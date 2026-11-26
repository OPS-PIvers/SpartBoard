import React from 'react';
import {
  STUDENT_PRIMARY_BUTTON,
  StudentScreenLogo,
  StudentScreenShell,
} from '@/components/student/StudentScreenShell';
import { GuidedLearningWelcomeImage } from './GuidedLearningWelcomeImage';

// Guided Learning's screens use the shared student card.
export const GuidedLearningScreenShell = StudentScreenShell;
export const GuidedLearningLogo = StudentScreenLogo;
export const GL_PRIMARY_BUTTON = STUDENT_PRIMARY_BUTTON;

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

/** The welcome message as plain text under the title. */
export const GuidedLearningWelcomeMessage: React.FC<{ text: string }> = ({
  text,
}) => (
  <p className="mt-3 whitespace-pre-wrap text-[15px] leading-relaxed text-slate-600">
    {text}
  </p>
);
