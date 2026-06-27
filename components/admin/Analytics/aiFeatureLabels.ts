/**
 * Human-readable labels for Gemini feature IDs tracked in the `ai_usage`
 * Firestore collection.
 *
 * These IDs are defined in `GEMINI_SPECIFIC_FEATURES` in
 * `functions/src/adminAnalyticsCompute.ts`. When a new feature is added there,
 * add a corresponding entry here so admins see a friendly name in the AI
 * Feature Breakdown chart instead of the raw programmer-ID string.
 *
 * The fallback in AiPanel is: `AI_FEATURE_LABELS[feature] ?? feature`
 * (i.e., unlabelled features fall back to the raw key).
 */
export const AI_FEATURE_LABELS: Record<string, string> = {
  'smart-poll': 'Smart Poll',
  'embed-mini-app': 'Mini App',
  'video-activity-audio-transcription': 'Video Activity',
  quiz: 'Quiz Generation',
  ocr: 'OCR',
  'blooms-ai': "Bloom's AI",
  'video-activity-recommend': 'Video Recommendations',
  'dashboard-layout': 'Dashboard Layout AI',
  'instructional-routine': 'Instructional Routines AI',
  'widget-builder': 'Widget Builder AI',
  'widget-explainer': 'Widget Explainer AI',
};
