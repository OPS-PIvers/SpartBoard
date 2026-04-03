import { httpsCallable } from 'firebase/functions';
import { functions } from '@/config/firebase';
import {
  WidgetType,
  WidgetConfig,
  GridPosition,
  GuidedLearningStep,
  GuidedLearningMode,
  GuidedLearningInteractionType,
} from '@/types';
import { TOOLS } from '@/config/tools';

export interface GeneratedMiniApp {
  /** The generated HTML code for the mini-app, including embedded CSS and JS */
  html: string;
  /** A short, descriptive title for the mini-app */
  title: string;
}

export interface GeneratedWidget {
  type: WidgetType;
  config: WidgetConfig;
  gridConfig?: GridPosition;
}

export interface GeneratedQuestion {
  text: string;
  type?: string;
  correctAnswer?: string;
  incorrectAnswers?: string[];
  timeLimit?: number;
}

interface AIResponseData {
  questions?: GeneratedQuestion[];
  html?: string;
  title?: string;
  question?: string;
  options?: string[];
  widgets?: GeneratedWidget[];
  text?: string;
}

export type AIGenerationType =
  | 'mini-app'
  | 'poll'
  | 'dashboard-layout'
  | 'instructional-routine'
  | 'ocr'
  | 'quiz'
  | 'video-activity'
  | 'guided-learning';

export interface GeneratedVideoQuestion extends GeneratedQuestion {
  /** Seconds from video start when this question should trigger. */
  timestamp: number;
}

export interface GeneratedVideoActivity {
  title: string;
  questions: GeneratedVideoQuestion[];
}

const VIDEO_ACTIVITY_CALL_TIMEOUT_MS = 300_000;

const VIDEO_ACTIVITY_TIMEOUT_ERROR =
  'Video analysis is taking longer than expected. Please try a shorter YouTube video (under ~15 minutes) or try again in a moment.';

const isFunctionsDeadlineExceededError = (
  error: unknown
): error is { code: string } =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  typeof error.code === 'string' &&
  error.code === 'deadline-exceeded';

/**
 * Generic helper to call the AI function and handle errors
 */
async function callAI(
  payload: { type: AIGenerationType; prompt?: string; image?: string },
  baseErrorMessage: string
): Promise<AIResponseData> {
  try {
    const generateWithAI = httpsCallable<
      { type: AIGenerationType; prompt?: string; image?: string },
      AIResponseData
    >(functions, 'generateWithAI');

    const result = await generateWithAI(payload);
    return result.data;
  } catch (error) {
    console.error('AI Generation Error:', error);

    let errorMessage = baseErrorMessage;

    if (error instanceof Error) {
      errorMessage += ` Underlying error: ${error.message}`;
    }

    throw new Error(errorMessage);
  }
}

/**
 * Extracts text from an image using Gemini AI via a Firebase Function proxy.
 *
 * @param base64Image - The base64 encoded image data.
 * @returns A promise resolving to the extracted text.
 */
export async function extractTextWithGemini(
  base64Image: string
): Promise<string> {
  const data = await callAI(
    { type: 'ocr', image: base64Image },
    'Failed to extract text using Gemini.'
  );

  if (typeof data.text !== 'string') {
    throw new Error('Invalid response format from AI');
  }

  return data.text;
}

/**
 * Generates a mini-app based on a natural language prompt using a Firebase Function proxy.
 *
 * @param prompt - The natural language description of the app to generate.
 * @returns A promise resolving to the generated app title and HTML code.
 * @throws Error if the generation fails.
 */
export async function generateMiniAppCode(
  prompt: string
): Promise<GeneratedMiniApp> {
  const data = await callAI(
    { type: 'mini-app', prompt },
    'Failed to generate app. Please try again with a different prompt.'
  );

  if (!data.html || !data.title) {
    throw new Error('Invalid response format from AI');
  }

  return {
    title: data.title,
    html: data.html,
  };
}

export interface GeneratedPoll {
  question: string;
  options: string[];
}

/**
 * Generates a poll question and options based on a topic using a Firebase Function proxy.
 *
 * @param topic - The topic or subject for the poll.
 * @returns A promise resolving to the generated question and options.
 * @throws Error if generation fails.
 */
