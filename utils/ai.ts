import { httpsCallable } from 'firebase/functions';
import { functions } from '@/config/firebase';
import { WidgetType, WidgetConfig, GridPosition } from '@/types';
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
  | 'quiz';

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
