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

const VALID_MODES = new Set(['structured', 'guided', 'explore']);

const VALID_INTERACTION_TYPES = new Set([
  'text-popover',
  'tooltip',
  'audio',
  'video',
  'pan-zoom',
  'pan-zoom-spotlight',
  'spotlight',
  'question',
]);

export function validateGuidedLearningImport(
  data: GuidedLearningSet
): ImportValidationResult {
  const errors: string[] = [];
  if (!data.title || data.title.trim() === '') {
    errors.push('Title is required.');
  }
  if (!Array.isArray(data.imageUrls) || data.imageUrls.length === 0) {
    errors.push('At least one image is required.');
  } else if (data.imageUrls.some((u) => typeof u !== 'string')) {
    errors.push('Every image URL must be a string.');
  } else if (data.imageUrls.some((u) => u.startsWith('blob:'))) {
    errors.push(
      'Slides use temporary blob: URLs that only work in the authoring browser. Re-export with embedded images.'
    );
  }
  if (!VALID_MODES.has(data.mode)) {
    errors.push('Mode must be "structured", "guided", or "explore".');
  }
  if (!Array.isArray(data.steps) || data.steps.length === 0) {
    errors.push('At least one step is required.');
    return { ok: false, errors };
  }
  if (data.steps.some((s) => s === null || typeof s !== 'object')) {
    errors.push('Every step must be an object — check the steps array.');
    return { ok: false, errors };
  }
  const ids = data.steps.map((s) => s.id);
  if (ids.some((id) => typeof id !== 'string' || id.trim() === '')) {
    errors.push('Every step needs a non-empty string id.');
  } else if (new Set(ids).size !== ids.length) {
    errors.push('Step ids must be unique.');
  }
  const badCoords = data.steps.some(
    (s) =>
      typeof s.xPct !== 'number' ||
      typeof s.yPct !== 'number' ||
      Number.isNaN(s.xPct) ||
      Number.isNaN(s.yPct) ||
      s.xPct < 0 ||
      s.xPct > 100 ||
      s.yPct < 0 ||
      s.yPct > 100
  );
  if (badCoords) {
    errors.push(
      'Every step needs numeric xPct/yPct hotspot coordinates between 0 and 100.'
    );
  }
  if (data.steps.some((s) => !VALID_INTERACTION_TYPES.has(s.interactionType))) {
    errors.push(
      'Every step needs a known interactionType (tooltip, text-popover, pan-zoom, spotlight, pan-zoom-spotlight, audio, video, or question).'
    );
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