export async function generatePoll(topic: string): Promise<GeneratedPoll> {
  const data = await callAI(
    { type: 'poll', prompt: topic },
    'Failed to generate poll. Please try again with a different topic.'
  );

  if (!data.question || !Array.isArray(data.options)) {
    throw new Error('Invalid response format from AI');
  }

  return {
    question: data.question,
    options: data.options.map((o) => String(o)),
  };
}

/**
 * Generates a dashboard layout based on a natural language description using a Firebase Function proxy.
 *
 * @param description - The lesson description or activity plan (e.g., "Math lesson about fractions with a 10 minute timer and a poll").
 * @returns A promise resolving to an array of widget configurations.
 * @throws Error if generation fails.
 */
export async function generateDashboardLayout(
  description: string
): Promise<GeneratedWidget[]> {
  const data = await callAI(
    { type: 'dashboard-layout', prompt: description },
    'Failed to generate layout. Please try again with a different description.'
  );

  if (!data.widgets || !Array.isArray(data.widgets)) {
    throw new Error('Invalid response format from AI');
  }

  if (data.widgets.length === 0) {
    throw new Error(
      "AI couldn't generate any widgets for this description. Please try a more specific lesson plan."
    );
  }

  // Validate widget types
  const validTypes = TOOLS.map((t) => t.type);
  const validWidgets = data.widgets.filter((w) => validTypes.includes(w.type));

  if (validWidgets.length === 0) {
    throw new Error('AI generated invalid widget types.');
  }

  return validWidgets;
}

export interface GeneratedQuiz {
  title: string;
  questions: GeneratedQuestion[];
}

/**
 * Generates a quiz based on a topic using a Firebase Function proxy.
 *
 * @param prompt - The topic or content for the quiz.
 * @returns A promise resolving to the generated quiz title and questions.
 * @throws Error if generation fails.
 */
export async function generateQuiz(prompt: string): Promise<GeneratedQuiz> {
  const data = await callAI(
    { type: 'quiz', prompt },
    'Failed to generate quiz. Please try again with a different prompt.'
  );

  if (
    !data.title ||
    !Array.isArray(data.questions) ||
    data.questions.length === 0
  ) {
    throw new Error(
      'Invalid response format from AI: quiz must have at least one question'
    );
  }

  return {
    title: data.title,
    questions: data.questions,
  };
}

/**
 * Generates timestamped multiple-choice questions from a YouTube video using
 * Gemini's multimodal video understanding.
 *
 * @param url - Full YouTube video URL.
 * @param questionCount - Desired number of questions (clamped 1–20 server-side).
 * @returns Generated activity title and questions with timestamps.
 * @throws Error if the video is private/restricted or generation fails.
 */
export async function generateVideoActivity(
  url: string,
  questionCount: number
): Promise<GeneratedVideoActivity> {
  try {
    const fn = httpsCallable<
      { url: string; questionCount: number },
      GeneratedVideoActivity
    >(functions, 'generateVideoActivity', {
      timeout: VIDEO_ACTIVITY_CALL_TIMEOUT_MS,
    });

    const result = await fn({ url, questionCount });

    if (
      !result.data.title ||
      !Array.isArray(result.data.questions) ||
      result.data.questions.length === 0
    ) {
      throw new Error(
        'Invalid response format from AI: activity must have at least one question'
      );
    }

    return result.data;
  } catch (error) {
    console.error('Video Activity Generation Error:', error);
    if (isFunctionsDeadlineExceededError(error)) {
      throw new Error(VIDEO_ACTIVITY_TIMEOUT_ERROR);
    }

    if (error instanceof Error) {
      throw error;
    }
    throw new Error(
      'Failed to generate video activity. Please try again with a different video.'
    );
  }
}

/**
 * Admin-gated fallback: uses Gemini multimodal audio understanding to generate
 * timestamped questions for videos that have no captions available.
 *
 * Only callable when the `video-activity-audio-transcription` feature permission
 * is enabled in Firestore and the user has admin access.
 *
 * @param url - Full YouTube video URL.
 * @param questionCount - Desired number of questions.
 */
