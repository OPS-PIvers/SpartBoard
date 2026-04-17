/**
 * guidedLearningImportAdapter
 *
 * Guided Learning has no native import format (sheet / csv / json) — sets are
 * authored interactively in the editor or generated from an image via Gemini.
 * We still provide a contract-compliant `ImportAdapter<GuidedLearningSet>` so
 * the widget plugs into the shared library primitives.
 *
 * `supportedSources` is intentionally empty. `aiAssist` is declared, but the
 * admin-facing AI authoring flow is rendered by `GuidedLearningAIGenerator`
 * as a standalone dialog (required for image upload) — the wizard's
 * prompt-only slot is not used in practice for Guided Learning.
 */

import type {
  ImportAdapter,
  ImportParseResult,
  ImportSourcePayload,
  ImportValidationResult,
} from '@/components/common/library/types';
import type { GuidedLearningSet } from '@/types';

export interface GuidedLearningImportAdapterDeps {
  /** Persist a generated/imported set to the widget's library. */
  save: (set: GuidedLearningSet, title: string) => Promise<void>;
  /** Renders a compact preview of the parsed set inside the wizard body. */
  renderPreview: (set: GuidedLearningSet) => React.ReactNode;
}

const NO_NATIVE_IMPORT_MESSAGE =
  'Guided Learning has no file-based import format. Use the AI generator to create a new experience from an image.';

const NO_PROMPT_ONLY_AI_MESSAGE =
  'Guided Learning AI generation requires an image. Use the AI authoring dialog on the Library tab (admin only) to generate a new set.';

/**
 * Build the adapter. Taking a deps object keeps the presentational contract
 * decoupled from the widget's Firestore / Drive implementation.
 */
export function createGuidedLearningImportAdapter(
  deps: GuidedLearningImportAdapterDeps
): ImportAdapter<GuidedLearningSet> {
  return {
    widgetLabel: 'Guided Learning',
    // Guided Learning is authoring-only — no source-based import.
    supportedSources: [],

    parse: (
      _source: ImportSourcePayload
    ): Promise<ImportParseResult<GuidedLearningSet>> =>
      Promise.reject(new Error(NO_NATIVE_IMPORT_MESSAGE)),

    validate: (data: GuidedLearningSet): ImportValidationResult => {
      const errors: string[] = [];
      if (!data.title || data.title.trim() === '') {
        errors.push('Title is required.');
      }
      if (!Array.isArray(data.imageUrls) || data.imageUrls.length === 0) {
        errors.push('At least one image is required.');
      }
      if (!Array.isArray(data.steps) || data.steps.length === 0) {
        errors.push('At least one step is required.');
      }
      return { ok: errors.length === 0, errors };
    },

    renderPreview: (data: GuidedLearningSet) => deps.renderPreview(data),

    save: (data: GuidedLearningSet, title: string) => deps.save(data, title),

    aiAssist: {
      promptPlaceholder:
        'Describe the guided learning experience. (Image required via the Library AI dialog.)',
      generate: (_ctx: { prompt: string }): Promise<GuidedLearningSet> => {
        // The shared wizard's prompt-only signature can't carry an image.
        // The real flow lives in GuidedLearningAIGenerator (standalone).
        return Promise.reject(new Error(NO_PROMPT_ONLY_AI_MESSAGE));
      },
    },
  };
}
