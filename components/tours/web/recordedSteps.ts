import type {
  GuidedLearningSet,
  GuidedLearningStep,
  WebTourAction,
  WebTourLocator,
  WebTourPicture,
  WebTourStableAttrs,
} from '@/types';
import { MAX_NOTE_CHARS, type RecordedWebStep } from './recorderProtocol';
import { scrubCapturedText, toHrefPattern, toUrlPattern } from './studentData';

const VERB: Record<WebTourAction, string> = {
  observe: 'Look at',
  click: 'Click',
  type: 'Type in',
  select: 'Choose from',
};

/** Drops icon-font glyphs (private-use characters) that show as boxes, and tidies spaces. */
export const withoutIconGlyphs = (s: string): string =>
  s
    .replace(/[\p{Co}\uFFFD]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** A starter step title from what was clicked; the admin rewrites it in the editor. */
export function draftLabel(
  action: WebTourAction,
  locator: WebTourLocator
): string {
  const name = withoutIconGlyphs(locator.name ?? '');
  const what = name || withoutIconGlyphs(locator.text ?? '');
  return what ? `${VERB[action]} ${what}` : VERB[action];
}

// The extension already scrubbed these; the page does it again rather than trust it.
export const scrubLocator = (l: WebTourLocator): WebTourLocator => {
  const out: WebTourLocator = { ...l };
  for (const key of ['name', 'text', 'heading', 'pageTitle'] as const) {
    const v = scrubCapturedText(l[key]);
    if (v) out[key] = v;
    else delete out[key];
  }
  const attrs: WebTourStableAttrs = {};
  for (const key of ['testId', 'ariaLabel', 'name'] as const) {
    const v = scrubCapturedText(l.attrs?.[key]);
    if (v) attrs[key] = v;
  }
  const href = l.attrs?.href ? toHrefPattern(l.attrs.href) : null;
  if (href) attrs.href = href;
  if (Object.keys(attrs).length) out.attrs = attrs;
  else delete out.attrs;
  if (out.frames)
    out.frames = out.frames.map((f) => ({
      ...f,
      urlPattern: toUrlPattern(f.urlPattern) ?? '*',
    }));
  return out;
};

/** A recorded click as a Guided Learning step with a web binding and no `tour`. */
export function toWebStep(
  recorded: Omit<RecordedWebStep, 'picture'>,
  picture?: WebTourPicture
): GuidedLearningStep {
  const locator = scrubLocator(recorded.locator);
  const note = scrubCapturedText(recorded.note, MAX_NOTE_CHARS);
  return {
    id: recorded.id,
    xPct: 50,
    yPct: 50,
    imageIndex: 0,
    interactionType: 'tooltip',
    label: draftLabel(recorded.action, locator),
    text: recorded.tip?.trim() ?? '',
    web: {
      urlPattern: toUrlPattern(recorded.urlPattern) ?? '*',
      action: recorded.action,
      locator,
      ...(picture ? { picture } : {}),
      ...(note ? { note } : {}),
    },
  };
}

/** Decodes a picture data URL from the extension; null unless it is a JPEG. */
export function pictureBlob(dataUrl: string): Blob | null {
  const prefix = 'data:image/jpeg;base64,';
  if (!dataUrl.startsWith(prefix)) return null;
  try {
    const bin = atob(dataUrl.slice(prefix.length));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: 'image/jpeg' });
  } catch {
    return null;
  }
}

/** A new, empty web tour draft. */
export function newWebTour(): GuidedLearningSet {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    title: 'Untitled web tour',
    imageUrls: [],
    steps: [],
    mode: 'tour',
    surface: 'web',
    createdAt: now,
    updatedAt: now,
  };
}