export async function transcribeVideoWithGemini(
  url: string,
  questionCount: number
): Promise<GeneratedVideoActivity> {
  try {
    const fn = httpsCallable<
      { url: string; questionCount: number },
      GeneratedVideoActivity
    >(functions, 'transcribeVideoWithGemini', {
      timeout: VIDEO_ACTIVITY_CALL_TIMEOUT_MS,
    });

    const result = await fn({ url, questionCount });

    if (
      !result.data.title ||
      !Array.isArray(result.data.questions) ||
      result.data.questions.length === 0
    ) {
      throw new Error('Invalid response format from AI');
    }

    return result.data;
  } catch (error) {
    console.error('Audio Transcription Error:', error);
    if (isFunctionsDeadlineExceededError(error)) {
      throw new Error(VIDEO_ACTIVITY_TIMEOUT_ERROR);
    }
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Failed to transcribe video. Please try again.');
  }
}

// ─── Guided Learning Generation ───────────────────────────────────────────────

export interface GeneratedGuidedLearning {
  suggestedTitle: string;
  suggestedMode: GuidedLearningMode;
  steps: GuidedLearningStep[];
}

interface AIGuidedLearningResponse {
  suggestedTitle?: string;
  suggestedMode?: string;
  steps?: unknown[];
}

/**
 * Generates a complete guided learning experience from an image using Gemini.
 * Admin-only. Sends the image inline to the Cloud Function which calls Gemini.
 *
 * @param imageBase64 - Base64-encoded image data (no data URI prefix).
 * @param mimeType - MIME type of the image (e.g. 'image/jpeg').
 * @param prompt - Optional additional instructions for Gemini.
 */
export async function generateGuidedLearning(
  imageBase64: string,
  mimeType: string,
  prompt?: string
): Promise<GeneratedGuidedLearning> {
  try {
    const fn = httpsCallable<
      { imageBase64: string; mimeType: string; prompt?: string },
      AIGuidedLearningResponse
    >(functions, 'generateGuidedLearning');

    const result = await fn({ imageBase64, mimeType, prompt });
    const data = result.data;

    if (
      !data.suggestedTitle ||
      !Array.isArray(data.steps) ||
      data.steps.length === 0
    ) {
      throw new Error('Invalid response format from AI');
    }

    const validModes: GuidedLearningMode[] = [
      'structured',
      'guided',
      'explore',
    ];
    const suggestedMode: GuidedLearningMode = validModes.includes(
      data.suggestedMode as GuidedLearningMode
    )
      ? (data.suggestedMode as GuidedLearningMode)
      : 'structured';

    const validInteractionTypes: GuidedLearningInteractionType[] = [
      'text-popover',
      'tooltip',
      'audio',
      'video',
      'pan-zoom',
      'pan-zoom-spotlight',
      'spotlight',
      'question',
    ];

    const validatedSteps = data.steps
      .map((step, index) => {
        if (typeof step !== 'object' || step === null) return null;
        const s = step as Record<string, unknown>;
        const id =
          typeof s.id === 'string' && s.id.trim().length > 0
            ? s.id
            : `step-${index + 1}`;
        const xPct =
          typeof s.xPct === 'number'
            ? Math.max(0, Math.min(100, s.xPct))
            : null;
        const yPct =
          typeof s.yPct === 'number'
            ? Math.max(0, Math.min(100, s.yPct))
            : null;
        const interactionType =
          typeof s.interactionType === 'string' &&
          validInteractionTypes.includes(
            s.interactionType as GuidedLearningInteractionType
          )
            ? (s.interactionType as GuidedLearningInteractionType)
            : null;
        if (xPct === null || yPct === null || interactionType === null)
          return null;
        return {
          ...s,
          id,
          xPct,
          yPct,
          interactionType,
          imageIndex:
            typeof s.imageIndex === 'number' ? Math.max(0, s.imageIndex) : 0,
          showOverlay:
            s.showOverlay === 'popover' ||
            s.showOverlay === 'tooltip' ||
            s.showOverlay === 'banner'
              ? s.showOverlay
              : 'none',
        } as GuidedLearningStep;
      })
      .filter((s): s is GuidedLearningStep => s !== null);

    if (validatedSteps.length === 0) {
      throw new Error('AI returned no valid guided learning steps');
    }

    return {
      suggestedTitle: data.suggestedTitle,
      suggestedMode,
      steps: validatedSteps,
    };
  } catch (error) {
    console.error('Guided Learning Generation Error:', error);
    if (error instanceof Error) {
      if (error.message.includes('Invalid response format from AI')) {
        throw error;
      }
    }
    throw new Error(
      'Failed to generate guided learning experience. Please try again.'
    );
  }
}
