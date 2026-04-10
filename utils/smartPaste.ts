import { WidgetType, WidgetConfig } from '../types';
import { convertToEmbedUrl } from './urlHelpers';

export type PasteResult =
  | {
      action: 'create-widget';
      type: WidgetType;
      config: WidgetConfig;
      title?: string;
    }
  | { action: 'import-board'; url: string }
  | { action: 'create-mini-app'; html: string; title?: string }
  | { action: 'prompt-text-or-checklist'; text: string }
  | { action: 'prompt-url-or-qr'; url: string }
  | { action: 'import-quiz'; shareId: string };

/**
 * Detects the most appropriate paste action based on the provided text.
 * This can result in creating a widget, importing a board, or creating a mini app.
 *
 * @param text - The text content pasted by the user.
 * @returns A {@link PasteResult} describing the detected paste action, or null if the text does not map to any supported action.
 */
export function detectWidgetType(text: string): PasteResult | null {
  if (!text) return null;
  const trimmed = text.trim();
  if (!trimmed) return null;

  return (
    tryParseQuizImport(trimmed) ??
    tryParseBoardImport(trimmed) ??
    tryParseMiniApp(trimmed) ??
    tryParseUrlBasedWidgets(trimmed) ??
    tryParseChecklist(trimmed) ??
    createDefaultTextWidget(trimmed)
  );
}

function tryParseQuizImport(text: string): PasteResult | null {
  let candidate = text;
  if (!/^(http|https):\/\//i.test(candidate)) {
    const domainPattern = /^(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(?:[/:?].*)?$/;
    if (domainPattern.test(candidate)) {
      candidate = `https://${candidate}`;
    }
  }

  try {
    const url = new URL(candidate, window.location.origin);
    const match = url.pathname.match(/^\/share\/quiz\/([a-zA-Z0-9_-]+)$/);
    if (match) {
      return { action: 'import-quiz', shareId: match[1] };
    }
  } catch {
    // Fall through
  }
  return null;
}

function tryParseBoardImport(text: string): PasteResult | null {
  let candidate = text;
  // Add protocol for bare domains (e.g., "example.com/share/abc")
  const hasShareProtocol = /^(http|https):\/\//i.test(candidate);
  if (!hasShareProtocol) {
    const shareDomainLikePattern =
      /^(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(?:[/:?].*)?$/;
    if (shareDomainLikePattern.test(candidate)) {
      candidate = `https://${candidate}`;
    }
  }

  try {
    const url = new URL(candidate, window.location.origin);
    const protocol = url.protocol.toLowerCase();
    if (
      (protocol === 'http:' || protocol === 'https:') &&
      url.pathname.startsWith('/share/')
    ) {
      return {
        action: 'import-board',
        url: url.href,
      };
    }
  } catch {
    // If parsing fails, fall through
  }
  return null;
}

function tryParseMiniApp(text: string): PasteResult | null {
  if (/^\s*<[!a-z][\s\S]*>/i.test(text)) {
    // Extract title if present
    const titleMatch = text.match(/<title>(.*?)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : undefined;

    return {
      action: 'create-mini-app',
      html: text,
      title,
    };
  }
  return null;
}

function tryParseUrlBasedWidgets(text: string): PasteResult | null {
  let normalizedUrl = text;
  const hasProtocol = /^(http|https):\/\//i.test(normalizedUrl);
  if (!hasProtocol) {
    // Basic domain check: something.something with at least 2 chars TLD
    // and no spaces
    const domainLikePattern = /^(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(?:[/:?].*)?$/;
    if (domainLikePattern.test(normalizedUrl)) {
      normalizedUrl = `https://${normalizedUrl}`;
    }
  }

  // URL Detection
  const isUrl = /^(http|https):\/\/[^ "]+$/.test(normalizedUrl);

  if (!isUrl) return null;

  return (
    tryParseImageWidget(normalizedUrl) ??
    tryParseEmbedWidget(normalizedUrl) ?? {
      action: 'prompt-url-or-qr',
      url: normalizedUrl,
    }
  );
}

function tryParseImageWidget(url: string): PasteResult | null {
  if (/\.(png|jpg|jpeg|gif|webp|svg)(\?[^#]*)?(#.*)?$/i.test(url)) {
    return {
      action: 'create-widget',
      type: 'sticker',
      config: { url, rotation: 0 } as WidgetConfig,
    };
  }
  return null;
}

const EMBED_PROVIDERS =
  /(youtube\.com|youtu\.be|vimeo\.com|docs\.google\.com|drive\.google\.com\/(?:file\/d\/|open\?(?:.*&)?id=)|vids\.google\.com\/(?:u\/\d+\/)?vids\/)/;

function tryParseEmbedWidget(url: string): PasteResult | null {
  if (EMBED_PROVIDERS.test(url)) {
    return {
      action: 'create-widget',
      type: 'embed',
      config: {
        url: convertToEmbedUrl(url),
        mode: 'url',
      } as WidgetConfig,
    };
  }
  return null;
}

// Max character length per item to be considered "short/medium"
const CHECKLIST_ITEM_MAX_LENGTH = 250;
// Max character length per line to be considered short (for single-newline lists)
const CHECKLIST_LINE_MAX_LENGTH = 120;

function tryParseChecklist(text: string): PasteResult | null {
  // --- Case 1: Paragraph-separated items (blank lines between entries) ---
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  if (paragraphs.length >= 2) {
    const allShortMedium = paragraphs.every(
      (p) => p.length <= CHECKLIST_ITEM_MAX_LENGTH
    );
    if (allShortMedium) {
      // Paragraph-separated short/medium items → checklist
      return buildChecklistFromLines(
        // Flatten any internal newlines within a paragraph item
        paragraphs.map((p) => p.replace(/\n+/g, ' '))
      );
    }
    // Paragraph-separated but items are long prose → fall through to text widget
    return null;
  }

  // --- Case 2: Single-newline-separated lines (no blank lines) ---
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length >= 3) {
    const allShort = lines.every((l) => l.length <= CHECKLIST_LINE_MAX_LENGTH);
    if (allShort) {
      // Ambiguous: could be a list or text with line breaks — ask the user
      return { action: 'prompt-text-or-checklist', text };
    }
  }

  return null;
}

/** Builds a checklist PasteResult from an array of line strings. */
export function buildChecklistFromLines(lines: string[]): PasteResult {
  return {
    action: 'create-widget',
    type: 'checklist',
    config: {
      items: lines.map((line) => ({
        id: crypto.randomUUID(),
        text: line,
        completed: false,
      })),
      mode: 'manual',
    } as WidgetConfig,
  };
}

/** Builds a text widget PasteResult, safely encoding HTML entities. */
export function createDefaultTextWidget(text: string): PasteResult {
  return {
    action: 'create-widget',
    type: 'text',
    config: {
      content: text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br/>'),
      bgColor: '#fef3c7',
      fontSize: 18,
    } as WidgetConfig,
  };
}
