import type { AiInputKind, AiTier } from './aiModels';

// Every model call names one of these. Mirrored with labels in config/aiIntegrations.ts (aiIntegrationsParity test).
export const AI_INTEGRATIONS = {
  'mini-app': { tier: 'advanced', inputs: ['text'] },
  poll: { tier: 'standard', inputs: ['text'] },
  'dashboard-layout': { tier: 'standard', inputs: ['text'] },
  'instructional-routine': { tier: 'standard', inputs: ['text'] },
  quiz: { tier: 'standard', inputs: ['text'] },
  ocr: { tier: 'standard', inputs: ['image'] },
  'blooms-ai': { tier: 'standard', inputs: ['text'] },
  'video-activity-recommend': { tier: 'standard', inputs: ['text'] },
  'video-activity': { tier: 'standard', inputs: ['video'] },
  'video-transcription': { tier: 'standard', inputs: ['video'] },
  'guided-learning': { tier: 'advanced', inputs: ['image'] },
  'guided-learning-step-text': { tier: 'advanced', inputs: ['image'] },
  'plc-meeting-transcribe': { tier: 'advanced', inputs: ['audio'] },
  'plc-meeting-summary': { tier: 'advanced', inputs: ['text'] },
  'plc-goal-coach': { tier: 'standard', inputs: ['text'] },
  'quiz-document-import': { tier: 'standard', inputs: ['pdf', 'docx'] },
  'quiz-stimulus-ocr': { tier: 'standard', inputs: ['pdf', 'image'] },
  'paper-handwriting': { tier: 'standard', inputs: ['image'] },
  'quiz-translation': { tier: 'advanced', inputs: ['text'] },
  'response-translation': { tier: 'standard', inputs: ['text'] },
  'web-tour-writing': { tier: 'advanced', inputs: ['image'] },
  'flashcards-import': { tier: 'standard', inputs: ['text'] },
  'activity-wall-import': { tier: 'standard', inputs: ['text'] },
} as const satisfies Record<
  string,
  { tier: AiTier; inputs: readonly AiInputKind[] }
>;

export type AiIntegrationId = keyof typeof AI_INTEGRATIONS;

// The model an integration runs when the AI tab names none and lists it as allowed; absent = its tier's Gemini model. Mirrored in config/aiIntegrations.ts.
export const AI_INTEGRATION_DEFAULT_MODELS: Partial<
  Record<AiIntegrationId, string>
> = {
  'web-tour-writing': 'claude-sonnet-5-5',
};

// Never switched to Gemini on their own: no fallback, and no tier model unless the AI tab picks one. Mirrored in config/aiIntegrations.ts.
export const AI_INTEGRATIONS_WITHOUT_FALLBACK: ReadonlySet<AiIntegrationId> =
  new Set<AiIntegrationId>(['web-tour-writing']);

export const isAiIntegrationId = (id: string): id is AiIntegrationId =>
  Object.prototype.hasOwnProperty.call(AI_INTEGRATIONS, id);
