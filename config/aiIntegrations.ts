import type { AiInputKind } from '@/config/aiModels';

export type AiTier = 'advanced' | 'standard';

export interface AiIntegration {
  id: string;
  label: string;
  description: string;
  group: string;
  tier: AiTier;
  inputs: readonly AiInputKind[];
}

// Every server model call names one of these ids; tiers and inputs must match functions/src/aiIntegrations.ts (aiIntegrationsParity test).
export const AI_INTEGRATIONS: readonly AiIntegration[] = [
  {
    id: 'quiz',
    label: 'Quiz generation',
    description: 'Drafts quiz questions from a topic in the quiz editor.',
    group: 'Quizzes',
    tier: 'standard',
    inputs: ['text'],
  },
  {
    id: 'quiz-document-import',
    label: 'Quiz import from a document',
    description:
      'Reads a PDF or Word test into quiz questions. Word files always use Gemini.',
    group: 'Quizzes',
    tier: 'standard',
    inputs: ['pdf', 'docx'],
  },
  {
    id: 'quiz-stimulus-ocr',
    label: 'Read-aloud text from a scan',
    description:
      'Reads the text of a scanned reading passage so a quiz can read it aloud.',
    group: 'Quizzes',
    tier: 'standard',
    inputs: ['pdf', 'image'],
  },
  {
    id: 'quiz-translation',
    label: 'Quiz translation',
    description: 'Translates a quiz into a student’s language.',
    group: 'Quizzes',
    tier: 'advanced',
    inputs: ['text'],
  },
  {
    id: 'response-translation',
    label: 'Student answer translation',
    description: 'Translates a student’s written answer into English.',
    group: 'Quizzes',
    tier: 'standard',
    inputs: ['text'],
  },
  {
    id: 'paper-handwriting',
    label: 'Handwritten paper answers',
    description:
      'Reads handwritten answers from scanned paper quizzes. Its tier comes from the Handwritten Answers setting.',
    group: 'Quizzes',
    tier: 'standard',
    inputs: ['image'],
  },
  {
    id: 'video-activity',
    label: 'Video activity questions',
    description:
      'Watches a YouTube video and writes questions. Always uses Gemini.',
    group: 'Video',
    tier: 'standard',
    inputs: ['video'],
  },
  {
    id: 'video-transcription',
    label: 'Video audio transcription',
    description:
      'The alternate video path that listens to the audio. Always uses Gemini.',
    group: 'Video',
    tier: 'standard',
    inputs: ['video'],
  },
  {
    id: 'video-activity-recommend',
    label: 'Video recommendations',
    description: 'Suggests a YouTube video for a topic.',
    group: 'Video',
    tier: 'standard',
    inputs: ['text'],
  },
  {
    id: 'guided-learning',
    label: 'Guided Learning from images',
    description: 'Builds a guided learning activity from uploaded images.',
    group: 'Guided Learning',
    tier: 'advanced',
    inputs: ['image'],
  },
  {
    id: 'guided-learning-step-text',
    label: 'Guided Learning step text',
    description:
      'Writes the text for each recorded step in the recorder and live tours.',
    group: 'Guided Learning',
    tier: 'advanced',
    inputs: ['image'],
  },
  {
    id: 'plc-meeting-transcribe',
    label: 'PLC meeting transcription',
    description:
      'Turns a meeting recording into a transcript. Always uses Gemini.',
    group: 'PLC',
    tier: 'advanced',
    inputs: ['audio'],
  },
  {
    id: 'plc-meeting-summary',
    label: 'PLC meeting notes',
    description: 'Writes meeting notes and action items from the transcript.',
    group: 'PLC',
    tier: 'advanced',
    inputs: ['text'],
  },
  {
    id: 'plc-goal-coach',
    label: 'PLC goal coach',
    description: 'Checks a team goal against the SMART goal rubric.',
    group: 'PLC',
    tier: 'standard',
    inputs: ['text'],
  },
  {
    id: 'mini-app',
    label: 'Mini apps',
    description: 'Writes the code for a mini app from a description.',
    group: 'Board and widgets',
    tier: 'advanced',
    inputs: ['text'],
  },
  {
    id: 'widget-builder',
    label: 'Widget builder',
    description: 'Writes code for a custom widget.',
    group: 'Board and widgets',
    tier: 'advanced',
    inputs: ['text'],
  },
  {
    id: 'poll',
    label: 'Smart poll',
    description: 'Drafts a poll question and options from a topic.',
    group: 'Board and widgets',
    tier: 'standard',
    inputs: ['text'],
  },
  {
    id: 'dashboard-layout',
    label: 'Magic Layout',
    description: 'Picks and places widgets for a lesson description.',
    group: 'Board and widgets',
    tier: 'standard',
    inputs: ['text'],
  },
  {
    id: 'instructional-routine',
    label: 'Instructional routines',
    description: 'Drafts a classroom routine and its steps.',
    group: 'Board and widgets',
    tier: 'standard',
    inputs: ['text'],
  },
  {
    id: 'ocr',
    label: 'Text recognition',
    description: 'Reads text from a drawing, webcam picture or image.',
    group: 'Board and widgets',
    tier: 'standard',
    inputs: ['image'],
  },
  {
    id: 'widget-explainer',
    label: 'Widget explainer',
    description: 'Explains what a widget does.',
    group: 'Board and widgets',
    tier: 'standard',
    inputs: ['text'],
  },
  {
    id: 'blooms-ai',
    label: "Bloom's AI",
    description: "Writes question stems for a Bloom's level.",
    group: 'Board and widgets',
    tier: 'standard',
    inputs: ['text'],
  },
];
