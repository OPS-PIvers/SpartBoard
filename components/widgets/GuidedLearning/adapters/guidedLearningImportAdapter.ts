/**
 * guidedLearningImportAdapter
 *
 * Implements `ImportAdapter<GuidedLearningSet>` for the shared ImportWizard.
 * Accepts self-contained `.gl.json` exports (file upload or pasted JSON):
 * the same envelope the Drive service writes, with slide media embedded as
 * base64 data URIs. Rehosting embedded media into the importing user's
 * Firebase Storage happens inside `deps.save` (Widget-owned persistence).
 */

import type { ReactNode } from 'react';
import type {
  ImportAdapter,
  ImportParseResult,
  ImportSourcePayload,
  ImportValidationResult,
} from '@/components/common/library/types';
import type { GuidedLearningSet } from '@/types';
import { parseGuidedLearningJson } from '../utils/glTransfer';

export interface GuidedLearningImportAdapterDeps {
  /** Persist a parsed set to the widget's library (rehosts media first). */
  save: (set: GuidedLearningSet, title: string) => Promise<void>;
  /** Renders a compact preview of the parsed set inside the wizard body. */
  renderPreview: (set: GuidedLearningSet) => ReactNode;
}

export async function parseGuidedLearningImport(
  source: ImportSourcePayload
): Promise<ImportParseResult<GuidedLearningSet>> {
  let text: string;
  if (source.kind === 'json') {
    text = source.text;
  } else if (source.kind === 'file') {
    text = await source.file.text();
  } else {
    throw new Error(
      `Guided Learning import only accepts .gl.json files. Got source kind: ${source.kind}.`
    );
  }
  const { set, warnings } = parseGuidedLearningJson(text);
  return { data: set, warnings };
}

export function validateGuidedLearningImport(
  data: GuidedLearningSet
): ImportValidationResult {
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
  if (Array.isArray(data.steps)) {
    const badStep = data.steps.find(
      (s) =>
        typeof s.xPct !== 'number' ||
        typeof s.yPct !== 'number' ||
        Number.isNaN(s.xPct) ||
        Number.isNaN(s.yPct)
    );
    if (badStep) {
      errors.push('Every step needs numeric xPct/yPct hotspot coordinates.');
    }
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Build the adapter. Taking a deps object keeps the presentational contract
 * decoupled from the widget's Firestore / Drive / Storage implementation.
 */
export function createGuidedLearningImportAdapter(
  deps: GuidedLearningImportAdapterDeps
): ImportAdapter<GuidedLearningSet> {
  return {
    widgetLabel: 'Guided Learning',
    supportedSources: ['json'],
    supportsJsonPaste: true,

    parse: parseGuidedLearningImport,

    validate: validateGuidedLearningImport,

    renderPreview: (data: GuidedLearningSet) => deps.renderPreview(data),

    suggestTitle: (data: GuidedLearningSet) => data.title?.trim() || undefined,

    save: (data: GuidedLearningSet, title: string) => deps.save(data, title),
  };
}
