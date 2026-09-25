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
import type { GuidedLearningSet, GuidedLearningStep } from '@/types';
import { parseGuidedLearningJson } from '../utils/glTransfer';
import { isValidCalloutBox, isValidCalloutStyle } from '../utils/calloutStyle';

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

const inPct = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100;
// Rounding slack for regions measured from pixel bounds, in image-%.
const EDGE_SLACK = 0.01;
const BBOX_SLACK = 0.5;

/** Same region and callout rules as the gl-author validator; true when the step's v3 geometry is usable. */
export function isValidStepGeometry(step: GuidedLearningStep): boolean {
  if (
    step.calloutPin !== undefined &&
    (!inPct(step.calloutPin?.xPct) || !inPct(step.calloutPin?.yPct))
  ) {
    return false;
  }
  const region = step.region;
  if (region === undefined) return true;
  if (!region || !['rect', 'ellipse', 'polygon'].includes(region.shape)) {
    return false;
  }
  const { wPct, hPct } = region;
  if (!inPct(wPct) || !inPct(hPct) || wPct === 0 || hPct === 0) return false;
  if (
    step.xPct - wPct / 2 < -EDGE_SLACK ||
    step.xPct + wPct / 2 > 100 + EDGE_SLACK ||
    step.yPct - hPct / 2 < -EDGE_SLACK ||
    step.yPct + hPct / 2 > 100 + EDGE_SLACK
  ) {
    return false;
  }
  if (
    region.cornerPct !== undefined &&
    (!inPct(region.cornerPct) || region.cornerPct > 50)
  ) {
    return false;
  }
  if (region.shape !== 'polygon') return region.points === undefined;
  const points = region.points;
  if (!Array.isArray(points) || points.length < 3 || points.length > 24) {
    return false;
  }
  if (points.some((p) => !inPct(p?.x) || !inPct(p?.y))) return false;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const [minX, maxX] = [Math.min(...xs), Math.max(...xs)];
  const [minY, maxY] = [Math.min(...ys), Math.max(...ys)];
  return (
    Math.abs((minX + maxX) / 2 - step.xPct) <= BBOX_SLACK &&
    Math.abs((minY + maxY) / 2 - step.yPct) <= BBOX_SLACK &&
    Math.abs(maxX - minX - wPct) <= BBOX_SLACK &&
    Math.abs(maxY - minY - hPct) <= BBOX_SLACK
  );
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
  } else if (data.imageUrls.some((u) => typeof u !== 'string')) {
    errors.push('Every entry in imageUrls must be a string URL.');
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
  if (!badCoords && data.steps.some((s) => !isValidStepGeometry(s))) {
    errors.push(
      'A step has a highlighted area or pinned callout outside the image. Fix it in the file and import again.'
    );
  }
  if (data.steps.some((s) => !isValidCalloutStyle(s))) {
    errors.push(
      'A step has a callout width (10 to 95), text size (0.75 to 2) or colour (dark, light or accent) out of range. Fix it in the file and import again.'
    );
  }
  if (data.steps.some((s) => !isValidCalloutBox(s.calloutBox))) {
    errors.push(
      'A step has a callout box with a missing or out-of-range number. Fix it in the file and import again.'
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
